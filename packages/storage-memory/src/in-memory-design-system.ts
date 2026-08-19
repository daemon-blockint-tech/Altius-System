/**
 * In-memory design system theming service.
 */

import { randomUUID } from 'node:crypto';
import type {
  DesignSystemService,
  DesignSystemTheme,
  CreateThemeInput,
  SetModulePaletteInput,
  ColorPalette,
  TypographySettings,
  RequestContext,
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

export class InMemoryDesignSystemService implements DesignSystemService {
  private readonly themes = new Map<string, Map<string, DesignSystemTheme>>();

  async createTheme(ctx: RequestContext, input: CreateThemeInput): Promise<DesignSystemTheme> {
    const now = new Date().toISOString();
    const theme: DesignSystemTheme = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      isDefault: input.isDefault ?? false,
      darkMode: input.darkMode ?? false,
      density: input.density ?? 'comfortable',
      palette: buildPalette(input.palette),
      typography: buildTypography(input.typography),
      modulePalettes: input.modulePalettes ?? {},
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    if (theme.isDefault) await this.clearDefaults(ctx);
    this.getMap(ctx.tenantId).set(theme.id, theme);
    return theme;
  }

  async getTheme(_ctx: RequestContext, id: string): Promise<DesignSystemTheme | null> {
    return this.themes.get(_ctx.tenantId)?.get(id) ?? null;
  }

  async listThemes(ctx: RequestContext): Promise<DesignSystemTheme[]> {
    const m = this.themes.get(ctx.tenantId);
    if (!m) return [];
    return Array.from(m.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDefaultTheme(ctx: RequestContext): Promise<DesignSystemTheme | null> {
    const m = this.themes.get(ctx.tenantId);
    if (!m) return null;
    return Array.from(m.values()).find(t => t.isDefault) ?? Array.from(m.values())[0] ?? null;
  }

  async updateTheme(ctx: RequestContext, id: string, input: Partial<CreateThemeInput>): Promise<DesignSystemTheme> {
    const current = await this.getTheme(ctx, id);
    if (!current) throw new Error(`Theme not found: ${id}`);
    if (input.isDefault && input.isDefault) await this.clearDefaults(ctx);
    const updated: DesignSystemTheme = {
      ...current,
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      isDefault: input.isDefault ?? current.isDefault,
      darkMode: input.darkMode ?? current.darkMode,
      density: input.density ?? current.density,
      palette: input.palette ? buildPalette({ ...current.palette, ...input.palette }) : current.palette,
      typography: input.typography ? buildTypography({ ...current.typography, ...input.typography }) : current.typography,
      modulePalettes: input.modulePalettes ?? current.modulePalettes,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteTheme(ctx: RequestContext, id: string): Promise<void> {
    this.themes.get(ctx.tenantId)?.delete(id);
  }

  async setModulePalette(ctx: RequestContext, input: SetModulePaletteInput): Promise<DesignSystemTheme> {
    const current = await this.getTheme(ctx, input.themeId);
    if (!current) throw new Error(`Theme not found: ${input.themeId}`);
    const modulePalettes = { ...(current.modulePalettes ?? {}), [input.moduleId]: { ...(current.modulePalettes?.[input.moduleId] ?? {}), ...input.palette } };
    return this.updateTheme(ctx, input.themeId, { modulePalettes });
  }

  async getModuleTheme(ctx: RequestContext, moduleId: string): Promise<DesignSystemTheme | null> {
    const defaultTheme = await this.getDefaultTheme(ctx);
    if (!defaultTheme) return null;
    const override = defaultTheme.modulePalettes?.[moduleId];
    if (!override) return defaultTheme;
    return { ...defaultTheme, palette: buildPalette({ ...defaultTheme.palette, ...override }) };
  }

  private async clearDefaults(ctx: RequestContext): Promise<void> {
    const m = this.themes.get(ctx.tenantId);
    if (!m) return;
    for (const [id, t] of m) {
      if (t.isDefault) m.set(id, { ...t, isDefault: false });
    }
  }

  private getMap(t: string): Map<string, DesignSystemTheme> {
    let m = this.themes.get(t);
    if (!m) { m = new Map(); this.themes.set(t, m); }
    return m;
  }
}
