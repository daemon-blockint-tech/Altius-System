import { describe, it, expect } from 'vitest';
import {
  TerminologySystem,
  FormatChecksumValidator,
  DEFAULT_TERMINOLOGY_VALIDATOR,
  validateNhsNumber,
  validateSnomedCt,
  validateOdsCode,
  validateDmd,
} from '../cdm/terminology.js';
import type { TerminologyValidator } from '../cdm/terminology.js';

describe('NHS Number — Modulus 11', () => {
  it('accepts valid NHS Numbers', () => {
    expect(validateNhsNumber('9434765919')).toEqual({ valid: true });
    expect(validateNhsNumber('4010232137')).toEqual({ valid: true });
  });

  it('strips spaces and hyphens before checking', () => {
    expect(validateNhsNumber('943 476 5919')).toEqual({ valid: true });
    expect(validateNhsNumber('943-476-5919')).toEqual({ valid: true });
  });

  it('rejects wrong check digit', () => {
    const r = validateNhsNumber('9434765918');
    expect(r.valid).toBe(false);
    expect(r.issue).toMatch(/check digit mismatch/);
  });

  it('rejects remainder-10 numbers (no valid check digit)', () => {
    // 1234567880: sum=208, 208 mod 11 = 10 → invalid
    const r = validateNhsNumber('1234567880');
    expect(r.valid).toBe(false);
    expect(r.issue).toMatch(/remainder is 10/);
  });

  it('rejects non-10-digit input', () => {
    expect(validateNhsNumber('123').valid).toBe(false);
    expect(validateNhsNumber('12345678901').valid).toBe(false);
    expect(validateNhsNumber('abc').valid).toBe(false);
    expect(validateNhsNumber('').valid).toBe(false);
  });
});

describe('SNOMED CT — format', () => {
  it('accepts 6–18 digit codes', () => {
    expect(validateSnomedCt('73211009')).toEqual({ valid: true });
    expect(validateSnomedCt('404684003')).toEqual({ valid: true });
    expect(validateSnomedCt('123456')).toEqual({ valid: true });
    expect(validateSnomedCt('123456789012345678')).toEqual({ valid: true }); // 18 digits
  });

  it('rejects too short / too long / non-numeric', () => {
    expect(validateSnomedCt('12345').valid).toBe(false); // 5 digits
    expect(validateSnomedCt('1234567890123456789').valid).toBe(false); // 19 digits
    expect(validateSnomedCt('abc123').valid).toBe(false);
  });
});

describe('ODS code — format', () => {
  it('accepts 3–5 uppercase alphanumeric', () => {
    expect(validateOdsCode('RTD')).toEqual({ valid: true });
    expect(validateOdsCode('8HT01')).toEqual({ valid: true });
    expect(validateOdsCode('A1B')).toEqual({ valid: true });
  });

  it('rejects lowercase, wrong length, special chars', () => {
    expect(validateOdsCode('rtd').valid).toBe(false);
    expect(validateOdsCode('RT').valid).toBe(false); // 2 chars
    expect(validateOdsCode('RTDEFG').valid).toBe(false); // 6 chars
    expect(validateOdsCode('RT-1').valid).toBe(false);
  });
});

describe('dm+d — format', () => {
  it('accepts 6–18 digit codes (SNOMED CT-based)', () => {
    expect(validateDmd('73211009')).toEqual({ valid: true });
    expect(validateDmd('123456')).toEqual({ valid: true });
  });

  it('rejects invalid format', () => {
    expect(validateDmd('12345').valid).toBe(false);
    expect(validateDmd('abc').valid).toBe(false);
  });
});

describe('FormatChecksumValidator', () => {
  const v = new FormatChecksumValidator();

  it('dispatches to the correct per-system validator', () => {
    expect(v.validate(TerminologySystem.NHS_NUMBER, '9434765919')).toEqual({ valid: true });
    expect(v.validate(TerminologySystem.SNOMED_CT, '73211009')).toEqual({ valid: true });
    expect(v.validate(TerminologySystem.ODS, 'RTD')).toEqual({ valid: true });
    expect(v.validate(TerminologySystem.DMD, '73211009')).toEqual({ valid: true });
  });

  it('treats absent values as valid (not a terminology error)', () => {
    expect(v.validate(TerminologySystem.NHS_NUMBER, undefined)).toEqual({ valid: true });
    expect(v.validate(TerminologySystem.NHS_NUMBER, null)).toEqual({ valid: true });
    expect(v.validate(TerminologySystem.NHS_NUMBER, '')).toEqual({ valid: true });
  });

  it('coerces non-string values to string before checking', () => {
    // A number-typed NHS Number should still validate.
    expect(v.validate(TerminologySystem.NHS_NUMBER, 9434765919)).toEqual({ valid: true });
  });

  it('returns a descriptive issue on failure', () => {
    const r = v.validate(TerminologySystem.NHS_NUMBER, '9434765918');
    expect(r.valid).toBe(false);
    expect(r.issue).toBeTruthy();
  });
});

describe('TerminologyValidator interface contract', () => {
  it('a custom validator can be injected (S1.2 extension point)', () => {
    const stub: TerminologyValidator = {
      validate: (_system, _value) => ({ valid: true }),
    };
    expect(stub.validate(TerminologySystem.SNOMED_CT, 'anything')).toEqual({ valid: true });
  });

  it('a custom validator can reject everything (fail-closed)', () => {
    const failClosed: TerminologyValidator = {
      validate: (_system, value) =>
        value === undefined || value === null || value === ''
          ? { valid: true }
          : { valid: false, issue: 'Remote terminology service unavailable.' },
    };
    expect(failClosed.validate(TerminologySystem.SNOMED_CT, '73211009').valid).toBe(false);
    expect(failClosed.validate(TerminologySystem.SNOMED_CT, undefined).valid).toBe(true);
  });
});

describe('DEFAULT_TERMINOLOGY_VALIDATOR', () => {
  it('is a FormatChecksumValidator instance', () => {
    expect(DEFAULT_TERMINOLOGY_VALIDATOR).toBeInstanceOf(FormatChecksumValidator);
  });
});
