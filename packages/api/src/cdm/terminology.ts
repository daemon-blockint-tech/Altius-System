/**
 * Terminology validation for CDM projection (Stage 1 item S1.0).
 *
 * Deterministic format + checksum validation for NHS terminology identifiers.
 * No external lookups, no bundled code lists. The {@link TerminologyValidator}
 * interface is the extension point for S1.2, which adds a remote terminology
 * service validator (FHIR `$validate` against the NHS Terminology Server).
 *
 * Only systems with a deterministic check appear here. Fields that are local
 * enums or free text (triageCategory, destination, reason, specialty) are NOT
 * terminology-coded and are not annotated — the gap register documents that
 * they should be terminology-coded in S2.2.
 */

/** NHS terminology systems with deterministic format or checksum rules. */
export enum TerminologySystem {
  /** NHS Number — 10 digits, Modulus 11 checksum (NHS Data Dictionary). */
  NHS_NUMBER = 'NHS_NUMBER',
  /** SNOMED CT — 6–18 digit identifier (IHTSDO). */
  SNOMED_CT = 'SNOMED_CT',
  /** ODS code — 3–5 uppercase alphanumeric (NHS Digital). */
  ODS = 'ODS',
  /** dm+d — SNOMED CT-based identifier format (NHS BSA). */
  DMD = 'DMD',
}

/** A terminology validation issue surfaced in CDM record provenance. */
export interface TerminologyIssue {
  /** CDM field name that failed validation. */
  field: string;
  /** Terminology system the value was checked against. */
  system: TerminologySystem;
  /** The invalid value as projected. */
  value: string;
  /** Human-readable description of the failure. */
  issue: string;
}

/** Result of validating a single field value. */
export interface TerminologyValidationResult {
  /** True when the value is valid (or empty — absent values are not flagged). */
  valid: boolean;
  /** Populated only when `valid` is false. */
  issue?: string;
}

/**
 * Validates a field value against a terminology system.
 *
 * Implementations must be deterministic and must not perform I/O. Absent
 * values (`undefined`, `null`, empty string) are treated as valid — the CDM
 * projection omits absent optional fields before validation, and a missing
 * value is not a terminology error.
 */
export interface TerminologyValidator {
  /**
   * @param system Terminology system to validate against.
   * @param value  The projected field value (string or string-coercible).
   * @returns Validation result; `valid: true` for absent values.
   */
  validate(system: TerminologySystem, value: unknown): TerminologyValidationResult;
}

/**
 * Deterministic format + checksum validator.
 *
 * This is the S1.0 default. S1.2 injects a `RemoteTerminologyServiceValidator`
 * that delegates to the NHS Terminology Server for membership validation;
 * format + checksum is still run first to reject malformed input cheaply.
 */
export class FormatChecksumValidator implements TerminologyValidator {
  validate(system: TerminologySystem, value: unknown): TerminologyValidationResult {
    if (value === undefined || value === null) return { valid: true };
    const str = String(value);
    if (str === '') return { valid: true };

    switch (system) {
      case TerminologySystem.NHS_NUMBER:
        return validateNhsNumber(str);
      case TerminologySystem.SNOMED_CT:
        return validateSnomedCt(str);
      case TerminologySystem.ODS:
        return validateOdsCode(str);
      case TerminologySystem.DMD:
        return validateDmd(str);
      default:
        return { valid: false, issue: `Unknown terminology system: ${system}` };
    }
  }
}

/** Default validator instance used when none is injected. */
export const DEFAULT_TERMINOLOGY_VALIDATOR = new FormatChecksumValidator();

// --- Per-system format functions ---

/**
 * NHS Number Modulus 11 check (NHS Data Dictionary).
 *
 * 10 digits; weights [10,9,8,7,6,5,4,3,2] on the first 9; the 10th digit is
 * `(11 − (weightedSum mod 11)) mod 11`. A remainder of 10 means no valid check
 * digit exists, so the number is invalid.
 */
export function validateNhsNumber(value: string): TerminologyValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, issue: 'NHS Number must be 10 digits.' };
  }
  const digits = cleaned.split('').map(Number);
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i]! * weights[i]!;
  }
  const remainder = sum % 11;
  if (remainder === 10) {
    return { valid: false, issue: 'NHS Number Modulus 11 remainder is 10 — no valid check digit.' };
  }
  const checkDigit = (11 - remainder) % 11;
  if (checkDigit !== digits[9]) {
    return { valid: false, issue: `NHS Number Modulus 11 check digit mismatch (expected ${checkDigit}, got ${digits[9]}).` };
  }
  return { valid: true };
}

/** SNOMED CT identifier format: 6–18 digits (IHTSDO). */
export function validateSnomedCt(value: string): TerminologyValidationResult {
  if (!/^\d{6,18}$/.test(value)) {
    return { valid: false, issue: 'SNOMED CT code must be 6–18 digits.' };
  }
  return { valid: true };
}

/** ODS code format: 3–5 uppercase alphanumeric (NHS Digital). */
export function validateOdsCode(value: string): TerminologyValidationResult {
  if (!/^[A-Z0-9]{3,5}$/.test(value)) {
    return { valid: false, issue: 'ODS code must be 3–5 uppercase alphanumeric characters.' };
  }
  return { valid: true };
}

/** dm+d identifier format: SNOMED CT-based 6–18 digits (NHS BSA). */
export function validateDmd(value: string): TerminologyValidationResult {
  if (!/^\d{6,18}$/.test(value)) {
    return { valid: false, issue: 'dm+d code must be 6–18 digits.' };
  }
  return { valid: true };
}
