/**
 * PostgreSQL-backed design-system theming service.
 *
 * Persists tenant-scoped themes with the same default-palette and module-override
 * semantics as the in-memory provider.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  RequestContext,
  DesignSystemService,
  DesignSystemTheme,
  CreateThemeInput,
  SetModulePaletteInput,
  ColorPalette,
  TypographySettings,
} from '@altius/spi';

const DEFAULT_PALETTE: ColorPalette = {
  primary: '#2563eb',
  background: '#ffffff',
  surface: '#f8fafc',
  text: '#0f172a',
  muted: '#64748b',
  healthy: '#2f6b4f',
  pressure: '#9a7b2f',
  disrupted: '#a8452c',
};

function buildPalette(input?: Partial<ColorPalette>): ColorPalette {
  return { ...DEFAULT_PALETTE, ...input } as ColorPalette;
}

function buildTypography(input?: Partial<TypographySettings>): TypographySettings {
  return {
    sansFont: input?.sansFont ?? 'IBM Plex Sans',
    monoFont: input?.monoFont ?? 'IBM Plex Mono',
    baseSizePx: input?.baseSizePx ?? 14,
    scaleRatio: input?.scaleRatio ?? 1.25,
  };
}

/** TIMESTAMPTZ arrives as a Date; the SPI types every timestamp as an ISO string. */
function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : new Date(String(v)).toISOString();
}

function parseJsonb<T>(v: unknown): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    return JSON.parse(v) as T;
  }
  return v as T;
}

function mapTheme(row: Record<string, unknown>): DesignSystemTheme {
  const palette = parseJsonb<ColorPalette>(row['palette']) ?? buildPalette();
  const typography = parseJsonb<TypographySettings>(row['typography']) ?? buildTypography();
  const modulePalettes = parseJsonb<Record<string, Partial<ColorPalette>>>(row['module_palettes']) ?? {};
  const description = row['description'] !== null && row['description'] !== undefined ? String(row['description']) : undefined;

  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id']),
    name: String(row['name']),
    description,
    isDefault: row['is_default'] === true,
    darkMode: row['dark_mode'] === true,
    density: (row['density'] as DesignSystemTheme['density']) ?? 'comfortable',
    palette,
    typography,
    modulePalettes,
    createdBy: String(row['created_by'] ?? ''),
    createdAt: toIso(row['created_at'])!,
    updatedAt: toIso(row['updated_at'])!,
  };
}

export class PostgresDesignSystemService implements DesignSystemService {
  constructor(private readonly pool: Pool) {}

  async createTheme(ctx: RequestContext, input: CreateThemeInput): Promise<DesignSystemTheme> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const description = input.description ?? '';
    const isDefault = input.isDefault ?? false;
    const darkMode = input.darkMode ?? false;
    const density = input.density ?? 'comfortable';
    const palette = buildPalette(input.palette);
    const typography = buildTypography(input.typography);
    const modulePalettes = input.modulePalettes ?? {};

    if (isDefault) {
      await this.clearDefaults(ctx.tenantId);
    }

    const r = await this.pool.query(
      `INSERT INTO "governance"."design_system_themes"
         ("id","tenant_id","name","description","is_default","dark_mode","density",
          "palette","typography","module_palettes","created_by","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name,
        description,
        isDefault,
        darkMode,
        density,
        JSON.stringify(palette),
        JSON.stringify(typography),
        JSON.stringify(modulePalettes),
        ctx.actorId ?? 'system',
        now,
      ],
    );
    return mapTheme(r.rows[0]!);
  }

  async getTheme(ctx: RequestContext, id: string): Promise<DesignSystemTheme | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."design_system_themes" WHERE "id"=$1 AND "tenant_id"=$2`,
      [id, ctx.tenantId],
    );
    return r.rows[0] ? mapTheme(r.rows[0]!) : null;
  }

  async listThemes(ctx: RequestContext): Promise<DesignSystemTheme[]> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."design_system_themes"
       WHERE "tenant_id"=$1
       ORDER BY "updated_at" DESC`,
      [ctx.tenantId],
    );
    return r.rows.map(mapTheme);
  }

  async getDefaultTheme(ctx: RequestContext): Promise<DesignSystemTheme | null> {
    const r = await this.pool.query(
      `SELECT * FROM "governance"."design_system_themes"
       WHERE "tenant_id"=$1 AND "is_default"=true`,
      [ctx.tenantId],
    );
    if (r.rows[0]) return mapTheme(r.rows[0]!);

    const fallback = await this.pool.query(
      `SELECT * FROM "governance"."design_system_themes"
       WHERE "tenant_id"=$1
       ORDER BY "created_at" ASC
       LIMIT 1`,
      [ctx.tenantId],
    );
    return fallback.rows[0] ? mapTheme(fallback.rows[0]!) : null;
  }

  async updateTheme(ctx: RequestContext, id: string, input: Partial<CreateThemeInput>): Promise<DesignSystemTheme> {
    const select = await this.pool.query(
      `SELECT * FROM "governance"."design_system_themes" WHERE "id"=$1 AND "tenant_id"=$2`,
      [id, ctx.tenantId],
    );
    if (!select.rows[0]) throw new Error(`Theme not found: ${id}`);

    const row = select.rows[0]!;
    const now = new Date().toISOString();
    const rowIsDefault = row['is_default'] === true;
    const isDefault = input.isDefault ?? rowIsDefault;

    if (isDefault && !rowIsDefault) {
      await this.clearDefaults(ctx.tenantId);
    }

    const description = input.description ?? row['description'] ?? '';
    const darkMode = input.darkMode ?? row['dark_mode'] ?? false;
    const density = input.density ?? (row['density'] as DesignSystemTheme['density']) ?? 'comfortable';
    const rowPalette = parseJsonb<ColorPalette>(row['palette']) ?? buildPalette();
    const palette = input.palette ? buildPalette({ ...rowPalette, ...input.palette }) : rowPalette;
    const rowTypography = parseJsonb<TypographySettings>(row['typography']) ?? buildTypography();
    const typography = input.typography ? buildTypography({ ...rowTypography, ...input.typography }) : rowTypography;
    const rowModulePalettes = parseJsonb<Record<string, Partial<ColorPalette>>>(row['module_palettes']) ?? {};
    const modulePalettes = input.modulePalettes ?? rowModulePalettes;

    const r = await this.pool.query(
      `UPDATE "governance"."design_system_themes"
          SET "name"=$3,"description"=$4,"is_default"=$5,"dark_mode"=$6,"density"=$7,
              "palette"=$8,"typography"=$9,"module_palettes"=$10,"updated_at"=$11
        WHERE "id"=$1 AND "tenant_id"=$2
       RETURNING *`,
      [
        id,
        ctx.tenantId,
        input.name ?? row['name'],
        description,
        isDefault,
        darkMode,
        density,
        JSON.stringify(palette),
        JSON.stringify(typography),
        JSON.stringify(modulePalettes),
        now,
      ],
    );
    return mapTheme(r.rows[0]!);
  }

  async deleteTheme(ctx: RequestContext, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "governance"."design_system_themes" WHERE "id"=$1 AND "tenant_id"=$2`,
      [id, ctx.tenantId],
    );
  }

  async setModulePalette(ctx: RequestContext, input: SetModulePaletteInput): Promise<DesignSystemTheme> {
    const current = await this.getTheme(ctx, input.themeId);
    if (!current) throw new Error(`Theme not found: ${input.themeId}`);
    const existing = current.modulePalettes?.[input.moduleId] ?? {};
    const merged = { ...existing, ...input.palette };
    return this.updateTheme(ctx, input.themeId, {
      modulePalettes: { ...current.modulePalettes, [input.moduleId]: merged },
    });
  }

  async getModuleTheme(ctx: RequestContext, moduleId: string): Promise<DesignSystemTheme | null> {
    const defaultTheme = await this.getDefaultTheme(ctx);
    if (!defaultTheme) return null;
    const override = defaultTheme.modulePalettes?.[moduleId];
    if (!override) return defaultTheme;
    return { ...defaultTheme, palette: buildPalette({ ...defaultTheme.palette, ...override }) };
  }

  private async clearDefaults(tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "governance"."design_system_themes" SET "is_default"=false WHERE "tenant_id"=$1 AND "is_default"=true`,
      [tenantId],
    );
  }
}
