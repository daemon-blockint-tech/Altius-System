/**
 * Open consent-purpose vocabulary E2E (v0.2.0 Epic C).
 *
 * `DataPurpose` is an open string type: the recordable consent vocabulary is a
 * deployment policy (env CONSENT_PURPOSES), not a hardcoded NHS preset. The
 * consent-record router validates a posted purpose against
 * (deps.consentPurposes ?? STANDARD_DATA_PURPOSES), and the default purpose for
 * a body that omits one comes from DEFAULT_CONSENT_PURPOSE.
 *
 * This boots a gateway with a NON-NHS vocabulary (CONSENT_PURPOSES=
 * KYC,AML_MONITORING, DEFAULT_CONSENT_PURPOSE=KYC) and asserts end-to-end that:
 *   - a purpose in the configured vocabulary is recorded (200),
 *   - a purpose OUTSIDE it (the NHS DIRECT_CARE) is rejected (400 INVALID_PURPOSE),
 *   - a body omitting purpose falls back to DEFAULT_CONSENT_PURPOSE (KYC).
 *
 * The unit suite covers the router validation in isolation; this proves the env
 * wiring (CONSENT_PURPOSES / DEFAULT_CONSENT_PURPOSE → ApiDependencies) is live.
 *
 * DESTRUCTIVE + ISOLATED: it owns the Docker stack lifecycle (boots a gateway
 * with a custom consent vocabulary on the same ports), so it is gated behind
 * CONSENT_VOCAB_E2E=1 and must be run on its OWN — never alongside the standard
 * integration suite. After it completes the stack is DOWN; bring the normal dev
 * stack back up before running the rest of the suite. Run with, e.g.:
 *
 *   CONSENT_VOCAB_E2E=1 pnpm --filter @altius/integration-tests exec \
 *     vitest run open-consent-vocab
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerAvailable } from './setup.js';
import { waitForEndpoint } from './docker.js';
import { CONFIG } from './config.js';

const ENABLED = process.env['CONSENT_VOCAB_E2E'] === '1';
const describeMaybe = dockerAvailable && ENABLED ? describe : describe.skip;

// Base compose only (no -p → project "orion", matching the standard harness so
// `down -v` cleans whatever stack is up and `up` claims the same host ports).
const COMPOSE_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../Orion/docker-compose.yaml',
);

/**
 * Run a docker compose command without blocking the event loop.
 *
 * This was execSync. A `down -v` over the full stack holds the thread for
 * seconds, and while it is held the worker cannot answer vitest's reporter
 * RPC — `onTaskUpdate` then times out and is raised as an unhandled error, so
 * the job exits 1 over a suite that passed. See the same note in
 * security-enforcement.test.ts, where it actually bit.
 */
async function run(cmd: string, env?: Record<string, string>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`Command failed with exit code ${code}: ${cmd}`)),
    );
  });
}

async function compose(cmd: string, env?: Record<string, string>): Promise<void> {
  await run(`docker compose -f "${COMPOSE_FILE}" ${cmd}`, env);
}

const HEALTH_URL = `${CONFIG.apiBaseUrl}/.well-known/apollo/server-health`;
const CONSENT_URL = `${CONFIG.restBaseUrl}/consent`;

interface ConsentResponse {
  data?: { subject: string; purpose: string; decision: string; recorded: boolean };
  error?: { code: string; category: string; message: string };
}

async function postConsent(body: Record<string, unknown>): Promise<{ status: number; json: ConsentResponse }> {
  const res = await fetch(CONSENT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as ConsentResponse };
}

describeMaybe('open consent-purpose vocabulary (non-NHS deployment)', () => {
  beforeAll(async () => {
    await compose('down -v --remove-orphans');
    await compose('up -d --wait', {
      CONSENT_PURPOSES: 'KYC,AML_MONITORING',
      DEFAULT_CONSENT_PURPOSE: 'KYC',
    });
  }, 600_000);

  afterAll(async () => {
    await compose('down -v --remove-orphans');
  });

  it('boots and serves health', async () => {
    await waitForEndpoint(HEALTH_URL, 60, 3_000);
    const res = await fetch(HEALTH_URL);
    expect(res.status).toBe(200);
  });

  it('records a consent decision for a purpose in the configured vocabulary', async () => {
    const { status, json } = await postConsent({
      subject: 'customer-1',
      purpose: 'KYC',
      decision: 'GRANT',
    });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({
      subject: 'customer-1',
      purpose: 'KYC',
      decision: 'GRANT',
      recorded: true,
    });
  });

  it('records a second configured purpose with a DENY decision', async () => {
    const { status, json } = await postConsent({
      subject: 'customer-1',
      purpose: 'AML_MONITORING',
      decision: 'DENY',
    });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ purpose: 'AML_MONITORING', decision: 'DENY', recorded: true });
  });

  it('rejects a purpose outside the configured vocabulary (the NHS DIRECT_CARE)', async () => {
    const { status, json } = await postConsent({
      subject: 'customer-1',
      purpose: 'DIRECT_CARE',
      decision: 'GRANT',
    });
    expect(status).toBe(400);
    expect(json.error?.code).toBe('INVALID_PURPOSE');
    // The error lists the configured vocabulary, not the NHS preset.
    expect(json.error?.message).toContain('KYC');
    expect(json.error?.message).toContain('AML_MONITORING');
  });

  it('falls back to DEFAULT_CONSENT_PURPOSE when the body omits purpose', async () => {
    const { status, json } = await postConsent({
      subject: 'customer-2',
      decision: 'GRANT',
    });
    expect(status).toBe(200);
    // DEFAULT_CONSENT_PURPOSE=KYC was applied, not the platform DIRECT_CARE.
    expect(json.data?.purpose).toBe('KYC');
    expect(json.data?.recorded).toBe(true);
  });
});
