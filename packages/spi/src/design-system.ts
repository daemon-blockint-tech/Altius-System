/**
 * Design system theming — persisted module palettes, typography, and density.
 *
 * This service lets tenant administrators and module authors save, share,
 * and apply custom colour palettes and typographic choices. It supports
 * per-module palettes so that each Workshop module can carry its own theme.
 */

import type { RequestContext } from './ontology.js';

/** A colour palette. */
export interface ColorPalette {
  primary: string;
  secondary?: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent?: string;
  healthy: string;
  pressure: string;
  disrupted: string;
}

/** Typography settings. */
export interface TypographySettings {
  sansFont?: string;
  monoFont?: string;
  baseSizePx?: number;
  scaleRatio?: number;
}

/** A saved design-system theme. */
export interface DesignSystemTheme {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  /** Global default for this tenant. */
  isDefault: boolean;
  darkMode: boolean;
  density: 'compact' | 'comfortable' | 'spacious';
  palette: ColorPalette;
  typography: TypographySettings;
  /** Optional module palette overrides keyed by module id. */
  modulePalettes?: Record<string, Partial<ColorPalette>>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Input for creating/updating a theme. */
export interface CreateThemeInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  darkMode?: boolean;
  density?: 'compact' | 'comfortable' | 'spacious';
  palette?: Partial<ColorPalette>;
  typography?: Partial<TypographySettings>;
  modulePalettes?: Record<string, Partial<ColorPalette>>;
}

/** Input for applying a palette to a module. */
export interface SetModulePaletteInput {
  themeId: string;
  moduleId: string;
  palette: Partial<ColorPalette>;
}

/**
 * Design system service — persists and retrieves themes and module palettes.
 */
export interface DesignSystemService {
  /** Create a theme. */
  createTheme(ctx: RequestContext, input: CreateThemeInput): Promise<DesignSystemTheme>;

  /** Get a theme by id. */
  getTheme(ctx: RequestContext, id: string): Promise<DesignSystemTheme | null>;

  /** List themes for the tenant. */
  listThemes(ctx: RequestContext): Promise<DesignSystemTheme[]>;

  /** Get the tenant's default theme. */
  getDefaultTheme(ctx: RequestContext): Promise<DesignSystemTheme | null>;

  /** Update a theme. */
  updateTheme(ctx: RequestContext, id: string, input: Partial<CreateThemeInput>): Promise<DesignSystemTheme>;

  /** Delete a theme. */
  deleteTheme(ctx: RequestContext, id: string): Promise<void>;

  /** Set (or update) a module-specific palette override within a theme. */
  setModulePalette(ctx: RequestContext, input: SetModulePaletteInput): Promise<DesignSystemTheme>;

  /** Resolve the effective palette for a module. */
  getModuleTheme(ctx: RequestContext, moduleId: string): Promise<DesignSystemTheme | null>;
}
