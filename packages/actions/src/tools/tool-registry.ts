/**
 * Tool registry (Section 5.7).
 *
 * Generates ToolDescriptors from ActionTypes and manifests so that AI agents
 * can discover available actions, understand their parameters, and invoke
 * them with dry-run support and policy guards.
 */

import type { ParsedSchema, ActionType, FieldDefinition } from '@altius/odl';
import type { ActionManifest } from '../parser/types.js';
import type { ActionExecutor } from '../executor/action-executor.js';
import type { ActionActor, ActionContext, ActionResult } from '../executor/types.js';
import type {
  ToolDescriptor,
  ToolFilter,
  JsonSchema,
  AgentContext,
  AgentExecutionResult,
  PolicyGuard,
  RiskLevel,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JSON Schema for ActionResult. */
const ACTION_RESULT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the action succeeded' },
    actionId: { type: 'string', description: 'Unique action execution ID' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['code', 'message'],
      },
      description: 'Errors if action failed',
    },
    affectedObjects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          id: { type: 'string' },
          changeType: { type: 'string', enum: ['created', 'updated', 'deleted'] },
        },
        required: ['type', 'id', 'changeType'],
      },
      description: 'Objects affected by the action',
    },
  },
  required: ['success', 'actionId', 'errors', 'affectedObjects'],
};

// ---------------------------------------------------------------------------
// ODL type -> JSON Schema mapping
// ---------------------------------------------------------------------------

const SCALAR_TYPE_MAP: Record<string, string> = {
  String: 'string',
  Int: 'integer',
  Float: 'number',
  Boolean: 'boolean',
  ID: 'string',
  DateTime: 'string',
  Date: 'string',
  JSON: 'object',
};

/**
 * JSON Schema `format` for the scalars that have one.
 *
 * `type: 'string'` alone tells a form generator nothing about a Date, so it
 * renders a text box and the value is only rejected later — by the provider, in
 * a message that names a column rather than the field the user typed into.
 */
const SCALAR_FORMAT_MAP: Record<string, string> = {
  Date: 'date',
  DateTime: 'date-time',
};

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export interface ToolRegistryConfig {
  /** Parsed ODL schema. */
  schema: ParsedSchema;
  /** Map of action name -> parsed manifest. */
  manifests: Map<string, ActionManifest>;
  /** Action executor for agent execution. */
  executor?: ActionExecutor;
  /** Policy guard for high-risk action approval. */
  policyGuard?: PolicyGuard;
  /** Risk level classification for actions. Default: all 'low'. */
  riskLevels?: Map<string, RiskLevel>;
}

export class ToolRegistry {
  private readonly schema: ParsedSchema;
  private readonly manifests: Map<string, ActionManifest>;
  private readonly executor?: ActionExecutor;
  private readonly policyGuard?: PolicyGuard;
  private readonly riskLevels: Map<string, RiskLevel>;

  constructor(config: ToolRegistryConfig) {
    this.schema = config.schema;
    this.manifests = config.manifests;
    this.executor = config.executor;
    this.policyGuard = config.policyGuard;
    this.riskLevels = config.riskLevels ?? new Map();
  }

  /**
   * Return all available tool descriptors, optionally filtered.
   */
  availableTools(filter?: ToolFilter): ToolDescriptor[] {
    const descriptors: ToolDescriptor[] = [];

    for (const actionType of this.schema.actionTypes) {
      const manifest = this.manifests.get(actionType.name);
      const descriptor = this.buildDescriptor(actionType, manifest);

      if (this.matchesFilter(descriptor, filter)) {
        descriptors.push(descriptor);
      }
    }

    return descriptors;
  }

  /**
   * Execute an action in agent mode with dry-run and policy guard support.
   *
   * @param actionName   - Name of the action to execute
   * @param params       - Action parameters
   * @param actor        - The actor (agent)
   * @param ctx          - Execution context
   * @param agentContext  - Agent-specific context (dry-run, session, etc.)
   */
  async executeForAgent(
    actionName: string,
    params: Record<string, unknown>,
    actor: ActionActor,
    ctx: ActionContext,
    agentContext: AgentContext,
  ): Promise<AgentExecutionResult> {
    if (!this.executor) {
      throw new Error('Executor not configured on ToolRegistry');
    }

    const manifest = this.manifests.get(actionName);
    if (!manifest) {
      throw new Error(`No manifest found for action: ${actionName}`);
    }

    // Policy guard: check high-risk actions for approval
    const riskLevel = this.riskLevels.get(actionName) ?? 'low';
    if (this.policyGuard && riskLevel === 'high') {
      const guardResult = await this.policyGuard.evaluate(
        actionName,
        riskLevel,
        agentContext,
      );

      if (!guardResult.allowed) {
        return {
          result: {
            success: false,
            actionId: '',
            errors: [{
              code: 'POLICY_HOLD',
              message: guardResult.reason ?? `Action ${actionName} held for approval`,
            }],
            affectedObjects: [],
          },
          dryRun: agentContext.dryRun,
          held: true,
          holdId: guardResult.holdId,
        };
      }
    }

    // Dry-run: validate without committing
    if (agentContext.dryRun) {
      const dryRunResult = await this.executeDryRun(
        manifest,
        params,
        actor,
        ctx,
      );
      return {
        result: dryRunResult,
        dryRun: true,
      };
    }

    // Full execution
    const result = await this.executor.execute(
      manifest,
      params,
      actor,
      ctx,
      this.schema,
    );

    return {
      result,
      dryRun: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Descriptor generation
  // ---------------------------------------------------------------------------

  /**
   * Build a ToolDescriptor for an ActionType.
   */
  private buildDescriptor(
    actionType: ActionType,
    manifest?: ActionManifest,
  ): ToolDescriptor {
    return {
      name: actionType.name,
      kind: 'ACTION',
      description: actionType.description ?? `Execute ${actionType.name} action`,
      parameters: this.buildParametersSchema(actionType),
      returnType: ACTION_RESULT_SCHEMA,
      requiredPermissions: this.extractPermissions(actionType, manifest),
      dryRunSupported: true,
      reversible: manifest?.reversible ?? false,
    };
  }

  /**
   * Generate JSON Schema from @param fields.
   */
  private buildParametersSchema(actionType: ActionType): JsonSchema {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const field of actionType.fields) {
      const isParam = field.directives.some((d) => d.kind === 'param');
      if (!isParam) continue;

      properties[field.name] = this.fieldToJsonSchema(field);

      if (field.type.nonNull) {
        required.push(field.name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  /**
   * Convert an ODL field definition to JSON Schema.
   */
  private fieldToJsonSchema(field: FieldDefinition): JsonSchema {
    const schema: JsonSchema = {};

    if (field.description) {
      schema.description = field.description;
    }

    const element = this.typeNameToJsonSchema(field.type.name);

    if (field.type.isList) {
      schema.type = 'array';
      schema.items = element;
      return schema;
    }

    // Merge the element schema onto the field schema, keeping the field's own
    // description as the lead when it has one.
    const { description: elementDescription, ...rest } = element;
    Object.assign(schema, rest);
    if (elementDescription) {
      schema.description = schema.description
        ? `${schema.description}. ${elementDescription}`
        : elementDescription;
    }

    return schema;
  }

  /**
   * Map one ODL type name onto its JSON Schema form.
   *
   * Shared by the scalar and the list-element path: an enum inside a list is
   * still an enum, and handling it in only one of the two branches is how a
   * `[PatientStatus!]!` param silently became an array of free text.
   */
  private typeNameToJsonSchema(typeName: string): JsonSchema {
    const scalar = SCALAR_TYPE_MAP[typeName];
    if (scalar) {
      const schema: JsonSchema = { type: scalar };
      // Without a format, a generated form renders a free-text box for a date
      // and the value only fails at the storage layer, if at all. These are the
      // standard JSON Schema formats every form generator already understands.
      const format = SCALAR_FORMAT_MAP[typeName];
      if (format) schema.format = format;
      return schema;
    }

    // An enum is a closed set the caller must pick from, and the schema is the
    // only place a client can learn the members. Emitting it as a bare string
    // (worse, as an "ID reference") turns a dropdown into free text and makes
    // every invalid value a round trip to the server to discover.
    const enumDef = this.schema.enums.find(e => e.name === typeName);
    if (enumDef) {
      return { type: 'string', enum: enumDef.values.map(v => v.name) };
    }

    // Object type reference -> string ID.
    return { type: 'string', description: `ID reference to ${typeName}` };
  }

  /**
   * Extract required permissions from manifest preconditions and action type.
   */
  private extractPermissions(
    actionType: ActionType,
    manifest?: ActionManifest,
  ): string[] {
    const permissions: string[] = [];

    // The action itself requires an execute permission
    permissions.push(`action:${actionType.name}:execute`);

    // Extract role-based constraints from preconditions (if they reference actor.roles)
    if (manifest) {
      for (const pre of manifest.preconditions) {
        const roleMatch = pre.expr.match(/actor\.roles\s*\.contains\(\s*['"]([^'"]+)['"]\s*\)/);
        if (roleMatch) {
          permissions.push(`role:${roleMatch[1]}`);
        }
      }
    }

    return permissions;
  }

  // ---------------------------------------------------------------------------
  // Dry-run execution
  // ---------------------------------------------------------------------------

  /**
   * Execute validation-only (dry-run): validate params, check authz,
   * evaluate preconditions, but do NOT commit effects or side-effects.
   */
  private async executeDryRun(
    manifest: ActionManifest,
    params: Record<string, unknown>,
    _actor: ActionActor,
    _ctx: ActionContext,
  ): Promise<ActionResult> {
    if (!this.executor) {
      throw new Error('Executor not configured');
    }

    // We reuse the full executor but in a mode where the transaction
    // will be rolled back. For now, we validate by running the pipeline
    // and catching the result. The executor's validate + authorize +
    // precondition steps run before any effects.
    //
    // In a production implementation, we'd add a dryRun flag to the
    // executor. For now, we return a synthetic success after validation.
    const actionType = this.schema.actionTypes.find(
      (at) => at.name === manifest.action,
    );

    // Validate parameters
    if (actionType) {
      const errors = [];
      for (const field of actionType.fields) {
        const isParam = field.directives.some((d) => d.kind === 'param');
        if (!isParam) continue;
        if (field.type.nonNull && (params[field.name] === undefined || params[field.name] === null)) {
          errors.push({
            code: 'MISSING_REQUIRED_PARAM',
            message: `Required parameter "${field.name}" is missing`,
            path: `params.${field.name}`,
          });
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          actionId: `dryrun_${Date.now().toString(36)}`,
          errors,
          affectedObjects: [],
        };
      }
    }

    // Parameter validation passed. Authorization and precondition evaluation
    // are not performed in dry-run mode — callers should not treat this as a
    // guarantee that the action will succeed when executed for real.
    return {
      success: true,
      actionId: `dryrun_${Date.now().toString(36)}`,
      errors: [],
      affectedObjects: [],
      warnings: [
        'Dry-run validated parameters only. Authorization checks and precondition evaluation were not performed.',
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Filter matching
  // ---------------------------------------------------------------------------

  private matchesFilter(descriptor: ToolDescriptor, filter?: ToolFilter): boolean {
    if (!filter) return true;

    if (filter.kind && descriptor.kind !== filter.kind) {
      return false;
    }

    if (filter.namePattern) {
      if (!descriptor.name.toLowerCase().includes(filter.namePattern.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Provider-format tool mappings (T5)
  // ---------------------------------------------------------------------------

  /**
   * Export tools in the Anthropic Messages API tool format.
   * Each tool becomes `{ name, description, input_schema }` where
   * `input_schema` is the ToolDescriptor's JSON Schema parameters.
   *
   * @param filter Optional filter (same as availableTools)
   * @returns Array of Anthropic-format tool definitions
   */
  toAnthropicTools(filter?: ToolFilter): Array<{
    name: string;
    description: string;
    input_schema: JsonSchema;
  }> {
    return this.availableTools(filter).map(d => ({
      name: d.name,
      description: d.description,
      input_schema: d.parameters,
    }));
  }

  /**
   * Export tools in the OpenAI function-calling tool format.
   * Each tool becomes `{ type: 'function', function: { name, description, parameters } }`.
   *
   * @param filter Optional filter (same as availableTools)
   * @returns Array of OpenAI-format tool definitions
   */
  toOpenAiTools(filter?: ToolFilter): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: JsonSchema };
  }> {
    return this.availableTools(filter).map(d => ({
      type: 'function' as const,
      function: {
        name: d.name,
        description: d.description,
        parameters: d.parameters,
      },
    }));
  }

  /**
   * Export tools for LangChain's `tool()` factory, with execution already
   * bound to executeForAgent.
   *
   * Bound, unlike the two exporters above, because of where the frameworks
   * differ: those hand a descriptor to a model and the CALLER dispatches the
   * resulting tool call, so a descriptor is the whole job. LangChain's `tool()`
   * takes the schema and the implementation together, so the natural unit here
   * already contains invocation — and if this returned descriptors only, every
   * caller would write that implementation themselves, against
   * ActionExecutor.execute, and lose the governance that makes agent execution
   * different from ordinary execution: the PolicyGuard hold on high-risk
   * actions, dry-run, and the agentId/sessionId/model attribution the audit
   * trail needs to tell an agent's write from a human's. Binding it here means
   * that cannot be skipped by accident.
   *
   * No `@langchain/core` import: the return shape is what `tool()`'s second
   * argument accepts, and `parameters` is already JSON Schema, which LangChain
   * takes in place of a Zod schema. Depending on the framework to export to it
   * would put a UI-layer dependency in the actions package for no gain, which
   * is why the Anthropic and OpenAI exporters return plain objects too.
   *
   * Usage:
   *   const tools = registry
   *     .toLangChainTools(actor, ctx, { agentId, sessionId, dryRun: false })
   *     .map(d => tool(d.invoke, { name: d.name, description: d.description, schema: d.schema }));
   *
   * `invoke` resolves with the full AgentExecutionResult rather than throwing
   * or flattening to a string: a held action is not a failure and not a
   * success, and `held`/`holdId` is the only way the agent learns it needs an
   * approval rather than a retry.
   *
   * @param actor  The agent acting, as ActionExecutor understands actors
   * @param ctx    Execution context (tenant, trace)
   * @param agentContext Carries dryRun and the audit attribution
   * @param filter Optional filter (same as availableTools)
   */
  toLangChainTools(
    actor: ActionActor,
    ctx: ActionContext,
    agentContext: AgentContext,
    filter?: ToolFilter,
  ): Array<{
    name: string;
    description: string;
    schema: JsonSchema;
    invoke: (args: Record<string, unknown>) => Promise<AgentExecutionResult>;
  }> {
    const descriptors = this.availableTools(filter);

    // Fail at export, not at the first tool call. executeForAgent throws
    // without an executor anyway, but by then the tools are bound into an
    // agent and the failure surfaces mid-conversation as a tool error the
    // model will try to work around.
    if (!this.executor) {
      throw new Error(
        'toLangChainTools requires an executor on ToolRegistry: the returned tools execute actions.',
      );
    }

    // A high-risk action with no PolicyGuard would execute unheld, and nothing
    // would say so — the guard is skipped by absence, not by decision. That is
    // the one failure this exporter exists to prevent, so it is an error rather
    // than a warning.
    //
    // Note the converse is NOT checked here: when riskLevels is empty every
    // action defaults to 'low' and no guard is ever consulted. That is
    // executeForAgent's own default and predates this method; classifying
    // actions is the caller's job, and inventing a default here would silently
    // change behaviour for the existing callers of executeForAgent.
    if (!this.policyGuard) {
      const highRisk = descriptors
        .map(d => d.name)
        .filter(name => this.riskLevels.get(name) === 'high');
      if (highRisk.length > 0) {
        throw new Error(
          `toLangChainTools: no policyGuard configured, but these tools are high-risk: ` +
          `${highRisk.join(', ')}. Configure a PolicyGuard, or exclude them with a filter.`,
        );
      }
    }

    return descriptors.map(d => ({
      name: d.name,
      description: d.description,
      schema: d.parameters,
      invoke: (args: Record<string, unknown>) =>
        this.executeForAgent(d.name, args ?? {}, actor, ctx, agentContext),
    }));
  }
}
