/**
 * Serve external datasets from the file, and refuse to pretend they are
 * writable.
 *
 * An external dataset holds no rows: `read` must go to the source file, and
 * every write must fail. Both belong in one place rather than in each storage
 * provider — the dispatch has nothing to do with how ordinary datasets are
 * stored, and duplicating it is how the two providers would come to disagree.
 *
 * This wraps whichever DatasetService is wired, so REST, SQL and the transform
 * runner all get the same behaviour without knowing external datasets exist.
 */

import {
  externalDatasetReadOnlyError,
  type BlobStore,
  type CreateDatasetInput,
  type Dataset,
  type DatasetBranch,
  type DatasetSchema,
  type DatasetService,
  type DatasetTransaction,
  type ReadOptions,
  type ReadResult,
  type RequestContext,
  type WriteResult,
  type WriteRowsInput,
} from '@altius/spi';
import { readParquetPage, inferDatasetSchema } from '@altius/dataset-parquet';

/** The bytes a Buffer views, without copying its whole backing pool. */
function toArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** Read a page of an external dataset out of the blob store. */
async function readExternal(
  blobStore: BlobStore,
  dataset: Dataset,
  ctx: RequestContext,
  options: ReadOptions | undefined,
): Promise<ReadResult> {
  const source = dataset.externalSource!;
  const blob = await blobStore.get(ctx.tenantId, source.blobId);
  if (!blob) {
    // The registration outlived the file. Saying so beats an empty result that
    // reads as "the source is empty".
    throw Object.assign(
      new Error(`Dataset "${dataset.name}" points at blob ${source.blobId}, which is not in the blob store.`),
      { code: 'EXTERNAL_SOURCE_MISSING', status: 409 },
    );
  }

  const page = await readParquetPage(
    toArrayBuffer(blob.data),
    {
      ...(options?.columns ? { columns: options.columns } : {}),
      ...(options?.limit != null ? { limit: options.limit } : {}),
      ...(options?.offset != null ? { offset: options.offset } : {}),
    },
  );

  return {
    rows: page.rows,
    total: page.total,
    // The file is the transaction: it has no version of its own, and claiming
    // one would imply a history the platform cannot reconstruct.
    transactionId: 'external',
  };
}

/**
 * Forward every call to the wrapped service, except the ones an external
 * dataset answers differently.
 *
 * Written out rather than spread: `{ ...inner }` copies own enumerable
 * properties only, so a class instance loses every method on its prototype and
 * the wrapper answers `svc.create is not a function`. A class that `implements
 * DatasetService` also makes the compiler catch a method added to the interface
 * later, which an object literal would silently leave unforwarded.
 */
class ExternalDatasetService implements DatasetService {
  constructor(private readonly inner: DatasetService, private readonly blobStore: BlobStore) {}

  /** The external source of `name`, or null when it is an ordinary dataset. */
  private async externalOf(ctx: RequestContext, name: string, branch?: string): Promise<Dataset | null> {
    const dataset = await this.inner.get(ctx, name, branch);
    return dataset?.externalSource ? dataset : null;
  }

  private async refuseIfExternal(ctx: RequestContext, name: string, branch: string | undefined, operation: string): Promise<void> {
    if (await this.externalOf(ctx, name, branch)) throw externalDatasetReadOnlyError(name, operation);
  }

  // ── The two behaviours that differ ──

  async read(ctx: RequestContext, name: string, options?: ReadOptions, branch?: string): Promise<ReadResult> {
    const external = await this.externalOf(ctx, name, branch);
    return external
      ? readExternal(this.blobStore, external, ctx, options)
      : this.inner.read(ctx, name, options, branch);
  }

  async insert(ctx: RequestContext, name: string, input: WriteRowsInput, branch?: string): Promise<WriteResult> {
    await this.refuseIfExternal(ctx, name, branch, 'insert');
    return this.inner.insert(ctx, name, input, branch);
  }

  async update(ctx: RequestContext, name: string, filter: Record<string, unknown>, patch: Record<string, unknown>, branch?: string): Promise<WriteResult> {
    await this.refuseIfExternal(ctx, name, branch, 'update');
    return this.inner.update(ctx, name, filter, patch, branch);
  }

  async delete(ctx: RequestContext, name: string, filter: Record<string, unknown>, branch?: string): Promise<WriteResult> {
    await this.refuseIfExternal(ctx, name, branch, 'delete');
    return this.inner.delete(ctx, name, filter, branch);
  }

  async truncate(ctx: RequestContext, name: string, branch?: string): Promise<WriteResult> {
    await this.refuseIfExternal(ctx, name, branch, 'truncate');
    return this.inner.truncate(ctx, name, branch);
  }

  async updateSchema(ctx: RequestContext, name: string, schema: DatasetSchema, branch?: string): Promise<Dataset> {
    // The file defines the schema; rewriting it here would describe rows the
    // read path does not return.
    await this.refuseIfExternal(ctx, name, branch, 'updateSchema');
    return this.inner.updateSchema(ctx, name, schema, branch);
  }

  // ── Straight delegation ──

  async create(ctx: RequestContext, input: CreateDatasetInput): Promise<Dataset> {
    if (!input.externalSource) return this.inner.create(ctx, input);

    // The file defines the columns, so the registration reads them from its
    // footer rather than trusting what the caller typed. Without this the
    // dataset is registered with whatever schema was posted — usually none —
    // and every later read that projects columns is rejected against it.
    const blob = await this.blobStore.get(ctx.tenantId, input.externalSource.blobId);
    if (!blob) {
      throw Object.assign(
        new Error(`Cannot register "${input.name}": blob ${input.externalSource.blobId} is not in the blob store.`),
        { code: 'EXTERNAL_SOURCE_MISSING', status: 409 },
      );
    }
    return this.inner.create(ctx, { ...input, schema: inferDatasetSchema(toArrayBuffer(blob.data)) });
  }
  get(ctx: RequestContext, name: string, branch?: string): Promise<Dataset | null> {
    return this.inner.get(ctx, name, branch);
  }
  list(ctx: RequestContext): Promise<Dataset[]> {
    return this.inner.list(ctx);
  }
  // Dropping the registration is not a write to the source: the file is
  // untouched, only the platform stops pointing at it.
  drop(ctx: RequestContext, name: string, branch?: string): Promise<void> {
    return this.inner.drop(ctx, name, branch);
  }
  listTransactions(ctx: RequestContext, name: string, branch?: string, limit?: number): Promise<DatasetTransaction[]> {
    return this.inner.listTransactions(ctx, name, branch, limit);
  }
  getTransaction(ctx: RequestContext, name: string, transactionId: string): Promise<DatasetTransaction | null> {
    return this.inner.getTransaction(ctx, name, transactionId);
  }
  createBranch(ctx: RequestContext, name: string, branchName: string, fromTransactionId?: string): Promise<DatasetBranch> {
    return this.inner.createBranch(ctx, name, branchName, fromTransactionId);
  }
  listBranches(ctx: RequestContext, name: string): Promise<DatasetBranch[]> {
    return this.inner.listBranches(ctx, name);
  }
  mergeBranch(ctx: RequestContext, name: string, sourceBranch: string, targetBranch?: string): Promise<{ transactionsApplied: number; mergedAt: string }> {
    return this.inner.mergeBranch(ctx, name, sourceBranch, targetBranch);
  }
}

export function withExternalDatasets(inner: DatasetService, blobStore: BlobStore | undefined): DatasetService {
  // Without a blob store there is nothing to read a file out of, so external
  // datasets cannot work at all — pass the real service straight through rather
  // than wrapping it in a layer that can only fail.
  return blobStore ? new ExternalDatasetService(inner, blobStore) : inner;
}
