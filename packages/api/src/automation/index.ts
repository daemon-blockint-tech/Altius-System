export { parseAutomationManifest, parseIntervalMs } from './parser.js';
export { AutomationRunner } from './runner.js';
export type { AutomationRunnerDeps, AutomationLogger } from './runner.js';
export type {
  AutomationManifest,
  AutomationTrigger,
  EventTrigger,
  ScheduleTrigger,
  ChangeKind,
  ParamMapping,
  AutomationActor,
} from './types.js';
