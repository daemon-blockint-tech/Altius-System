/**
 * Production configuration helpers.
 *
 * Parses environment variables and instantiates real service clients
 * for production deployment. Dev mode uses in-memory stubs instead.
 */

import type { PostgresStorageConfig } from '@altius/storage-postgres';
import type { OpenFgaClientInterface, OidcAuthenticator } from '@altius/security';
import { AuthenticationError, AuthorizationService } from '@altius/security';
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
  const { OpenFgaClient } = await import('@openfga/sdk');
  const client = new OpenFgaClient({ apiUrl, storeId });
  return {
    check: (body) => client.check(body),
    listObjects: (body) => client.listObjects(body),
    writeTuples: (tuples) => client.writeTuples(tuples),
    deleteTuples: (tuples) => client.deleteTuples(tuples),
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
export interface ActionAuthzMapping {
  /** FGA relation to check (e.g., 'can_admit') */
  relation: string;
  /** FGA object type (e.g., 'patient') */
  objectType: string;
  /** Action parameter name that holds the object ID (e.g., 'patient') */
  objectIdParam: string;
}

export function createSecurityLayer(
  authz: AuthorizationService,
  actionMappings?: Map<string, ActionAuthzMapping>,
): SecurityLayer {
  return {
    async checkPermission(actor, actionType, params, _ctx) {
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
    if (isDev) {
      return {
        id: 'dev-user',
        name: 'Development User',
        email: 'dev@altius.local',
        roles: ['admin', 'clinician', 'nurse_in_charge', 'compliance_analyst', 'compliance_officer', 'bsa_officer', 'operator', 'governor', 'auditor'],
        groups: [],
        tenantId: 'default',
      };
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
 * change vs the latest registry version. 'warn' (default) records the version
 * and logs a warning; 'block' fails boot without recording the version.
 * Blank counts as unset (compose/Helm pass unset knobs through as '').
 */
export function parseSchemaBreakingPolicy(
  raw: string | undefined = process.env['SCHEMA_BREAKING_POLICY'],
): 'warn' | 'block' {
  const v = raw?.trim().toLowerCase();
  if (!v || v === 'warn') return 'warn';
  if (v === 'block') return 'block';
  throw new Error(`SCHEMA_BREAKING_POLICY: expected 'warn' or 'block', got '${raw}'`);
}

// ---------------------------------------------------------------------------
// Required env vars for production
// ---------------------------------------------------------------------------

export const REQUIRED_PROD_VARS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OPENFGA_URL',
  'OPENFGA_STORE_ID',
  'POSTGRES_URL',
] as const;
