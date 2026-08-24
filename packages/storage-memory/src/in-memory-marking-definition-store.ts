import type {
  MarkingDefinitionStore,
  MarkingDefinitionRecord,
  MarkingCategoryRecord,
  CreateMarkingDefinitionInput,
  CreateMarkingCategoryInput,
} from '@altius/spi';

/** Tenant-scoped in-memory marking definitions. Same contract as Postgres. */
export class InMemoryMarkingDefinitionStore implements MarkingDefinitionStore {
  private defs = new Map<string, MarkingDefinitionRecord>(); // key: tenant|name
  private cats = new Map<string, MarkingCategoryRecord>(); // key: tenant|name

  private defKey(t: string, n: string): string { return `${t}|${n}`; }
  private catKey(t: string, n: string): string { return `${t}|${n}`; }

  async createDefinition(tenantId: string, input: CreateMarkingDefinitionInput, createdBy: string): Promise<MarkingDefinitionRecord> {
    const row: MarkingDefinitionRecord = {
      tenantId, name: input.name, category: input.category, rank: input.rank,
      createdBy, createdAt: new Date().toISOString(),
    };
    this.defs.set(this.defKey(tenantId, input.name), row);
    return row;
  }

  async deleteDefinition(tenantId: string, name: string): Promise<boolean> {
    return this.defs.delete(this.defKey(tenantId, name));
  }

  async listDefinitions(tenantId: string): Promise<MarkingDefinitionRecord[]> {
    return [...this.defs.values()].filter(r => r.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getDefinition(tenantId: string, name: string): Promise<MarkingDefinitionRecord | null> {
    return this.defs.get(this.defKey(tenantId, name)) ?? null;
  }

  async createCategory(tenantId: string, input: CreateMarkingCategoryInput, createdBy: string): Promise<MarkingCategoryRecord> {
    const row: MarkingCategoryRecord = {
      tenantId, name: input.name, mode: input.mode,
      createdBy, createdAt: new Date().toISOString(),
    };
    this.cats.set(this.catKey(tenantId, input.name), row);
    return row;
  }

  async listCategories(tenantId: string): Promise<MarkingCategoryRecord[]> {
    return [...this.cats.values()].filter(r => r.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name));
  }
}
