/**
 * SqlQueryService conformance — the same assertions against every provider.
 *
 * Unlike most categories here, this one is not mainly about storage. A SQL
 * query service that stores its jobs perfectly and *evaluates* differently on
 * the two providers is the worse of the two failures: the same statement over
 * the same rows would return different answers on dev and prod, and neither
 * deployment would look broken. So the assertions are weighted toward what a
 * query means — filters, ordering, projection, LIMIT, joins — not just toward
 * the job record round-tripping.
 *
 * Execution is shared code in @altius/spi, which is half the guarantee. This is
 * the half that checks both providers are wired to it over a real dataset
 * service: the factory supplies the datasets too, and the rows a query returns
 * have to be rows something actually wrote.
 */

import { describe, it, expect, vi } from 'vitest';
import type { DatasetService, SqlQueryService, RequestContext } from '@altius/spi';

export interface SqlQueryPair {
  sql: SqlQueryService;
  datasets: DatasetService;
}

export type SqlQueryFactory = () => SqlQueryPair | Promise<SqlQueryPair>;

const PATIENTS = [
  { id: 'p1', name: 'Ada', age: 36, ward: 'A' },
  { id: 'p2', name: 'Bea', age: 51, ward: 'B' },
  { id: 'p3', name: 'Cai', age: 44, ward: 'A' },
];

const WARDS = [
  { ward: 'A', wardName: 'Cardiology' },
  { ward: 'B', wardName: 'Oncology' },
];

export function registerSqlQueryTests(providerName: string, factory: SqlQueryFactory): void {
  describe(`[${providerName}] SPI Conformance: SqlQueryService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches — and its own dataset names,
    // since the two providers namespace datasets differently.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_sql_${label}_${counter++}`, actorId: 'u1' });

    /** Create `patients` (and optionally `wards`) in a fresh tenant. */
    async function seeded(label: string, withWards = false): Promise<{ sql: SqlQueryService; ctx: RequestContext }> {
      const { sql, datasets } = await factory();
      const ctx = ctxFor(label);
      await datasets.create(ctx, {
        name: 'patients',
        schema: {
          columns: [
            { name: 'id', type: 'string', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'age', type: 'integer', nullable: false },
            { name: 'ward', type: 'string', nullable: false },
          ],
          primaryKey: ['id'],
          version: 1,
        },
      });
      await datasets.insert(ctx, 'patients', { rows: PATIENTS });
      if (withWards) {
        await datasets.create(ctx, {
          name: 'wards',
          schema: {
            columns: [
              { name: 'ward', type: 'string', nullable: false },
              { name: 'wardName', type: 'string', nullable: false },
            ],
            primaryKey: ['ward'],
            version: 1,
          },
        });
        await datasets.insert(ctx, 'wards', { rows: WARDS });
      }
      return { sql, ctx };
    }

    describe('running a query', () => {
      it('reads rows that were actually written', async () => {
        // The point of taking a real dataset service: a query service that
        // invented rows, or read from somewhere else, would pass a
        // job-round-trip assertion and fail this one.
        const { sql, ctx } = await seeded('select');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients' });
        expect(job.state).toBe('succeeded');
        expect(job.rowCount).toBe(3);
        expect(job.rows!.map(r => r['name']).sort()).toEqual(['Ada', 'Bea', 'Cai']);
        expect(job.submittedBy).toBe('u1');
        expect(job.sql).toBe('SELECT * FROM patients');
        expect(job.completedAt).toBeTruthy();
      });

      it('pushes a WHERE clause down', async () => {
        const { sql, ctx } = await seeded('where');
        const job = await sql.submit(ctx, { sql: "SELECT * FROM patients WHERE ward = 'A'" });
        expect(job.rowCount).toBe(2);
        expect(job.rows!.every(r => r['ward'] === 'A')).toBe(true);
      });

      it('evaluates a comparison operator', async () => {
        const { sql, ctx } = await seeded('gt');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients WHERE age > 40' });
        expect(job.rows!.map(r => r['name']).sort()).toEqual(['Bea', 'Cai']);
      });

      it('projects the named columns and reports them', async () => {
        const { sql, ctx } = await seeded('project');
        const job = await sql.submit(ctx, { sql: 'SELECT name, age FROM patients' });
        expect(job.resultColumns).toEqual(['name', 'age']);
        expect(Object.keys(job.rows![0]!).sort()).toEqual(['age', 'name']);
      });

      it('orders rows', async () => {
        const { sql, ctx } = await seeded('order');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients ORDER BY age DESC' });
        expect(job.rows!.map(r => r['age'])).toEqual([51, 44, 36]);
      });

      it('applies a LIMIT from the statement', async () => {
        const { sql, ctx } = await seeded('limit');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients ORDER BY age ASC LIMIT 2' });
        expect(job.rowCount).toBe(2);
        expect(job.rows!.map(r => r['age'])).toEqual([36, 44]);
      });

      it("lets the statement's LIMIT win over the request's", async () => {
        // The caller wrote it into the SQL, so it is the more specific of the
        // two — and both providers have to agree on which one wins.
        const { sql, ctx } = await seeded('limit_precedence');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients LIMIT 1', limit: 3 });
        expect(job.rowCount).toBe(1);
      });

      it('applies the request limit when the statement has none', async () => {
        const { sql, ctx } = await seeded('limit_input');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients', limit: 2 });
        expect(job.rowCount).toBe(2);
      });

      it('joins two datasets', async () => {
        const { sql, ctx } = await seeded('join', true);
        const job = await sql.submit(ctx, {
          sql: 'SELECT * FROM patients JOIN wards ON patients.ward = wards.ward',
        });
        expect(job.state).toBe('succeeded');
        expect(job.rowCount).toBe(3);
        const names = job.rows!.map(r => r['wardName']).sort();
        expect(names).toEqual(['Cardiology', 'Cardiology', 'Oncology']);
      });

      it('reports no columns for an empty result rather than the schema', async () => {
        // `SELECT *` takes its columns from the first row, so there are none
        // when there are no rows. Stated because it is surprising, and because
        // both providers have to be surprising in the same way.
        const { sql, ctx } = await seeded('empty');
        const job = await sql.submit(ctx, { sql: "SELECT * FROM patients WHERE ward = 'Z'" });
        expect(job.state).toBe('succeeded');
        expect(job.rowCount).toBe(0);
        expect(job.resultColumns).toEqual([]);
      });
    });

    describe('failure is recorded, not thrown', () => {
      it('records a parse failure on the job', async () => {
        const { sql, ctx } = await seeded('parse_fail');
        const job = await sql.submit(ctx, { sql: 'DELETE FROM patients' });
        expect(job.state).toBe('failed');
        expect(job.errorMessage).toMatch(/only select/i);
        expect(job.rows).toBeUndefined();
      });

      it('records an unknown dataset as a failed job', async () => {
        const { sql, ctx } = await seeded('missing_table');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM no_such_dataset' });
        expect(job.state).toBe('failed');
        expect(job.errorMessage).toBeTruthy();
      });

      it('returns no rows from results() for a failed job', async () => {
        const { sql, ctx } = await seeded('failed_results');
        const job = await sql.submit(ctx, { sql: 'DELETE FROM patients' });
        expect(await sql.results(ctx, job.id)).toEqual([]);
      });
    });

    describe('the job record', () => {
      it('reads a job back by id', async () => {
        const { sql, ctx } = await seeded('get');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients' });
        const found = await sql.get(ctx, job.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(job.id);
        expect(found!.state).toBe('succeeded');
        expect(found!.rowCount).toBe(3);
        expect(found!.resultColumns).toEqual(job.resultColumns);
      });

      it('returns null for an unknown job id', async () => {
        const { sql } = await factory();
        expect(await sql.get(ctxFor('missing'), 'no-such-job')).toBeNull();
      });

      it('fetches results separately from the job', async () => {
        const { sql, ctx } = await seeded('results');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients ORDER BY age ASC' });
        const rows = await sql.results(ctx, job.id);
        expect(rows).toHaveLength(3);
        expect(rows[0]!['name']).toBe('Ada');
        expect(await sql.results(ctx, job.id, 2)).toHaveLength(2);
      });

      it('lists jobs newest first', async () => {
        const { sql, ctx } = await seeded('list');
        const first = await sql.submit(ctx, { sql: 'SELECT * FROM patients' });
        const second = await sql.submit(ctx, { sql: 'SELECT name FROM patients' });
        const listed = await sql.list(ctx);
        expect(listed.map(j => j.id)).toEqual([second.id, first.id]);
        expect(await sql.list(ctx, 1)).toHaveLength(1);
      });

      it('still lists jobs newest first when submission timestamps collide', async () => {
        // The case above passes on a provider ordering by `submittedAt` alone,
        // because two round-trips to Postgres land in two different
        // milliseconds. That is luck, not a contract: a millisecond timestamp
        // is not a total order, two jobs submitted in the same one compare
        // equal, and the sort degenerates to whatever order the rows arrive in.
        //
        // Freezing the clock removes the luck. Both providers stamp
        // `submittedAt` from `new Date()` in this process, so with Date faked
        // both jobs carry the identical timestamp and only a real tiebreak — a
        // sequence in Postgres, insertion order in memory — still returns them
        // newest-first.
        //
        // Only Date is faked: faking timers as well would stall the pg driver's
        // own scheduling and hang the query.
        const { sql, ctx } = await seeded('list_tie');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
        try {
          const submitted = [];
          for (let i = 0; i < 4; i++) {
            submitted.push(await sql.submit(ctx, { sql: `SELECT * FROM patients LIMIT ${i + 1}` }));
          }
          expect(new Set(submitted.map(j => j.submittedAt)).size).toBe(1);
          const expected = submitted.map(j => j.id).reverse();
          expect((await sql.list(ctx)).map(j => j.id)).toEqual(expected);
        } finally {
          vi.useRealTimers();
        }
      });

      it('cancels nothing once a job has finished', async () => {
        // Every job is terminal by the time submit() returns, so cancel is a
        // no-op in practice. Pinned because a provider that let it overwrite a
        // succeeded job would lose the result rows.
        const { sql, ctx } = await seeded('cancel');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients' });
        await sql.cancel(ctx, job.id);
        const after = await sql.get(ctx, job.id);
        expect(after!.state).toBe('succeeded');
        expect(after!.rowCount).toBe(3);
      });

      it('is silent when cancelling a job that does not exist', async () => {
        const { sql } = await factory();
        await expect(sql.cancel(ctxFor('cancel_gone'), 'no-such-job')).resolves.toBeUndefined();
      });

      it('keeps jobs in separate tenants apart', async () => {
        const { sql, ctx } = await seeded('iso_a');
        const other = ctxFor('iso_b');
        const job = await sql.submit(ctx, { sql: 'SELECT * FROM patients' });
        expect(await sql.get(other, job.id)).toBeNull();
        expect(await sql.list(other)).toHaveLength(0);
        expect(await sql.results(other, job.id)).toEqual([]);
      });
    });
  });
}
