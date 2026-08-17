// Objects
export {
  ObjectManager,
  type ObjectManagerConfig,
  validateObjectProperties,
  validateSchemaFields,
  validationError,
  type ValidationFailure,
  type ValidationResult,
  type CelEvaluator,
  type CelEvalResult,
} from './objects/index.js';

// Links
export {
  LinkManager,
  type LinkManagerConfig,
  generateUUIDv7,
} from './links/index.js';

// Events
export {
  type EventBus,
  InMemoryEventBus,
  EngineEventEmitter,
  type EventCause,
  type ChangeSet,
  type ObjectEventData,
  type LinkEventData,
} from './events/index.js';

// Computed fields
export {
  ComputedFieldEvaluator,
  type ComputedFieldEvaluatorConfig,
  type ComputeContext,
  type ComputeFunction,
} from './computed/index.js';

// Lineage
export {
  LineageRecorder,
  type LineageRecorderConfig,
  type LineageStore,
  type LineageQueryOptions,
  InMemoryLineageStore,
} from './lineage/index.js';

// Object Sets
export {
  InMemoryObjectSetStore,
  ObjectSetManager,
} from './object-sets/index.js';

// Functions
export {
  FunctionExecutor,
  type FunctionExecutorConfig,
  type FunctionRuntime,
  type FunctionRuntimeContext,
  type FunctionOntologyAccess,
  type FunctionExecutionResult,
  type FunctionLogEntry,
  NodeFunctionRuntime,
  type NodeRuntimeConfig,
  type NodeRuntimeHelpers,
  CelFunctionRuntime,
  // The isolating runtime was reachable from './functions/index.js' but not
  // from this barrel, so the API package could not import it even deliberately
  // — which is why production still ran pack code in-process.
  IsolatedNodeFunctionRuntime,
  type IsolatedNodeRuntimeConfig,
  FunctionRegistry,
  type FunctionRevision,
  type FunctionRevisionStatus,
  type CreateFunctionRevisionInput,
  type TestRunResult,
  PythonFunctionRuntime,
  type PythonRuntimeConfig,
  GitFunctionSource,
  type GitRepoConfig,
  type GitOperationResult,
  repoIdForUrl,
  FunctionPipeline,
  type PipelineStage,
  type PipelineResult,
  type PipelineConfig,
} from './functions/index.js';

// LLM Client
export { NoOpLLMClient } from './llm/noop-llm-client.js';
export { AnthropicLLMClient, LLMProviderError, readTextDeltas } from './llm/anthropic-llm-client.js';
export type { AnthropicLLMClientConfig } from './llm/anthropic-llm-client.js';
export { createLLMClient } from './llm/create-llm-client.js';
export type { LLMEnv } from './llm/create-llm-client.js';
