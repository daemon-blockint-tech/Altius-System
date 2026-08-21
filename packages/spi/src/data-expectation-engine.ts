/**
 * Data expectation evaluation — shared by every DataExpectationsService.
 *
 * Running a check is a pure function of the expectation and the rows handed
 * to it, so it is contract rather than implementation detail. It also decides
 * whether a build is allowed to proceed: `gateBuild` blocks on a failing
 * `blocking` expectation, so two providers that disagreed about whether a
 * check passed would disagree about whether bad data reached production.
 *
 * That is worse than losing an expectation. A lost expectation is visibly
 * gone; a check that quietly evaluates differently on one provider is a gate
 * that looks closed and isn't.
 */

import type { DataExpectation, ExpectationResult } from './data-pipelines.js';

export function evaluateDataExpectation(exp: DataExpectation, data: Record<string, unknown>[]): ExpectationResult {
  const evaluatedAt = new Date().toISOString();
  const field = exp.field;
  let rowsChecked = 0;
  let rowsFailed = 0;
  const failingSamples: unknown[] = [];

  try {
    switch (exp.type) {
      case 'not_null':
        for (const row of data) {
          rowsChecked++;
          if (field && (row[field] === null || row[field] === undefined)) {
            rowsFailed++;
            if (failingSamples.length < 10) failingSamples.push(row[field]);
          }
        }
        break;

      case 'unique': {
        const seen = new Set<unknown>();
        for (const row of data) {
          rowsChecked++;
          const val = field ? row[field] : undefined;
          if (seen.has(val)) {
            rowsFailed++;
            if (failingSamples.length < 10) failingSamples.push(val);
          } else {
            seen.add(val);
          }
        }
        break;
      }

      case 'range':
        for (const row of data) {
          rowsChecked++;
          if (field) {
            const val = row[field];
            const min = exp.params.min as number | undefined;
            const max = exp.params.max as number | undefined;
            if (typeof val === 'number') {
              if ((min !== undefined && val < min) || (max !== undefined && val > max)) {
                rowsFailed++;
                if (failingSamples.length < 10) failingSamples.push(val);
              }
            }
          }
        }
        break;

      case 'enum':
        for (const row of data) {
          rowsChecked++;
          if (field) {
            const val = row[field];
            const allowed = exp.params.values as unknown[] | undefined;
            if (allowed && !allowed.includes(val)) {
              rowsFailed++;
              if (failingSamples.length < 10) failingSamples.push(val);
            }
          }
        }
        break;

      case 'regex':
        for (const row of data) {
          rowsChecked++;
          if (field) {
            const val = row[field];
            const pattern = exp.params.pattern as string | undefined;
            if (pattern && typeof val === 'string') {
            const re = new RegExp(pattern);
              if (!re.test(val)) {
                rowsFailed++;
                if (failingSamples.length < 10) failingSamples.push(val);
              }
            }
          }
        }
        break;

      case 'row_count': {
        rowsChecked = data.length;
        const min = exp.params.min as number | undefined;
        const max = exp.params.max as number | undefined;
        if (min !== undefined && data.length < min) rowsFailed = data.length;
        if (max !== undefined && data.length > max) rowsFailed = data.length;
        break;
      }

      case 'freshness': {
        rowsChecked = data.length;
        const maxAge = exp.params.maxAgeSeconds as number | undefined;
        const field2 = exp.params.timestampField as string | undefined ?? field;
        if (maxAge && field2) {
          const now = Date.now();
          for (const row of data) {
            const ts = row[field2!];
            if (typeof ts === 'string') {
              const age = (now - new Date(ts).getTime()) / 1000;
              if (age > maxAge) {
                rowsFailed++;
                if (failingSamples.length < 10) failingSamples.push(ts);
              }
            }
          }
        }
        break;
      }

      case 'schema':
      case 'custom':
        // In-memory: always pass (no schema validator or custom function in memory)
        rowsChecked = data.length;
        break;
    }

    return {
      expectationId: exp.id,
      expectationName: exp.name,
      passed: rowsFailed === 0,
      rowsChecked,
      rowsFailed,
      failingSamples,
      evaluatedAt,
    };
  } catch (err) {
    return {
      expectationId: exp.id,
      expectationName: exp.name,
      passed: false,
      rowsChecked,
      rowsFailed,
      failingSamples,
      errorMessage: err instanceof Error ? err.message : 'Evaluation error',
      evaluatedAt,
    };
  }
}
