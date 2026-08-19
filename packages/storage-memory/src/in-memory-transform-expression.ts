/**
 * In-memory transform expression service.
 */

import type {
  TransformExpressionService,
  TransformFunction,
  TransformExpressionInput,
  TransformExpressionResult,
} from '@altius/spi';

const FUNCTIONS: TransformFunction[] = [
  { name: 'toUpper', displayName: 'To upper case', inputTypes: ['String'], outputType: 'String', description: 'Converts a string to upper case.' },
  { name: 'toLower', displayName: 'To lower case', inputTypes: ['String'], outputType: 'String', description: 'Converts a string to lower case.' },
  { name: 'trim', displayName: 'Trim whitespace', inputTypes: ['String'], outputType: 'String', description: 'Removes leading and trailing whitespace.' },
  { name: 'coalesce', displayName: 'Coalesce', inputTypes: ['String', 'Int', 'Float', 'Boolean', 'JSON'], outputType: 'JSON', description: 'Returns the first non-null value from a list.' },
  { name: 'concat', displayName: 'Concatenate', inputTypes: ['String'], outputType: 'String', description: 'Concatenates strings with an optional separator.' },
  { name: 'length', displayName: 'Length', inputTypes: ['String', 'Array'], outputType: 'Int', description: 'Returns the length of a string or array.' },
];

export class InMemoryTransformExpressionService implements TransformExpressionService {
  listFunctions(): TransformFunction[] {
    return FUNCTIONS;
  }

  async evaluate(input: TransformExpressionInput): Promise<TransformExpressionResult> {
    const startedAt = Date.now();
    const { function: fn, arguments: args } = input;
    let result: unknown = null;

    switch (fn) {
      case 'toUpper':
        result = typeof args['value'] === 'string' ? args['value'].toUpperCase() : args['value'];
        break;
      case 'toLower':
        result = typeof args['value'] === 'string' ? args['value'].toLowerCase() : args['value'];
        break;
      case 'trim':
        result = typeof args['value'] === 'string' ? args['value'].trim() : args['value'];
        break;
      case 'coalesce': {
        const values = Array.isArray(args['values']) ? args['values'] : [args['value']];
        result = values.find((v: unknown) => v !== null && v !== undefined) ?? null;
        break;
      }
      case 'concat': {
        const values = Array.isArray(args['values']) ? args['values'] : [args['value']];
        const sep = typeof args['separator'] === 'string' ? args['separator'] : '';
        result = values.map(String).join(sep);
        break;
      }
      case 'length':
        if (Array.isArray(args['value']) || typeof args['value'] === 'string') {
          result = (args['value'] as string | unknown[]).length;
        } else {
          result = 0;
        }
        break;
      default:
        throw new Error(`Unknown transform function: ${fn}`);
    }

    return {
      result,
      function: fn,
      inputType: input.inputType,
      durationMs: Date.now() - startedAt,
    };
  }
}
