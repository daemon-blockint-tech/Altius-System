/**
 * Production configuration helpers.
 *
 * Parses environment variables and instantiates real service clients
 * for production deployment. Dev mode uses in-memory stubs instead.
 */

import type { PostgresStorageConfig } from '@altius/storage-postgres';
import type { OpenFgaClientInterface, FgaClientResolver, OidcAuthenticator } from '@altius/security';
import { AuthenticationError, AuthorizationService, DEV_USER, devAuthBypassEnabled } from '@altius/security';
import type { SecurityLayer } from '@altius/actions';
import type { Request } from 'express';
import type { AuthenticatedUserInfo, ManifestRegistry } from './graphql/types.js';
import type { ParsedSchema } from '@altius/odl';
import { createLogger } from '@altius/observability';

const logger = createLogger('api-config');

// ---------------------------------------------------------------------------
// Postgres URL parsing
// ---------------------------------------------------------------------------

export function parsePostgresUrl(url: string): PostgresStorageConfig {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode') ?? u.searchParams.get('ssl');
  let ssl: PostgresStorageConfig['ssl'];
  if (sslmode && sslmode !== 'disable') {
    ssl = (sslmode === 'verify-full' || sslmode === 'verify-ca')
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }
  return {
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl,
  };
}

// ---------------------------------------------------------------------------
// OpenFGA client adapter
// ---------------------------------------------------------------------------

export async function createFgaClient(apiUrl: string, storeId: string): Promise<OpenFgaClientInterface> {
  // Dynamic import to avoid pulling @openfga/sdk in dev mode
  const { OpenFgaClient, CredentialsMethod } = await import('@openfga/sdk');

  // OpenFGA is the decision point for every ReBAC check on the platform: a
  // caller who can write tuples to it grants themselves any permission, and
  // Altius records nothing because the grant never passes through Altius.
  // Until this existed there was no way to point the gateway at an OpenFGA
  // that requires a credential — the SDK supports it, we simply never wired
  // it — so hardening the decision point meant patching source.
  //
  // Absent means unauthenticated, which is what a local compose stack runs.
  const token = process.env['OPENFGA_API_TOKEN']?.trim();
  const client = new OpenFgaClient({
    apiUrl,
    storeId,
    ...(token
      ? { credentials: { method: CredentialsMethod.ApiToken, config: { token } } }
      : {}),
  });
  return {
    check: (body) => client.check(body),
    listObjects: (body) => client.listObjects(body),
    writeTuples: (tuples) => client.writeTuples(tuples),
    deleteTuples: (tuples) => client.deleteTuples(tuples),
  };
}

// ---------------------------------------------------------------------------
// Per-tenant OpenFGA store mapping
// ---------------------------------------------------------------------------

/**
 * Resolve the tenant → OpenFGA store id mapping from the environment.
 *
 * One store per tenant. Tuples are written as bare `user:<id>` / `<type>:<id>`
 * with no tenant qualifier, and object ids are unique only per tenant (the
 * storage primary key is (_tenant_id, _id)). So with a single shared store, a
 * granter in tenant A minting `clinician` on `patient:123` also authorizes the
 * unrelated `patient:123` in tenant B. Separate stores mean the two tenants
 * share no namespace at all.
 *
 * Two shapes:
 *   OPENFGA_STORE_IDS='a=01H...,b=01J...'  — the general, multi-tenant form.
 *   OPENFGA_STORE_ID='01H...'              — single-tenant back-compat, legal
 *     ONLY when the deployment has named its one tenant via OIDC_DEFAULT_TENANT.
 *
 * That last condition is the guard that stops a MULTI-tenant deployment from
 * reaching the single-store path. server.ts already documents the convention:
 * single-tenant deployments set OIDC_DEFAULT_TENANT, multi-tenant deployments
 * leave it unset and map real tenants from the token's tenant_id claim. So an
 * unset OIDC_DEFAULT_TENANT plus a lone OPENFGA_STORE_ID is exactly the shared-
 * store configuration this split exists to remove — it fails boot rather than
 * booting into a cross-tenant read. Where OIDC_DEFAULT_TENANT is set but other
 * tenants do turn up, they map to no store and are denied: closed, not shared.
 *
 * Store ids must be distinct: pointing two tenants at one store re-creates the
 * shared namespace through the back door, so it is rejected here.
 *
 * Stores are NOT created on demand. The mapping is explicit configuration, which
 * keeps store-creation privilege out of the API process and avoids pods racing
 * to create the same tenant's store.
 */
export function parseFgaStoreMap(
  storeIds: string | undefined = process.env['OPENFGA_STORE_IDS'],
  storeId: string | undefined = process.env['OPENFGA_STORE_ID'],
  defaultTenant: string | undefined = process.env['OIDC_DEFAULT_TENANT'],
): Map<string, string> {
  // Blank counts as unset (compose/Helm pass unset knobs through as '').
  const multi = storeIds?.trim();
  if (multi) {
    const stores = new Map<string, string>();
    const tenantByStore = new Map<string, string>();
    for (const entry of multi.split(',')) {
      const pair = entry.trim();
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const tenant = eq > 0 ? pair.slice(0, eq).trim() : '';
      const store = eq > 0 ? pair.slice(eq + 1).trim() : '';
      if (!tenant || !store) {
        throw new Error(`OPENFGA_STORE_IDS: expected 'tenant=storeId' pairs, got '${pair}'`);
      }
      if (stores.has(tenant)) {
        throw new Error(`OPENFGA_STORE_IDS: tenant '${tenant}' is listed more than once`);
      }
      const shared = tenantByStore.get(store);
      if (shared) {
        throw new Error(
          `OPENFGA_STORE_IDS: tenants '${shared}' and '${tenant}' both map to store '${store}'. ` +
          `A shared store shares a tuple namespace, so a grant in one tenant would authorize ` +
          `the same object id in the other. Give each tenant its own store.`,
        );
      }
      tenantByStore.set(store, tenant);
      stores.set(tenant, store);
    }
    if (stores.size === 0) {
      throw new Error(`OPENFGA_STORE_IDS: no 'tenant=storeId' pairs found in '${storeIds}'`);
    }
    return stores;
  }

  const single = storeId?.trim();
  if (!single) {
    throw new Error('Authorization requires OPENFGA_STORE_IDS (tenant=storeId,...) or OPENFGA_STORE_ID');
  }
  const tenant = defaultTenant?.trim();
  if (!tenant) {
    throw new Error(
      `OPENFGA_STORE_ID alone is single-tenant configuration, but this deployment has not ` +
      `named its single tenant (OIDC_DEFAULT_TENANT is unset, which means tenants come from ` +
      `the token's tenant_id claim). Set OIDC_DEFAULT_TENANT to the one tenant this store ` +
      `serves, or set OPENFGA_STORE_IDS='tenantA=store1,tenantB=store2' to give each tenant ` +
      `its own store. One store shared across tenants lets a grant in one authorize the same ` +
      `object id in another.`,
    );
  }
  return new Map([[tenant, single]]);
}

/**
 * Build a tenant → FGA client resolver over an explicit store mapping.
 *
 * One client per tenant, created lazily and cached; unknown tenants resolve to
 * undefined so AuthorizationService fails closed. The pending promise (not the
 * settled client) is cached so concurrent first requests for a tenant share one
 * client rather than racing to build several; a failed creation is evicted so it
 * can be retried.
 */
export function createFgaClientRegistry(
  apiUrl: string,
  stores: ReadonlyMap<string, string>,
): FgaClientResolver {
  const clients = new Map<string, Promise<OpenFgaClientInterface>>();
  return async (tenantId: string) => {
    const storeId = stores.get(tenantId);
    if (!storeId) return undefined; // no store for this tenant → deny (never a default)
    let pending = clients.get(tenantId);
    if (!pending) {
      pending = createFgaClient(apiUrl, storeId).catch((err: unknown) => {
        clients.delete(tenantId);
        throw err;
      });
      clients.set(tenantId, pending);
    }
    return pending;
  };
}

// ---------------------------------------------------------------------------
// SecurityLayer bridge (authz -> action pipeline)
// ---------------------------------------------------------------------------

/**
 * Maps action names to FGA authorization checks.
 * Each entry defines the relation to check and how to derive the target object
 * from the action parameters.
 *
 * Example: AdmitPatient checks `can_admit` on `patient:<params.patient>`
 */
/**
 * Re-exported from @altius/odl, where the derivation that produces it lives
 * beside the generator that names the model's types. A local duplicate of the
 * shape invites a local duplicate of the derivation, which is the drift this
 * consolidation exists to end.
 */
import type { ActionAuthzMapping } from '@altius/odl';
export type { ActionAuthzMapping };

export function createSecurityLayer(
  authz: AuthorizationService,
  actionMappings?: Map<string, ActionAuthzMapping>,
): SecurityLayer {
  return {
    async checkPermission(actor, actionType, params, ctx) {
      const mapping = actionMappings?.get(actionType);
      if (mapping) {
        // Use domain-specific FGA check: relation on target object
        const objectId = params?.[mapping.objectIdParam] as string | undefined;
        if (!objectId) {
          // Fail closed: mapped action missing required target param → deny
          return { allowed: false };
        }
        const allowed = await authz.check(
          `user:${actor.id}`,
          mapping.relation,
          `${mapping.objectType}:${objectId}`,
          ctx.tenantId,
        );
        return { allowed };
      }
      // Unmapped actions have no ObjectType @param to ReBAC-authorize against
      // (e.g. creation actions like RegisterPatient). Authorization for these is
      // the manifest's CEL preconditions (role claims) — the next pipeline stage.
      // We allow at the ReBAC layer rather than checking `execute on
      // action:<type>` (which would fail closed without provisioned tuples and
      // make every object-less action permanently denied).
      return { allowed: true };
    },
  };
}

/**
 * Assert that every action the ReBAC layer cannot gate is gated by its manifest.
 *
 * createSecurityLayer (config.ts) returns `allowed: true` for any action with no
 * ObjectType @param — there is no instance to check a relation against, so a
 * creation action like RegisterPatient would otherwise be permanently denied.
 * The documented compensating control is the manifest's CEL preconditions, but
 * nothing enforced that they exist: an object-less action shipping zero
 * preconditions is executable by ANY authenticated user, silently.
 *
 * Fatal when there is no gate at all. Only a warning when preconditions exist but
 * none reference a role — those may be deliberate data-conditions, and the
 * `actor.hasRole(` test is a substring heuristic, not a CEL parse, so it must not
 * be able to make a valid deployment unbootable on its own.
 */
export function assertActionAuthzCoverage(
  schema: ParsedSchema,
  manifests: ManifestRegistry,
  mappings: Map<string, ActionAuthzMapping>,
  isDev: boolean,
): void {
  const ungated: string[] = [];
  const roleless: string[] = [];

  for (const action of schema.actionTypes) {
    if (mappings.has(action.name)) continue; // ReBAC-checked against its target

    const manifest = manifests.get(action.name);
    if (!manifest) continue; // missing manifests are already fatal in schema-loader

    if (manifest.preconditions.length === 0) {
      ungated.push(
        `${action.name} has no ObjectType @param and no preconditions — any authenticated caller can execute it`,
      );
    } else if (!manifest.preconditions.some((p: { expr: string }) => p.expr.includes('actor.hasRole('))) {
      roleless.push(
        `${action.name} has no ObjectType @param and no role-based precondition — its preconditions gate data, not the caller`,
      );
    }
  }

  const guidance =
    'Add a precondition such as "actor.hasRole(\'some_role\')" to the action manifest, ' +
    'or give the action an @param typed as an ObjectType so ReBAC can authorize it.';

  if (roleless.length > 0) {
    logger.warn(
      `Action authorization: these actions rely on preconditions that do not check the caller:\n` +
      `${roleless.map(w => `  - ${w}`).join('\n')}\n${guidance}`,
    );
  }

  if (ungated.length === 0) return;

  const detail = ungated.map(p => `  - ${p}`).join('\n');
  if (isDev) {
    logger.warn(
      `Action authorization gaps (allow-all stub in dev, but these WILL be open in production):\n${detail}\n${guidance}`,
    );
    return;
  }
  throw new Error(
    `FATAL: these actions have no authorization at any layer:\n${detail}\n${guidance}`,
  );
}

// ---------------------------------------------------------------------------
// Request authentication
// ---------------------------------------------------------------------------

export async function extractUser(
  req: Request,
  authenticator: OidcAuthenticator,
  isDev: boolean,
): Promise<AuthenticatedUserInfo> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // Opt-in, not merely "not production". `isDev` is
    // `NODE_ENV !== 'production'`, which is satisfied by the variable being
    // unset, misspelled or differently capitalised — and the api-gateway image
    // sets no default, so running a published release image with no
    // environment served this 9-role admin to any request with no
    // Authorization header. The MCP endpoint has always required a flag here;
    // this surface is now gated by the same function.
    if (isDev && devAuthBypassEnabled('ALTIUS_DEV_AUTH_BYPASS')) {
      return DEV_USER;
    }
    throw Object.assign(new Error('Authorization header required'), { status: 401 });
  }
  const token = authHeader.slice(7);
  try {
    return await authenticator.authenticate(token);
  } catch (err) {
    // AuthenticationError (invalid/expired token) should map to 401, not 500
    if (err instanceof AuthenticationError) {
      throw Object.assign(err, { status: 401 });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schema breaking-change policy
// ---------------------------------------------------------------------------

/**
 * SCHEMA_BREAKING_POLICY gates boot when the merged pack schema is a BREAKING
 * change vs the latest registry version. 'block' (default) fails boot without
 * recording the version; 'warn' records the version and logs a warning.
 * Blank counts as unset (compose/Helm pass unset knobs through as '').
 */
export function parseSchemaBreakingPolicy(
  raw: string | undefined = process.env['SCHEMA_BREAKING_POLICY'],
): 'warn' | 'block' {
  const v = raw?.trim().toLowerCase();
  if (!v || v === 'block') return 'block';
  if (v === 'warn') return 'warn';
  throw new Error(`SCHEMA_BREAKING_POLICY: expected 'warn' or 'block', got '${raw}'`);
}

// ---------------------------------------------------------------------------
// Non-durable platform services
// ---------------------------------------------------------------------------

/**
 * ALLOW_NON_DURABLE_SERVICES opts a Postgres deployment into the platform
 * services that still have no Postgres implementation. The set changes as
 * capabilities land, so it is not enumerated here — `nonDurableServices` in
 * server.ts is the list, and the gateway names its members at boot.
 *
 * Those services keep their state in process memory, which means it is lost on
 * restart and is NOT shared across replicas — behind a Deployment with more
 * than one pod, a write served by one pod is invisible to every other pod, so
 * reads are decided by whichever pod the load balancer picks. They are
 * therefore withheld by default whenever a Postgres pool is configured: each
 * route module already checks for its dep and does not register, so callers
 * get a clean 404 rather than a 200 that silently drops their data.
 *
 * Set this to 'true' to register them anyway — appropriate for exercising
 * those surfaces on a SINGLE-replica prod-test stack, never for real data.
 * Blank counts as unset (compose/Helm pass unset knobs through as '').
 */
export function parseAllowNonDurableServices(
  raw: string | undefined = process.env['ALLOW_NON_DURABLE_SERVICES'],
): boolean {
  const v = raw?.trim().toLowerCase();
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  throw new Error(`ALLOW_NON_DURABLE_SERVICES: expected 'true' or 'false', got '${raw}'`);
}

/**
 * Whether to wire the non-durable services described above.
 *
 * Without a Postgres pool memory is the only option and the deployment claims
 * nothing more, so they are always registered. With one, the deployment does
 * claim durability and they are registered only on an explicit opt-in.
 */
export function shouldRegisterNonDurableServices(
  hasPgPool: boolean,
  raw?: string | undefined,
): boolean {
  if (!hasPgPool) return true;
  return parseAllowNonDurableServices(raw);
}

// ---------------------------------------------------------------------------
// Required env vars for production
// ---------------------------------------------------------------------------

// The OpenFGA store configuration is deliberately NOT listed here: it is either
// OPENFGA_STORE_IDS or OPENFGA_STORE_ID, and parseFgaStoreMap already fails boot
// with a message naming which one is missing and why.
export const REQUIRED_PROD_VARS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OPENFGA_URL',
  'POSTGRES_URL',
] as const;
