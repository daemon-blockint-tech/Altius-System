/**
 * Embedded AI copilots across platform applications.
 *
 * Provides in-app assistant surfaces with context passing from the
 * current view, LLM-powered responses, and action suggestions.
 */

import type { RequestContext } from './ontology.js';

// ===========================================================================
// Copilot instances
// ===========================================================================

/** The application context a copilot is embedded in. */
export type CopilotAppContext =
  | 'object_table'      // viewing an object table/list
  | 'object_detail'     // viewing a single object
  | 'action_form'       // filling out an action form
  | 'ontology_manager'  // editing the ontology
  | 'pipeline_builder'  // building a data pipeline
  | 'map_view'          // viewing a geospatial map
  | 'graph_explorer'    // exploring a graph
  | 'dashboard'         // viewing a dashboard
  | 'general';          // general-purpose

/** A copilot instance — an embedded assistant configured for a specific app context. */
export interface CopilotInstance {
  id: string;
  tenantId: string;
  /** Copilot name. */
  name: string;
  /** The app context this copilot is embedded in. */
  appContext: CopilotAppContext;
  /** System prompt for the copilot. */
  systemPrompt: string;
  /** Suggested prompts for the user. */
  suggestedPrompts: string[];
  /** Whether the copilot can execute actions. */
  canExecuteActions: boolean;
  /** Whether the copilot can read object data. */
  canReadData: boolean;
  /** Whether the copilot is enabled. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the copilot. */
  createdBy: string;
}

/** Input for creating a copilot instance. */
export interface CreateCopilotInput {
  name: string;
  appContext: CopilotAppContext;
  systemPrompt?: string;
  suggestedPrompts?: string[];
  canExecuteActions?: boolean;
  canReadData?: boolean;
  enabled?: boolean;
}

// ===========================================================================
// Copilot conversations
// ===========================================================================

/** A copilot conversation — a chat session within an app context. */
export interface CopilotConversation {
  id: string;
  tenantId: string;
  /** Copilot instance ID. */
  copilotId: string;
  /** The app context for this conversation. */
  appContext: CopilotAppContext;
  /** Context data from the current view. */
  viewContext: CopilotViewContext;
  /** Conversation messages. */
  messages: CopilotMessage[];
  /** User ID who owns the conversation. */
  userId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last activity timestamp. */
  lastActivityAt: string;
}

/** Context data passed from the current view to the copilot. */
export interface CopilotViewContext {
  /** The object type being viewed (if any). */
  objectType?: string;
  /** The object ID being viewed (if any). */
  objectId?: string;
  /** The current filter applied (if any). */
  filter?: Record<string, unknown>;
  /** The current selection (object IDs). */
  selectedObjectIds?: string[];
  /** The current action being filled (if in action form). */
  actionName?: string;
  /** Additional context key-value pairs. */
  metadata?: Record<string, unknown>;
}

/** A message in a copilot conversation. */
export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Action suggestions from the assistant. */
  suggestedActions?: CopilotActionSuggestion[];
  /** Whether the message includes a data query result. */
  dataResult?: {
    query: string;
    rowCount: number;
    columns?: string[];
  };
  /** Whether the message is streaming. */
  streaming?: boolean;
}

/** An action suggestion from the copilot. */
export interface CopilotActionSuggestion {
  actionName: string;
  label: string;
  description: string;
  /** Pre-filled parameters for the action. */
  prefillParams?: Record<string, unknown>;
  /** Confidence score (0-1). */
  confidence: number;
}

// ===========================================================================
// Copilot service
// ===========================================================================

/** Input for starting a copilot conversation. */
export interface StartCopilotConversationInput {
  copilotId: string;
  viewContext: CopilotViewContext;
  initialMessage?: string;
}

/** Input for sending a message to a copilot. */
export interface SendCopilotMessageInput {
  conversationId: string;
  message: string;
  /** Updated view context (if the user navigated). */
  viewContext?: CopilotViewContext;
}

/**
 * Embedded AI copilots service — manages copilot instances, conversations,
 * and LLM-powered responses with app context.
 */
export interface EmbeddedCopilotService {
  // ── Copilot instances ──
  createCopilot(ctx: RequestContext, input: CreateCopilotInput): Promise<CopilotInstance>;
  getCopilot(ctx: RequestContext, id: string): Promise<CopilotInstance | null>;
  listCopilots(ctx: RequestContext, appContext?: CopilotAppContext): Promise<CopilotInstance[]>;
  updateCopilot(ctx: RequestContext, id: string, updates: Partial<CreateCopilotInput>): Promise<CopilotInstance>;
  deleteCopilot(ctx: RequestContext, id: string): Promise<void>;

  // ── Conversations ──
  startConversation(ctx: RequestContext, input: StartCopilotConversationInput): Promise<CopilotConversation>;
  getConversation(ctx: RequestContext, conversationId: string): Promise<CopilotConversation | null>;
  listConversations(ctx: RequestContext, userId?: string): Promise<CopilotConversation[]>;
  deleteConversation(ctx: RequestContext, conversationId: string): Promise<void>;

  // ── Messaging ──
  /** Send a message to the copilot and get a response. */
  sendMessage(ctx: RequestContext, input: SendCopilotMessageInput): Promise<CopilotMessage>;
  /** Get suggested actions for the current view context. */
  getSuggestedActions(ctx: RequestContext, copilotId: string, viewContext: CopilotViewContext): Promise<CopilotActionSuggestion[]>;
  /** Get suggested prompts for the current view context. */
  getSuggestedPrompts(ctx: RequestContext, copilotId: string, viewContext: CopilotViewContext): Promise<string[]>;
}
