/**
 * @altius/odl - Ontology Definition Language parser, validator, and codegen.
 *
 * Parses GraphQL SDL files extended with Altius directives
 * into a structured ParsedSchema AST, validates structural correctness,
 * and generates GraphQL API schemas per the Altius spec.
 */

export { parseOdl, mergeInterfaceFields } from './parser/index.js';
export { validateSchema } from './validator/index.js';
export { generateGraphQLSchema } from './codegen/index.js';
export { diff, classify, reverseDiff } from './diff/index.js';
export { InMemorySchemaRegistry } from './registry/index.js';
export {
  generateOpenFGASchema,
  actionPermissionRelation,
  deriveActionAuthzMapping,
  deriveFunctionAuthzMapping,
  toSnakeCase,
  generateOpenFGAModel,
  renderOpenFGADSL,
  mergeOpenFGAOverrides,
} from './codegen/openfga.js';
export type { ActionAuthzMapping, FunctionAuthzMapping } from './codegen/openfga.js';
export { generateSdk } from './codegen/sdk.js';

export type { SdkOutput } from './codegen/sdk.js';

export type {
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
} from './validator/types.js';

export type {
  SchemaDiff,
  SchemaChange,
  MigrationClass,
  FieldAddition,
  FieldRemoval,
  FieldModification,
  TypeAddition,
  TypeRemoval,
  EnumValueAddition,
  EnumValueRemoval,
  LinkModification,
  FunctionModification,
  TypeModification,
} from './diff/types.js';

export type {
  ParsedSchema,
  NamespaceMetadata,
  ObjectType,
  LinkType,
  ActionType,
  FunctionType,
  EnumDefinition,
  EnumValue,
  InterfaceDefinition,
  ScalarDefinition,
  StructDefinition,
  FieldDefinition,
  FieldTypeRef,
  FieldDirective,
  TypeDirective,
  DirectiveArgValue,
  Cardinality,
  Direction,
  CacheStrategy,
  PrimaryDirective,
  UniqueDirective,
  IndexedDirective,
  ReadonlyDirective,
  ImmutableDirective,
  SensitiveDirective,
  ParamDirective,
  LinkDirective,
  ComputedDirective,
  ReducerDirective,
  ReducerFunction,
  ConstraintDirective,
  DefaultDirective,
  DeprecatedDirective,
  TerminologyDirective,
  SearchableDirective,
  ObjectTypeDirective,
  LinkTypeDirective,
  ActionTypeDirective,
  FunctionDirective,
  TypeConstraintDirective,
} from './parser/types.js';

export type {
  SchemaRegistry,
  SchemaVersion,
  ApplySchemaOptions,
  MigrationPlan,
} from './registry/types.js';
