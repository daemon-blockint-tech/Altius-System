/**
 * `resolveConsentPurpose` — the open-type contract, pinned.
 *
 * Three surfaces (the automation runner, the MCP tool layer, and the API's
 * DEFAULT_CONSENT_PURPOSE) each need to turn a configured purpose into the one
 * they check consent under. Two of them reimplemented it as
 * `configured in DataPurpose`, which tests membership of the five-key NHS
 * PRESET rather than of the open type. A deployment configuring its own
 * vocabulary — `KYC` for AML, say — had it silently replaced by DIRECT_CARE,
 * so the action ran, and was audited, under a purpose the subject was never
 * asked about. Nothing failed; the wrong consent record was simply consulted.
 *
 * These pin the contract stated on the type itself: any non-empty string is a
 * purpose. The deployment's vocabulary is validated once at boot against
 * CONSENT_PURPOSES, not re-derived per call site.
 */

import { describe, it, expect } from 'vitest';
import { DataPurpose, resolveConsentPurpose } from '../index.js';

describe('resolveConsentPurpose', () => {
  it('keeps a deployment-defined purpose that is not in the NHS preset', () => {
    // The regression: `'KYC' in DataPurpose` is false, so this used to
    // silently become DIRECT_CARE.
    expect(resolveConsentPurpose('KYC')).toBe('KYC');
    expect(resolveConsentPurpose('AML_MONITORING')).toBe('AML_MONITORING');
  });

  it('keeps a preset purpose unchanged', () => {
    expect(resolveConsentPurpose('RESEARCH')).toBe(DataPurpose.RESEARCH);
  });

  it('falls back to DIRECT_CARE only when nothing is configured', () => {
    expect(resolveConsentPurpose(undefined)).toBe(DataPurpose.DIRECT_CARE);
    expect(resolveConsentPurpose('')).toBe(DataPurpose.DIRECT_CARE);
    // Whitespace is not a purpose — it would otherwise reach the consent store
    // as a key that can never match a record, denying every check.
    expect(resolveConsentPurpose('   ')).toBe(DataPurpose.DIRECT_CARE);
  });

  it('trims, so a stray newline in an env var does not become a distinct purpose', () => {
    expect(resolveConsentPurpose(' KYC\n')).toBe('KYC');
  });
});
