/**
 * Two-sided proof that sensitive data (PII) does not leak into logs via
 * error messages.
 *
 * The leak path: a Postgres constraint violation (e.g. unique on nhs_number)
 * produces an error message like
 *   `duplicate key value violates unique constraint "patient_nhs_number_key"
 *    Key (nhs_number)=(1234567890) already exists.`
 * That message propagates through the SPI to `wrapErrorToRest`, which logs
 * `err.message` for system/timeout errors. The NHS number is PII.
 *
 * Two layers of defense:
 * 1. `wrapDatabaseError` at the storage boundary — catches known PG error
 *    codes and re-throws with a sanitized message (no row values).
 * 2. `redactErrorMessage` at the log site — strips `Key (col)=(value)`
 *    patterns from any message that still reaches the log.
 *
 * This test proves both layers work: the wrapper produces a value-free
 * message, and the redactor strips values from a raw DB message that
 * bypasses the wrapper.
 */
import { describe, it, expect } from 'vitest';
import { redactErrorMessage } from '../rest/errors.js';
import { wrapDatabaseError } from '@altius/storage-postgres';

describe('sensitive log redaction — DB error messages', () => {
  describe('redactErrorMessage (defense-in-depth at log site)', () => {
    it('strips the value from a Key (col)=(value) pattern', () => {
      const raw = 'duplicate key value violates unique constraint "patient_nhs_number_key" Key (nhs_number)=(1234567890) already exists.';
      const redacted = redactErrorMessage(raw);
      expect(redacted).toContain('nhs_number');
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('1234567890');
    });

    it('strips values from composite key patterns', () => {
      const raw = 'Key (tenant_id, nhs_number)=(abc, 1234567890) already exists.';
      const redacted = redactErrorMessage(raw);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('1234567890');
      expect(redacted).not.toContain('abc');
    });

    it('leaves non-DB error messages untouched', () => {
      const raw = 'Object Patient:abc-123 not found or is deleted';
      expect(redactErrorMessage(raw)).toBe(raw);
    });

    it('handles messages without Key patterns', () => {
      const raw = 'connection refused';
      expect(redactErrorMessage(raw)).toBe(raw);
    });
  });

  describe('wrapDatabaseError (storage boundary)', () => {
    it('wraps a unique violation (23505) with a sanitized message and ALREADY_EXISTS code', async () => {
      const pgError = Object.assign(new Error('duplicate key value violates unique constraint "patient_nhs_number_key"'), {
        code: '23505',
        detail: 'Key (nhs_number)=(1234567890) already exists.',
        constraint: 'patient_nhs_number_key',
      });

      const fn = async () => { throw pgError; };

      try {
        await wrapDatabaseError(fn, { type: 'Patient', operation: 'create' });
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as Error & { code: string };
        expect(e.code).toBe('ALREADY_EXISTS');
        expect(e.message).toContain('Patient');
        expect(e.message).toContain('nhs_number');
        expect(e.message).not.toContain('1234567890');
        expect(e.message).toContain('already exists');
      }
    });

    it('wraps a check violation (23514) with a sanitized message and VALIDATION_ERROR code', async () => {
      const pgError = Object.assign(new Error('new row for relation "patient" violates check constraint'), {
        code: '23514',
        detail: 'Failing row contains (1234567890, John Smith).',
        constraint: 'patient_status_check',
      });

      const fn = async () => { throw pgError; };

      try {
        await wrapDatabaseError(fn, { type: 'Patient', operation: 'create' });
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as Error & { code: string };
        expect(e.code).toBe('VALIDATION_ERROR');
        expect(e.message).not.toContain('1234567890');
        expect(e.message).not.toContain('John Smith');
        expect(e.message).toContain('patient_status_check');
      }
    });

    it('passes through errors with unknown PG codes unchanged', async () => {
      const pgError = Object.assign(new Error('syntax error at or near "FROM"'), { code: '42601' });
      const fn = async () => { throw pgError; };

      try {
        await wrapDatabaseError(fn, { type: 'Patient', operation: 'create' });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as Error).message).toBe('syntax error at or near "FROM"');
      }
    });

    it('passes through non-PG errors unchanged', async () => {
      const genericError = new Error('network timeout');
      const fn = async () => { throw genericError; };

      try {
        await wrapDatabaseError(fn, { type: 'Patient', operation: 'create' });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as Error).message).toBe('network timeout');
      }
    });

    it('returns the result on success', async () => {
      const fn = async () => 'ok';
      const result = await wrapDatabaseError(fn, { type: 'Patient', operation: 'create' });
      expect(result).toBe('ok');
    });
  });
});
