/**
 * In-memory versioned transactional dataset service.
 *
 * Branchable, transaction-log-backed tabular resources with snapshot reads
 * and schema evolution. All state lives in Maps keyed by tenantId.
 */

import { randomUUID } from 'node:crypto';
import {
  datasetRowKey,
  datasetRowMatches as matchesFilter,
  datasetSortRows as sortRows,
  datasetProjectColumns as projectColumns,
  datasetAlreadyExistsError,
  datasetNotFoundError,
  datasetBranchExistsError,
  datasetBranchNotFoundError,
} from '@altius/spi';
import type {
  DatasetService,
  Dataset,
  DatasetSchema,
  DatasetTransaction,
  CreateDatasetInput,
  WriteRowsInput,
  WriteResult,
  ReadOptions,
  ReadResult,
  DatasetBranch,
  RequestContext,
} from '@altius/spi';

interface DatasetState {
  dataset: Dataset;
  /** Transactions in append order. */
  transactions: DatasetTransaction[];
  /** Rows keyed by primary-key string (or row index when no PK). */
  rows: Map<string, Record<string, unknown>>;
  /** Branches for this dataset. */
  branches: Map<string, DatasetBranch>;
  /** Per-branch transaction log (branch name → transactions). */
  branchTransactions: Map<string, DatasetTransaction[]>;
  /** Per-branch rows (branch name → PK → row). */
  branchRows: Map<string, Map<string, Record<string, unknown>>>;
}

/**
 * Row identity within a branch. A schema with no primary key yields a fresh
 * UUID per row, so those datasets are append-only and never upsert.
 */
function pkOf(schema: DatasetSchema, row: Record<string, unknown>): string {
  return datasetRowKey(schema, row) ?? randomUUID();
}

export class InMemoryDatasetService implements DatasetService {
  private readonly datasets = new Map<string, Map<string, DatasetState>>();

  async create(ctx: RequestContext, input: CreateDatasetInput): Promise<Dataset> {
    // This used to overwrite an existing dataset of the same name, dropping its
    // rows and transaction log. Harmless-looking against a Map, unrecoverable
    // against Postgres — so `create` refuses in both providers rather than
    // meaning something different depending on which one is wired.
    if (this.datasets.get(ctx.tenantId)?.has(input.name)) {
      throw datasetAlreadyExistsError(input.name);
    }
    const branch = input.branch ?? 'main';
    const id = randomUUID();
    const now = new Date().toISOString();
    const dataset: Dataset = {
      id, tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      schema: input.schema,
      branch,
      latestTransactionId: 'init',
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
      ...(input.externalSource ? { externalSource: input.externalSource } : {}),
    };
    const state: DatasetState = {
      dataset,
      transactions: [],
      rows: new Map(),
      branches: new Map(),
      branchTransactions: new Map(),
      branchRows: new Map(),
    };
    // Seed main branch
    const mainBranch: DatasetBranch = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: id,
      name: branch, parentBranch: branch, parentTransactionId: 'init',
      createdAt: now, createdBy: ctx.actorId ?? 'system',
    };
    state.branches.set(branch, mainBranch);
    state.branchTransactions.set(branch, []);
    state.branchRows.set(branch, new Map());
    this.getMap(ctx.tenantId).set(input.name, state);
    return dataset;
  }

  async get(ctx: RequestContext, name: string, branch?: string): Promise<Dataset | null> {
    const state = this.datasets.get(ctx.tenantId)?.get(name);
    if (!state) return null;
    return { ...state.dataset, branch: branch ?? state.dataset.branch };
  }

  async list(ctx: RequestContext): Promise<Dataset[]> {
    const tenant = this.datasets.get(ctx.tenantId);
    if (!tenant) return [];
    return Array.from(tenant.values()).map(s => ({ ...s.dataset }));
  }

  async drop(ctx: RequestContext, name: string, branch?: string): Promise<void> {
    if (branch && branch !== 'main') {
      const state = this.datasets.get(ctx.tenantId)?.get(name);
      if (state) {
        state.branches.delete(branch);
        state.branchTransactions.delete(branch);
        state.branchRows.delete(branch);
      }
      return;
    }
    this.datasets.get(ctx.tenantId)?.delete(name);
  }

  async updateSchema(ctx: RequestContext, name: string, schema: DatasetSchema, branch?: string): Promise<Dataset> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const newVersion = schema.version;
    const tx: DatasetTransaction = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      type: 'schema_change', rows: [],
      schemaVersion: newVersion,
      // Snapshot both sides so getSchema can reconstruct any version from the
      // log — the outgoing schema is otherwise lost on the first change.
      schemaSnapshot: { ...schema, version: newVersion },
      previousSchemaSnapshot: { ...state.dataset.schema },
      timestamp: new Date().toISOString(),
      actorId: ctx.actorId ?? 'system',
      branch: br,
      message: `Schema updated to v${newVersion}`,
    };
    state.transactions.push(tx);
    state.branchTransactions.get(br)?.push(tx);
    const updated: Dataset = {
      ...state.dataset,
      schema: { ...schema, version: newVersion },
      latestTransactionId: tx.id,
      updatedAt: tx.timestamp,
    };
    state.dataset = updated;
    return updated;
  }

  async insert(ctx: RequestContext, name: string, input: WriteRowsInput, branch?: string): Promise<WriteResult> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const rowsMap = state.branchRows.get(br) ?? new Map();
    let written = 0, upserted = 0;
    for (const row of input.rows) {
      const pk = pkOf(state.dataset.schema, row);
      if (input.upsert && rowsMap.has(pk)) upserted++;
      rowsMap.set(pk, { ...row });
      written++;
    }
    state.branchRows.set(br, rowsMap);
    const tx: DatasetTransaction = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      type: 'insert', rows: input.rows,
      schemaVersion: state.dataset.schema.version,
      timestamp: new Date().toISOString(),
      actorId: ctx.actorId ?? 'system',
      branch: br,
      message: input.message,
    };
    state.transactions.push(tx);
    state.branchTransactions.get(br)?.push(tx);
    state.dataset = { ...state.dataset, latestTransactionId: tx.id, updatedAt: tx.timestamp };
    return { transactionId: tx.id, rowsWritten: written, rowsUpserted: upserted };
  }

  async update(ctx: RequestContext, name: string, filter: Record<string, unknown>, patch: Record<string, unknown>, branch?: string): Promise<WriteResult> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const rowsMap = state.branchRows.get(br) ?? new Map();
    const updatedRows: Record<string, unknown>[] = [];
    for (const [pk, row] of rowsMap) {
      if (matchesFilter(row, filter)) {
        const newRow = { ...row, ...patch };
        rowsMap.set(pk, newRow);
        updatedRows.push(newRow);
      }
    }
    state.branchRows.set(br, rowsMap);
    const tx: DatasetTransaction = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      type: 'update', rows: updatedRows,
      schemaVersion: state.dataset.schema.version,
      timestamp: new Date().toISOString(),
      actorId: ctx.actorId ?? 'system',
      branch: br,
    };
    state.transactions.push(tx);
    state.branchTransactions.get(br)?.push(tx);
    state.dataset = { ...state.dataset, latestTransactionId: tx.id, updatedAt: tx.timestamp };
    return { transactionId: tx.id, rowsWritten: updatedRows.length, rowsUpserted: 0 };
  }

  async delete(ctx: RequestContext, name: string, filter: Record<string, unknown>, branch?: string): Promise<WriteResult> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const rowsMap = state.branchRows.get(br) ?? new Map();
    const deletedRows: Record<string, unknown>[] = [];
    for (const [pk, row] of rowsMap) {
      if (matchesFilter(row, filter)) {
        deletedRows.push(row);
        rowsMap.delete(pk);
      }
    }
    state.branchRows.set(br, rowsMap);
    const tx: DatasetTransaction = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      type: 'delete', rows: deletedRows,
      schemaVersion: state.dataset.schema.version,
      timestamp: new Date().toISOString(),
      actorId: ctx.actorId ?? 'system',
      branch: br,
    };
    state.transactions.push(tx);
    state.branchTransactions.get(br)?.push(tx);
    state.dataset = { ...state.dataset, latestTransactionId: tx.id, updatedAt: tx.timestamp };
    return { transactionId: tx.id, rowsWritten: deletedRows.length, rowsUpserted: 0 };
  }

  async truncate(ctx: RequestContext, name: string, branch?: string): Promise<WriteResult> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const rowsMap = state.branchRows.get(br) ?? new Map();
    const count = rowsMap.size;
    rowsMap.clear();
    state.branchRows.set(br, rowsMap);
    const tx: DatasetTransaction = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      type: 'truncate', rows: [],
      schemaVersion: state.dataset.schema.version,
      timestamp: new Date().toISOString(),
      actorId: ctx.actorId ?? 'system',
      branch: br,
    };
    state.transactions.push(tx);
    state.branchTransactions.get(br)?.push(tx);
    state.dataset = { ...state.dataset, latestTransactionId: tx.id, updatedAt: tx.timestamp };
    return { transactionId: tx.id, rowsWritten: count, rowsUpserted: 0 };
  }

  async read(ctx: RequestContext, name: string, options?: ReadOptions, branch?: string): Promise<ReadResult> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const rowsMap = state.branchRows.get(br) ?? new Map();
    let rows = Array.from(rowsMap.values());
    if (options?.asOfTransactionId) {
      // Snapshot isolation: replay transactions up to asOfTransactionId
      const branchTxs = state.branchTransactions.get(br) ?? [];
      const idx = branchTxs.findIndex(t => t.id === options.asOfTransactionId);
      if (idx >= 0) {
        // Rebuild rows from transactions [0..idx]
        const snap = new Map<string, Record<string, unknown>>();
        for (let i = 0; i <= idx; i++) {
          const tx = branchTxs[i]!;
          if (tx.type === 'insert' || tx.type === 'update') {
            for (const row of tx.rows) {
              snap.set(pkOf(state.dataset.schema, row), { ...row });
            }
          } else if (tx.type === 'delete') {
            for (const row of tx.rows) {
              snap.delete(pkOf(state.dataset.schema, row));
            }
          } else if (tx.type === 'truncate') {
            snap.clear();
          }
        }
        rows = Array.from(snap.values());
      }
    }
    if (options?.filter) rows = rows.filter(r => matchesFilter(r, options.filter));
    rows = sortRows(rows, options?.orderBy);
    const total = rows.length;
    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
    rows = projectColumns(rows, options?.columns);
    return {
      rows,
      total,
      transactionId: options?.asOfTransactionId ?? state.dataset.latestTransactionId,
    };
  }

  async listTransactions(ctx: RequestContext, name: string, branch?: string, limit = 100): Promise<DatasetTransaction[]> {
    const state = this.getState(ctx.tenantId, name);
    const br = branch ?? state.dataset.branch;
    const txs = state.branchTransactions.get(br) ?? [];
    return [...txs].reverse().slice(0, limit);
  }

  async getTransaction(ctx: RequestContext, name: string, transactionId: string): Promise<DatasetTransaction | null> {
    const state = this.getState(ctx.tenantId, name);
    return state.transactions.find(t => t.id === transactionId) ?? null;
  }

  async createBranch(ctx: RequestContext, name: string, branchName: string, fromTransactionId?: string): Promise<DatasetBranch> {
    const state = this.getState(ctx.tenantId, name);
    if (state.branches.has(branchName)) throw datasetBranchExistsError(branchName);
    const parentBranch = state.dataset.branch;
    const parentTxId = fromTransactionId ?? state.dataset.latestTransactionId;
    // Snapshot current rows
    const parentRows = state.branchRows.get(parentBranch) ?? new Map();
    const newRows = new Map<string, Record<string, unknown>>();
    for (const [pk, row] of parentRows) newRows.set(pk, { ...row });
    const now = new Date().toISOString();
    const branch: DatasetBranch = {
      id: randomUUID(), tenantId: ctx.tenantId, datasetId: state.dataset.id,
      name: branchName, parentBranch, parentTransactionId: parentTxId,
      createdAt: now, createdBy: ctx.actorId ?? 'system',
    };
    state.branches.set(branchName, branch);
    state.branchTransactions.set(branchName, []);
    state.branchRows.set(branchName, newRows);
    return branch;
  }

  async listBranches(ctx: RequestContext, name: string): Promise<DatasetBranch[]> {
    const state = this.getState(ctx.tenantId, name);
    return Array.from(state.branches.values());
  }

  async mergeBranch(ctx: RequestContext, name: string, sourceBranch: string, targetBranch?: string): Promise<{ transactionsApplied: number; mergedAt: string }> {
    const state = this.getState(ctx.tenantId, name);
    const target = targetBranch ?? 'main';
    if (!state.branches.has(sourceBranch)) throw datasetBranchNotFoundError('Source', sourceBranch);
    if (!state.branches.has(target)) throw datasetBranchNotFoundError('Target', target);
    const sourceRows = state.branchRows.get(sourceBranch) ?? new Map();
    const sourceTxs = state.branchTransactions.get(sourceBranch) ?? [];
    const targetRows = state.branchRows.get(target) ?? new Map();
    // Apply source rows to target (last-write-wins)
    let applied = 0;
    for (const [pk, row] of sourceRows) {
      targetRows.set(pk, { ...row });
      applied++;
    }
    state.branchRows.set(target, targetRows);
    // Replay source transactions onto target
    const now = new Date().toISOString();
    for (const tx of sourceTxs) {
      const replayed: DatasetTransaction = {
        ...tx, id: randomUUID(), branch: target, timestamp: now,
        message: `Merged from ${sourceBranch}: ${tx.message ?? tx.type}`,
      };
      state.transactions.push(replayed);
      state.branchTransactions.get(target)?.push(replayed);
    }
    state.dataset = { ...state.dataset, latestTransactionId: sourceTxs.at(-1)?.id ?? state.dataset.latestTransactionId, updatedAt: now };
    return { transactionsApplied: sourceTxs.length, mergedAt: now };
  }

  private getState(tenantId: string, name: string): DatasetState {
    const state = this.datasets.get(tenantId)?.get(name);
    if (!state) throw datasetNotFoundError(name);
    return state;
  }

  private getMap(tenantId: string): Map<string, DatasetState> {
    let m = this.datasets.get(tenantId);
    if (!m) { m = new Map(); this.datasets.set(tenantId, m); }
    return m;
  }
}
