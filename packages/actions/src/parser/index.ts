/**
 * Action manifest parser — YAML parsing and structural validation.
 *
 * Parses YAML action manifests and validates their structure per spec Section 5.1.
 * Optionally cross-references with a ParsedSchema to validate action names,
 * link types, object types, and field references.
 */

import { parse as parseYaml } from 'yaml';

import type { ParsedSchema } from '@altius/odl';

import type {
  ActionManifest,
  ActionEffect,
  EffectValue,
  UpdateObjectEffect,
  CreateLinkEffect,
  UpdateLinkEffect,
  DeleteLinkEffect,
  CreateObjectEffect,
  DeleteObjectEffect,
  RecordConsentEffect,
  Precondition,
  SideEffect,
  RollbackConfig,
  RollbackPolicy,
  UndoConfig,
  ManifestIssue,
  ManifestValidationResult,
} from './types.js';

// ─── Public API ───

/**
 * Parse a YAML action manifest string.
 *
 * Performs structural validation. If a schema is provided, also performs
 * cross-reference validation (action name, link types, object types, params).
 */
export function parseActionManifest(
  yamlContent: string,
  schema?: ParsedSchema,
): ManifestValidationResult {
  const errors: ManifestIssue[] = [];
  const warnings: ManifestIssue[] = [];

  // Step 1: Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    errors.push({
      severity: 'error',
      code: 'YAML_PARSE_ERROR',
      message: `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { valid: false, errors, warnings };
  }

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_DOCUMENT',
      message: 'Action manifest must be a YAML mapping (object).',
    });
    return { valid: false, errors, warnings };
  }

  const doc = raw as Record<string, unknown>;

  // Step 2: Validate required top-level fields
  const action = validateString(doc, 'action', errors);
  const version = validateInteger(doc, 'version', errors);
  const reversible = validateBoolean(doc, 'reversible', false);

  // Step 3: Parse preconditions
  const preconditions = parsePreconditions(doc['preconditions'], errors);

  // Step 3b: Parse requiredRoles (optional; the role gate for object-less actions)
  const requiredRoles = parseRequiredRoles(doc['requiredRoles'], errors);

  // Step 4: Parse effects
  const effects = parseEffects(doc['effects'], errors);

  // Step 5: Parse side effects
  const sideEffects = parseSideEffects(doc['sideEffects'], errors, warnings);

  // Step 6: Parse rollback
  const rollback = parseRollback(doc['rollback'], errors);

  // Step 7: Parse undo (optional)
  const undo = parseUndo(doc['undo'], reversible, errors, warnings);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const manifest: ActionManifest = {
    action: action!,
    version: version!,
    reversible,
    preconditions,
    ...(requiredRoles !== undefined ? { requiredRoles } : {}),
    effects,
    sideEffects,
    rollback,
    undo,
  };

  // Step 8: Cross-reference with schema if provided
  if (schema) {
    crossReferenceSchema(manifest, schema, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    manifest: errors.length === 0 ? manifest : undefined,
    errors,
    warnings,
  };
}

// ─── Top-level field validators ───

function validateString(
  doc: Record<string, unknown>,
  field: string,
  errors: ManifestIssue[],
): string | undefined {
  const value = doc[field];
  if (value === undefined || value === null) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `Required field "${field}" is missing.`,
      path: field,
    });
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: `Field "${field}" must be a string, got ${typeof value}.`,
      path: field,
    });
    return undefined;
  }
  return value;
}

function validateInteger(
  doc: Record<string, unknown>,
  field: string,
  errors: ManifestIssue[],
): number | undefined {
  const value = doc[field];
  if (value === undefined || value === null) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `Required field "${field}" is missing.`,
      path: field,
    });
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: `Field "${field}" must be an integer, got ${typeof value === 'number' ? value : typeof value}.`,
      path: field,
    });
    return undefined;
  }
  return value;
}

function validateBoolean(
  doc: Record<string, unknown>,
  field: string,
  defaultValue: boolean,
): boolean {
  const value = doc[field];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

// ─── Preconditions ───

function parsePreconditions(
  raw: unknown,
  errors: ManifestIssue[],
): Precondition[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "preconditions" must be an array.',
      path: 'preconditions',
    });
    return [];
  }

  const result: Precondition[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    const path = `preconditions[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TYPE',
        message: `${path} must be an object with "expr" and "error" fields.`,
        path,
      });
      continue;
    }

    if (typeof item['expr'] !== 'string' || !item['expr']) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FIELD',
        message: `${path}.expr is required and must be a non-empty string.`,
        path: `${path}.expr`,
      });
      continue;
    }

    if (typeof item['error'] !== 'string' || !item['error']) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FIELD',
        message: `${path}.error is required and must be a non-empty string.`,
        path: `${path}.error`,
      });
      continue;
    }

    result.push({ expr: item['expr'], error: item['error'] });
  }

  return result;
}

// ─── Required roles ───

function parseRequiredRoles(
  raw: unknown,
  errors: ManifestIssue[],
): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "requiredRoles" must be an array of role names.',
      path: 'requiredRoles',
    });
    return undefined;
  }

  const result: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (typeof raw[i] !== 'string' || !raw[i]) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TYPE',
        message: `requiredRoles[${i}] must be a non-empty string.`,
        path: `requiredRoles[${i}]`,
      });
      continue;
    }
    result.push(raw[i] as string);
  }
  return result;
}

// ─── Effects ───

const VALID_EFFECT_TYPES = new Set(['updateObject', 'createLink', 'updateLink', 'deleteLink', 'createObject', 'deleteObject', 'recordConsent']);

function parseEffects(
  raw: unknown,
  errors: ManifestIssue[],
): ActionEffect[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "effects" must be an array.',
      path: 'effects',
    });
    return [];
  }

  const result: ActionEffect[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    const path = `effects[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TYPE',
        message: `${path} must be an object with a "type" field.`,
        path,
      });
      continue;
    }

    const effectType = item['type'];
    if (typeof effectType !== 'string' || !VALID_EFFECT_TYPES.has(effectType)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_EFFECT_TYPE',
        message: `${path}.type must be one of: ${[...VALID_EFFECT_TYPES].join(', ')}. Got "${effectType}".`,
        path: `${path}.type`,
      });
      continue;
    }

    switch (effectType) {
      case 'updateObject': {
        const effect = parseUpdateObject(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'createLink': {
        const effect = parseCreateLink(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'updateLink': {
        const effect = parseUpdateLink(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'deleteLink': {
        const effect = parseDeleteLink(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'createObject': {
        const effect = parseCreateObject(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'deleteObject': {
        const effect = parseDeleteObject(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
      case 'recordConsent': {
        const effect = parseRecordConsent(item, path, errors);
        if (effect) result.push(effect);
        break;
      }
    }
  }

  return result;
}

function parseRecordConsent(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): RecordConsentEffect | undefined {
  if (typeof item['subject'] !== 'string' || !item['subject']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.subject is required for recordConsent effect.`,
      path: `${path}.subject`,
    });
    return undefined;
  }
  const effect: RecordConsentEffect = {
    type: 'recordConsent',
    subject: item['subject'],
  };
  if (typeof item['purpose'] === 'string') effect.purpose = item['purpose'];
  if (typeof item['decision'] === 'string') effect.decision = item['decision'];
  if (typeof item['evidence'] === 'string') effect.evidence = item['evidence'];
  if (typeof item['condition'] === 'string') effect.condition = item['condition'];
  return effect;
}

function parseUpdateObject(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): UpdateObjectEffect | undefined {
  let valid = true;

  if (typeof item['target'] !== 'string' || !item['target']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.target is required for updateObject effect.`,
      path: `${path}.target`,
    });
    valid = false;
  }

  if (!item['set'] || typeof item['set'] !== 'object' || Array.isArray(item['set'])) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.set is required and must be an object for updateObject effect.`,
      path: `${path}.set`,
    });
    valid = false;
  }

  if (!valid) return undefined;

  const set = item['set'] as Record<string, unknown>;
  const condition = typeof item['condition'] === 'string' ? item['condition'] : undefined;

  return {
    type: 'updateObject',
    target: item['target'] as string,
    set,
    condition,
  };
}

function parseCreateLink(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): CreateLinkEffect | undefined {
  let valid = true;

  if (typeof item['linkType'] !== 'string' || !item['linkType']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.linkType is required for createLink effect.`,
      path: `${path}.linkType`,
    });
    valid = false;
  }

  if (typeof item['from'] !== 'string' || !item['from']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.from is required for createLink effect.`,
      path: `${path}.from`,
    });
    valid = false;
  }

  if (typeof item['to'] !== 'string' || !item['to']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.to is required for createLink effect.`,
      path: `${path}.to`,
    });
    valid = false;
  }

  if (!valid) return undefined;

  const properties = item['properties'] && typeof item['properties'] === 'object' && !Array.isArray(item['properties'])
    ? (item['properties'] as Record<string, unknown>)
    : undefined;

  const condition = typeof item['condition'] === 'string' ? item['condition'] : undefined;

  return {
    type: 'createLink',
    linkType: item['linkType'] as string,
    from: item['from'] as string,
    to: item['to'] as string,
    properties,
    condition,
  };
}

function parseDeleteLink(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): DeleteLinkEffect | undefined {
  if (typeof item['linkType'] !== 'string' || !item['linkType']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.linkType is required for deleteLink effect.`,
      path: `${path}.linkType`,
    });
    return undefined;
  }

  // Parse filter
  const filterRaw = item['filter'];
  const filter: DeleteLinkEffect['filter'] = {};
  if (filterRaw && typeof filterRaw === 'object' && !Array.isArray(filterRaw)) {
    const f = filterRaw as Record<string, unknown>;
    if (typeof f['from'] === 'string') filter.from = f['from'];
    if (typeof f['to'] === 'string') filter.to = f['to'];
    if (typeof f['active'] === 'boolean') filter.active = f['active'];
  } else if (filterRaw !== undefined && filterRaw !== null) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: `${path}.filter must be an object.`,
      path: `${path}.filter`,
    });
    return undefined;
  }

  // Parse expect
  const expectRaw = item['expect'];
  let expect: 'ONE' | 'ALL' | undefined;
  if (expectRaw !== undefined && expectRaw !== null) {
    if (expectRaw === 'ONE' || expectRaw === 'ALL') {
      expect = expectRaw;
    } else {
      errors.push({
        severity: 'error',
        code: 'INVALID_VALUE',
        message: `${path}.expect must be "ONE" or "ALL". Got "${expectRaw}".`,
        path: `${path}.expect`,
      });
      return undefined;
    }
  }

  return {
    type: 'deleteLink',
    linkType: item['linkType'] as string,
    filter,
    expect,
  };
}

function parseUpdateLink(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): UpdateLinkEffect | undefined {
  if (typeof item['linkType'] !== 'string' || !item['linkType']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.linkType is required for updateLink effect.`,
      path: `${path}.linkType`,
    });
    return undefined;
  }

  // Parse filter (same shape as deleteLink)
  const filterRaw = item['filter'];
  const filter: UpdateLinkEffect['filter'] = {};
  if (filterRaw && typeof filterRaw === 'object' && !Array.isArray(filterRaw)) {
    const f = filterRaw as Record<string, unknown>;
    if (typeof f['from'] === 'string') filter.from = f['from'];
    if (typeof f['to'] === 'string') filter.to = f['to'];
    if (typeof f['active'] === 'boolean') filter.active = f['active'];
  } else if (filterRaw !== undefined && filterRaw !== null) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: `${path}.filter must be an object.`,
      path: `${path}.filter`,
    });
    return undefined;
  }

  // Parse set (required — same shape as updateObject.set)
  const setRaw = item['set'];
  let set: Record<string, EffectValue> | undefined;
  if (setRaw && typeof setRaw === 'object' && !Array.isArray(setRaw)) {
    set = setRaw as Record<string, EffectValue>;
  } else {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.set is required for updateLink effect and must be an object.`,
      path: `${path}.set`,
    });
    return undefined;
  }

  // Parse expect
  const expectRaw = item['expect'];
  let expect: 'ONE' | 'ALL' | undefined;
  if (expectRaw !== undefined && expectRaw !== null) {
    if (expectRaw === 'ONE' || expectRaw === 'ALL') {
      expect = expectRaw;
    } else {
      errors.push({
        severity: 'error',
        code: 'INVALID_VALUE',
        message: `${path}.expect must be "ONE" or "ALL". Got "${expectRaw}".`,
        path: `${path}.expect`,
      });
      return undefined;
    }
  }

  const condition = typeof item['condition'] === 'string' ? item['condition'] : undefined;

  return {
    type: 'updateLink',
    linkType: item['linkType'] as string,
    filter,
    set,
    expect,
    condition,
  };
}

function parseCreateObject(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): CreateObjectEffect | undefined {
  let valid = true;

  if (typeof item['objectType'] !== 'string' || !item['objectType']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.objectType is required for createObject effect.`,
      path: `${path}.objectType`,
    });
    valid = false;
  }

  if (!item['properties'] || typeof item['properties'] !== 'object' || Array.isArray(item['properties'])) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.properties is required and must be an object for createObject effect.`,
      path: `${path}.properties`,
    });
    valid = false;
  }

  if (!valid) return undefined;

  return {
    type: 'createObject',
    objectType: item['objectType'] as string,
    properties: item['properties'] as Record<string, unknown>,
  };
}

function parseDeleteObject(
  item: Record<string, unknown>,
  path: string,
  errors: ManifestIssue[],
): DeleteObjectEffect | undefined {
  if (typeof item['target'] !== 'string' || !item['target']) {
    errors.push({
      severity: 'error',
      code: 'MISSING_FIELD',
      message: `${path}.target is required for deleteObject effect.`,
      path: `${path}.target`,
    });
    return undefined;
  }

  const rawMode = typeof item['mode'] === 'string' ? item['mode'] : 'soft';
  if (rawMode !== 'soft' && rawMode !== 'hard') {
    errors.push({
      severity: 'error',
      code: 'INVALID_VALUE',
      message: `${path}.mode must be "soft" or "hard". Got "${rawMode}".`,
      path: `${path}.mode`,
    });
    return undefined;
  }

  const condition = typeof item['condition'] === 'string' ? item['condition'] : undefined;

  return {
    type: 'deleteObject',
    target: item['target'] as string,
    mode: rawMode,
    condition,
  };
}

// ─── Side effects ───

/**
 * Side-effect types the executor can dispatch (side-effect-executor.ts).
 * Any other value throws "Unknown side-effect type" at runtime — silently,
 * under the default LOG_AND_CONTINUE policy — so reject it here at load time.
 */
const VALID_SIDE_EFFECT_TYPES = new Set(['webhook', 'event']);

function parseSideEffects(
  raw: unknown,
  errors: ManifestIssue[],
  _warnings: ManifestIssue[],
): SideEffect[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "sideEffects" must be an array.',
      path: 'sideEffects',
    });
    return [];
  }

  const result: SideEffect[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    const path = `sideEffects[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_TYPE',
        message: `${path} must be an object.`,
        path,
      });
      continue;
    }

    if (typeof item['name'] !== 'string' || !item['name']) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FIELD',
        message: `${path}.name is required.`,
        path: `${path}.name`,
      });
      continue;
    }

    if (typeof item['type'] !== 'string' || !item['type']) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FIELD',
        message: `${path}.type is required.`,
        path: `${path}.type`,
      });
      continue;
    }

    if (!VALID_SIDE_EFFECT_TYPES.has(item['type'])) {
      errors.push({
        severity: 'error',
        code: 'UNSUPPORTED_VALUE',
        message: `${path}.type must be one of: ${[...VALID_SIDE_EFFECT_TYPES].join(', ')}. Got "${item['type']}".`,
        path: `${path}.type`,
      });
      continue;
    }

    if (!item['config'] || typeof item['config'] !== 'object' || Array.isArray(item['config'])) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FIELD',
        message: `${path}.config is required and must be an object.`,
        path: `${path}.config`,
      });
      continue;
    }

    // The webhook HttpClient contract is POST-only. Accepting `method` and then
    // POSTing anyway would send a verb the manifest did not ask for, so reject
    // it at load time rather than at execution — side-effects run post-commit.
    if (item['type'] === 'webhook') {
      const webhookConfig = item['config'] as Record<string, unknown>;

      // config.url is required: expandUrl calls url.replace(...), so a missing
      // or non-string url throws a TypeError on every attempt — swallowed under
      // LOG_AND_CONTINUE with no trace, leaving the side effect silently dead.
      if (webhookConfig['url'] === undefined || webhookConfig['url'] === null || webhookConfig['url'] === '') {
        errors.push({
          severity: 'error',
          code: 'MISSING_FIELD',
          message: `${path}.config.url is required for webhook side effects.`,
          path: `${path}.config.url`,
        });
        continue;
      }
      if (typeof webhookConfig['url'] !== 'string') {
        errors.push({
          severity: 'error',
          code: 'INVALID_TYPE',
          message: `${path}.config.url must be a string.`,
          path: `${path}.config.url`,
        });
        continue;
      }

      const method = webhookConfig['method'];
      if (typeof method === 'string' && method.toUpperCase() !== 'POST') {
        errors.push({
          severity: 'error',
          code: 'UNSUPPORTED_VALUE',
          message: `${path}.config.method "${method}" is not supported — webhooks are POST-only.`,
          path: `${path}.config.method`,
        });
        continue;
      }
    }

    const se: SideEffect = {
      name: item['name'],
      type: item['type'],
      config: item['config'] as Record<string, unknown>,
    };
    if (typeof item['retries'] === 'number') se.retries = item['retries'];
    if (typeof item['retryDelay'] === 'string') se.retryDelay = item['retryDelay'];

    result.push(se);
  }

  return result;
}

// ─── Rollback ───

const VALID_ROLLBACK_POLICIES = new Set<RollbackPolicy>([
  'LOG_AND_CONTINUE',
  'RETRY_INDEFINITELY',
  'ROLLBACK_ALL',
]);

function parseRollback(
  raw: unknown,
  errors: ManifestIssue[],
): RollbackConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "rollback" must be an object.',
      path: 'rollback',
    });
    return undefined;
  }

  const doc = raw as Record<string, unknown>;
  const policy = doc['onSideEffectFailure'];

  if (typeof policy !== 'string' || !VALID_ROLLBACK_POLICIES.has(policy as RollbackPolicy)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_VALUE',
      message: `rollback.onSideEffectFailure must be one of: ${[...VALID_ROLLBACK_POLICIES].join(', ')}. Got "${policy}".`,
      path: 'rollback.onSideEffectFailure',
    });
    return undefined;
  }

  return { onSideEffectFailure: policy as RollbackPolicy };
}

// ─── Undo ───

function parseUndo(
  raw: unknown,
  reversible: boolean,
  errors: ManifestIssue[],
  warnings: ManifestIssue[],
): UndoConfig | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (!reversible) {
    warnings.push({
      severity: 'warning',
      code: 'UNDO_ON_NON_REVERSIBLE',
      message: 'Manifest has "undo" section but reversible is false. Undo will be ignored.',
      path: 'undo',
    });
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_TYPE',
      message: 'Field "undo" must be an object.',
      path: 'undo',
    });
    return undefined;
  }

  const doc = raw as Record<string, unknown>;
  const result: UndoConfig = {};

  if (typeof doc['window'] === 'string') {
    result.window = doc['window'];
  }

  // We store overrides and sideEffects as-is for now;
  // deep validation can be added later.
  if (Array.isArray(doc['overrides'])) {
    result.overrides = (doc['overrides'] as Array<Record<string, unknown>>).map((o, i) => ({
      effect: typeof o['effect'] === 'number' ? o['effect'] : i,
      undoEffect: (o['undoEffect'] as Record<string, unknown>) ?? {},
    }));
  }

  if (Array.isArray(doc['sideEffects'])) {
    result.sideEffects = parseSideEffects(doc['sideEffects'], errors, warnings);
  }

  return result;
}

// ─── Schema cross-reference ───

/**
 * Cross-reference a already-parsed manifest against the merged schema.
 *
 * `parseActionManifest` runs the same checks, but only when a caller hands it a
 * schema — and the boot loader parses each manifest before the merged schema is
 * assembled, so it cannot. Exposing the pass separately lets the loader run it
 * once everything is loaded, which is the only point at which cross-pack
 * references can be resolved at all.
 *
 * Severity is the caller's decision: findings are returned rather than thrown,
 * because drift in a shipped pack should be reported, not turned into a boot
 * failure.
 */
export function crossReferenceManifest(
  manifest: ActionManifest,
  schema: ParsedSchema,
): ManifestIssue[] {
  const errors: ManifestIssue[] = [];
  const warnings: ManifestIssue[] = [];
  crossReferenceSchema(manifest, schema, errors, warnings);
  return [...errors, ...warnings];
}

function crossReferenceSchema(
  manifest: ActionManifest,
  schema: ParsedSchema,
  errors: ManifestIssue[],
  warnings: ManifestIssue[],
): void {
  const actionTypeNames = new Set(schema.actionTypes.map(a => a.name));
  const objectTypeNames = new Set(schema.objectTypes.map(o => o.name));
  const linkTypeNames = new Set(schema.linkTypes.map(l => l.name));

  // 1. Action name must match an @actionType
  if (!actionTypeNames.has(manifest.action)) {
    errors.push({
      severity: 'error',
      code: 'UNKNOWN_ACTION_TYPE',
      message: `Action "${manifest.action}" does not match any @actionType in the schema. Known: ${[...actionTypeNames].join(', ') || '(none)'}.`,
      path: 'action',
    });
  }

  // 2. Collect @param field names from the matching actionType
  const actionType = schema.actionTypes.find(a => a.name === manifest.action);
  const paramNames = new Set<string>();
  if (actionType) {
    for (const field of actionType.fields) {
      if (field.directives.some(d => d.kind === 'param')) {
        paramNames.add(field.name);
      }
    }
  }

  // 3. Validate effects reference valid types
  //
  // `known` is the executor's context, not just the params. executeCreateObject
  // injects each created object back under the camelCase form of its type name
  // ("ChatMessage" -> "chatMessage") precisely so a later effect can link to it,
  // and that is the only way to link an object an action creates. Validating
  // against paramNames alone reported every such manifest as broken —
  // SendMessage's `to: "chatMessage"` was flagged UNKNOWN_PARAM_REF on every
  // boot, for an action that runs correctly.
  //
  // Bindings accumulate in manifest order because effects execute in manifest
  // order: referencing an object created by a *later* effect is still unknown.
  const known = new Set(paramNames);
  for (let i = 0; i < manifest.effects.length; i++) {
    const effect = manifest.effects[i]!;
    const path = `effects[${i}]`;

    switch (effect.type) {
      case 'updateObject': {
        // Only the root has to be a @param: a dotted target is a link path
        // (`patient.currentBed`), which the executor pre-resolves before
        // effects run — see preResolveLinkPaths in the executor.
        const targetRoot = effect.target.split('.')[0]!;
        if (actionType && paramNames.size > 0 && !known.has(targetRoot)) {
          warnings.push({
            severity: 'warning',
            code: 'UNKNOWN_PARAM_REF',
            message: `${path}.target "${effect.target}" is not a @param field on ${manifest.action}. Known params: ${[...paramNames].join(', ')}.`,
            path: `${path}.target`,
          });
        }
        break;
      }
      case 'createLink': {
        if (!linkTypeNames.has(effect.linkType)) {
          errors.push({
            severity: 'error',
            code: 'UNKNOWN_LINK_TYPE',
            message: `${path}.linkType "${effect.linkType}" does not match any LinkType in the schema.`,
            path: `${path}.linkType`,
          });
        }
        // from/to should reference @param variables
        if (actionType && paramNames.size > 0) {
          if (!known.has(effect.from)) {
            warnings.push({
              severity: 'warning',
              code: 'UNKNOWN_PARAM_REF',
              message: `${path}.from "${effect.from}" is not a @param field on ${manifest.action}.`,
              path: `${path}.from`,
            });
          }
          if (!known.has(effect.to)) {
            warnings.push({
              severity: 'warning',
              code: 'UNKNOWN_PARAM_REF',
              message: `${path}.to "${effect.to}" is not a @param field on ${manifest.action}.`,
              path: `${path}.to`,
            });
          }
        }
        break;
      }
      case 'deleteLink': {
        if (!linkTypeNames.has(effect.linkType)) {
          errors.push({
            severity: 'error',
            code: 'UNKNOWN_LINK_TYPE',
            message: `${path}.linkType "${effect.linkType}" does not match any LinkType in the schema.`,
            path: `${path}.linkType`,
          });
        }
        break;
      }
      case 'updateLink': {
        if (!linkTypeNames.has(effect.linkType)) {
          errors.push({
            severity: 'error',
            code: 'UNKNOWN_LINK_TYPE',
            message: `${path}.linkType "${effect.linkType}" does not match any LinkType in the schema.`,
            path: `${path}.linkType`,
          });
        }
        // filter.from / filter.to should reference @param variables
        if (actionType && paramNames.size > 0) {
          if (effect.filter.from && !known.has(effect.filter.from)) {
            warnings.push({
              severity: 'warning',
              code: 'UNKNOWN_PARAM_REF',
              message: `${path}.filter.from "${effect.filter.from}" is not a @param field on ${manifest.action}.`,
              path: `${path}.filter.from`,
            });
          }
          if (effect.filter.to && !known.has(effect.filter.to)) {
            warnings.push({
              severity: 'warning',
              code: 'UNKNOWN_PARAM_REF',
              message: `${path}.filter.to "${effect.filter.to}" is not a @param field on ${manifest.action}.`,
              path: `${path}.filter.to`,
            });
          }
        }
        break;
      }
      case 'createObject': {
        if (!objectTypeNames.has(effect.objectType)) {
          errors.push({
            severity: 'error',
            code: 'UNKNOWN_OBJECT_TYPE',
            message: `${path}.objectType "${effect.objectType}" does not match any ObjectType in the schema.`,
            path: `${path}.objectType`,
          });
        }
        // Bind it for later effects, exactly as executeCreateObject does —
        // camelCase of the type name, and first write wins.
        const binding = effect.objectType[0]!.toLowerCase() + effect.objectType.slice(1);
        known.add(binding);
        break;
      }
    }
  }

  // 4. Validate CEL expressions reference valid fields (basic check)
  validateCelExpressions(manifest, schema, warnings);
}

/**
 * Basic CEL expression validation — checks that member access patterns
 * reference known @param variables.
 */
function validateCelExpressions(
  manifest: ActionManifest,
  schema: ParsedSchema,
  warnings: ManifestIssue[],
): void {
  const actionType = schema.actionTypes.find(a => a.name === manifest.action);
  if (!actionType) return;

  const paramNames = new Set<string>();
  for (const field of actionType.fields) {
    if (field.directives.some(d => d.kind === 'param')) {
      paramNames.add(field.name);
    }
  }

  // Also include well-known CEL variables
  const knownRoots = new Set([...paramNames, 'actor', 'now', 'params']);

  // Check precondition expressions
  for (let i = 0; i < manifest.preconditions.length; i++) {
    const pc = manifest.preconditions[i]!;
    const roots = extractExpressionRoots(pc.expr);
    for (const root of roots) {
      if (!knownRoots.has(root)) {
        warnings.push({
          severity: 'warning',
          code: 'UNKNOWN_CEL_VARIABLE',
          message: `preconditions[${i}].expr references unknown variable "${root}". Known: ${[...knownRoots].join(', ')}.`,
          path: `preconditions[${i}].expr`,
        });
      }
    }
  }

  // Check effect conditions and set expressions
  for (let i = 0; i < manifest.effects.length; i++) {
    const effect = manifest.effects[i]!;
    if ('condition' in effect && effect.condition) {
      const roots = extractExpressionRoots(effect.condition);
      for (const root of roots) {
        if (!knownRoots.has(root)) {
          warnings.push({
            severity: 'warning',
            code: 'UNKNOWN_CEL_VARIABLE',
            message: `effects[${i}].condition references unknown variable "${root}".`,
            path: `effects[${i}].condition`,
          });
        }
      }
    }
  }
}

/**
 * Extract root variable names from a CEL expression.
 *
 * For "patient.status != 'ACTIVE'", returns ["patient"].
 * For "actor.hasRole('clinician')", returns ["actor"].
 * Excludes string literals and numeric tokens.
 */
function extractExpressionRoots(expr: string): Set<string> {
  const roots = new Set<string>();

  // Remove string literals to avoid false positives
  const cleaned = expr.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

  // Only the ROOT of a member-access chain is a variable. The lookbehind drops
  // any identifier preceded by a dot, which is a property read or a method
  // name, not something the activation has to supply: `patient.status` binds
  // `patient`, and `actor.hasRole('x')` binds `actor`.
  //
  // Without it every property and method in every manifest was reported as an
  // unknown variable, which is what made this pass unusable to turn on.
  const identPattern = /(?<![.\w])([a-zA-Z_]\w*)/g;
  let match: RegExpExecArray | null;
  while ((match = identPattern.exec(cleaned)) !== null) {
    const ident = match[1]!;
    // Skip CEL keywords and boolean/null literals
    if (CEL_KEYWORDS.has(ident)) continue;
    roots.add(ident);
  }

  return roots;
}

const CEL_KEYWORDS = new Set([
  'true', 'false', 'null',
  'in', 'has',
  'int', 'uint', 'double', 'bool', 'string', 'bytes',
  'list', 'map', 'type', 'duration', 'timestamp',
  // Common CEL operators/functions that might appear
  'size', 'exists', 'all', 'filter',
  // Our well-known non-variable tokens
  'ACTIVE', 'DISCHARGED', 'AVAILABLE', 'OCCUPIED',
  'PRIMARY', 'ONE', 'ALL',
  // Common operators
  'and', 'or', 'not',
]);

// Re-export types
export type {
  ActionManifest,
  ActionEffect,
  UpdateObjectEffect,
  CreateLinkEffect,
  UpdateLinkEffect,
  DeleteLinkEffect,
  CreateObjectEffect,
  DeleteObjectEffect,
  RecordConsentEffect,
  Precondition,
  SideEffect,
  RollbackConfig,
  RollbackPolicy,
  UndoConfig,
  UndoOverride,
  ManifestIssue,
  ManifestIssueSeverity,
  ManifestValidationResult,
} from './types.js';
