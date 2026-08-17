/**
 * ReconciliationService — detects and reports drift between source
 * systems and the ontology (Section 6.7).
 *
 * Reconciliation compares a full extract from a source system against
 * the current state of the ontology and produces a report of:
 *   - Missing objects (in source but not in ontology)
 *   - Orphaned objects (in ontology but not in source)
 *   - Field drift (same object, different field values)
 *
 * This is the "full sync" complement to CDC's "incremental sync":
 * CDC catches changes as they happen, reconciliation catches drift
 * that accumulates from missed events, failed mappings, or manual edits.
 */

import type { MappedObject } from '../mapping/record-mapper.js';

/** A single reconciliation discrepancy. */
export interface ReconciliationDiscrepancy {
  type: 'missing' | 'orphaned' | 'field_drift';
  /** Source system identifier. */
  source: string;
  /** Object type in the ontology. */
  objectType: string;
  /** Primary key of the affected object. */
  objectId: string;
  /** For field_drift: the field that differs. */
  field?: string;
  /** Value in the source system. */
  sourceValue?: unknown;
  /** Value in the ontology. */
  ontologyValue?: unknown;
}

/** Result of a reconciliation pass. */
export interface ReconciliationReport {
  source: string;
  objectType: string;
  /** Total objects in source. */
  sourceCount: number;
  /** Total objects in ontology (matching source filter). */
  ontologyCount: number;
  /** Discrepancies found. */
  discrepancies: ReconciliationDiscrepancy[];
  /** When the reconciliation ran. */
  reconciledAt: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/** Options for a reconciliation pass. */
export interface ReconciliationOptions {
  /** Fields to compare (default: all). */
  fields?: string[];
  /** Whether to report orphaned objects (in ontology but not source). */
  reportOrphaned?: boolean;
  /** Whether to report missing objects (in source but not ontology). */
  reportMissing?: boolean;
  /** Whether to report field drift. */
  reportFieldDrift?: boolean;
}

/**
 * Reconciliation service. Stateless — each call to reconcile() is
 * independent and safe to run concurrently for different sources.
 */
export class ReconciliationService {
  /**
   * Reconcile a set of source records against the ontology state.
   *
   * @param sourceRecords - Full extract from the source system (mapped to ontology objects)
   * @param ontologyRecords - Current ontology objects for the same type
   * @param source - Source system identifier
   * @param objectType - Object type being reconciled
   * @param options - Reconciliation options
   */
  reconcile(
    sourceRecords: MappedObject[],
    ontologyRecords: Map<string, Record<string, unknown>>,
    source: string,
    objectType: string,
    options: ReconciliationOptions = {},
  ): ReconciliationReport {
    const start = Date.now();
    const {
      reportOrphaned = true,
      reportMissing = true,
      reportFieldDrift = true,
      fields,
    } = options;

    const discrepancies: ReconciliationDiscrepancy[] = [];

    // Index source records by primary key
    const sourceMap = new Map<string, MappedObject>();
    for (const record of sourceRecords) {
      const pk = this._getPrimaryKey(record);
      if (pk) sourceMap.set(pk, record);
    }

    // Find missing and field-drift
    for (const [pk, sourceObj] of sourceMap) {
      const ontObj = ontologyRecords.get(pk);
      if (!ontObj) {
        if (reportMissing) {
          discrepancies.push({
            type: 'missing',
            source,
            objectType,
            objectId: pk,
            sourceValue: sourceObj.properties,
          });
        }
        continue;
      }

      if (reportFieldDrift) {
        const compareFields = fields ?? Object.keys(sourceObj.properties);
        for (const field of compareFields) {
          const srcVal = sourceObj.properties[field];
          const ontVal = ontObj[field];
          if (!this._valuesEqual(srcVal, ontVal)) {
            discrepancies.push({
              type: 'field_drift',
              source,
              objectType,
              objectId: pk,
              field,
              sourceValue: srcVal,
              ontologyValue: ontVal,
            });
          }
        }
      }
    }

    // Find orphaned
    if (reportOrphaned) {
      for (const [pk, ontObj] of ontologyRecords) {
        if (!sourceMap.has(pk)) {
          discrepancies.push({
            type: 'orphaned',
            source,
            objectType,
            objectId: pk,
            ontologyValue: ontObj,
          });
        }
      }
    }

    return {
      source,
      objectType,
      sourceCount: sourceRecords.length,
      ontologyCount: ontologyRecords.size,
      discrepancies,
      reconciledAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  private _getPrimaryKey(record: MappedObject): string | undefined {
    // MappedObject has primaryKey field from the mapping config
    return record.primaryKey ?? record.properties['_id'] as string | undefined;
  }

  private _valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    // Stringify to catch "1" vs 1 type coercion
    return String(a) === String(b);
  }
}
