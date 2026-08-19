/**
 * Schema-driven transform expression library.
 *
 * Simple per-type transforms (toUpper, coalesce, concat, trim, etc.)
 * that can be evaluated against a value and an input ODL type.
 */

export interface TransformFunction {
  name: string;
  displayName: string;
  inputTypes: string[];
  outputType: string;
  description?: string;
}

export interface TransformExpressionInput {
  function: string;
  inputType: string;
  arguments: Record<string, unknown>;
}

export interface TransformExpressionResult {
  result: unknown;
  function: string;
  inputType: string;
  durationMs: number;
}

/**
 * Transform expression service — schema-driven value transforms.
 */
export interface TransformExpressionService {
  /** List all available transform functions. */
  listFunctions(): TransformFunction[];

  /** Evaluate a transform expression against a value. */
  evaluate(input: TransformExpressionInput): Promise<TransformExpressionResult>;
}
