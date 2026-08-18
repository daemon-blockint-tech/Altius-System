/**
 * In-memory embedded copilot service.
 */

import { randomUUID } from 'node:crypto';
import type {
  EmbeddedCopilotService,
  CopilotInstance,
  CreateCopilotInput,
  CopilotConversation,
  CopilotViewContext,
  CopilotMessage,
  CopilotActionSuggestion,
  CopilotAppContext,
  StartCopilotConversationInput,
  SendCopilotMessageInput,
  RequestContext,
} from '@altius/spi';

// Default system prompts per app context
const DEFAULT_PROMPTS: Record<CopilotAppContext, string> = {
  object_table: 'You are an assistant helping the user analyze data in an object table. You can suggest filters, aggregations, and actions.',
  object_detail: 'You are an assistant helping the user understand a specific object. You can explain properties, suggest related objects to explore, and recommend actions.',
  action_form: 'You are an assistant helping the user fill out an action form. You can suggest parameter values and explain what the action does.',
  ontology_manager: 'You are an assistant helping the user edit the ontology. You can suggest new types, properties, and links.',
  pipeline_builder: 'You are an assistant helping the user build a data pipeline. You can suggest connectors, mappings, and transforms.',
  map_view: 'You are an assistant helping the user explore a geospatial map. You can suggest layers, filters, and spatial searches.',
  graph_explorer: 'You are an assistant helping the user explore a graph. You can suggest traversal paths and filters.',
  dashboard: 'You are an assistant helping the user understand a dashboard. You can explain metrics and suggest drill-downs.',
  general: 'You are a helpful assistant for the Altius platform.',
};

const DEFAULT_SUGGESTED_PROMPTS: Record<CopilotAppContext, string[]> = {
  object_table: ['Show me records with status = active', 'What is the average value by category?', 'Filter by date range'],
  object_detail: ['Explain this object', 'What are the related objects?', 'What actions can I take?'],
  action_form: ['Suggest values for this form', 'What does this action do?', 'Validate my inputs'],
  ontology_manager: ['Suggest a new property', 'What types should I add?', 'Check for schema issues'],
  pipeline_builder: ['Which connector should I use?', 'Suggest a mapping', 'Validate my pipeline'],
  map_view: ['Find objects near this point', 'Show density heatmap', 'Filter by region'],
  graph_explorer: ['Expand this node', 'Find shortest path', 'Show common patterns'],
  dashboard: ['Explain this metric', 'What caused the spike?', 'Suggest a drill-down'],
  general: ['What can you do?', 'Help me get started', 'Search for objects'],
};

export class InMemoryEmbeddedCopilotService implements EmbeddedCopilotService {
  private readonly copilots = new Map<string, Map<string, CopilotInstance>>();
  private readonly conversations = new Map<string, Map<string, CopilotConversation>>();

  async createCopilot(ctx: RequestContext, input: CreateCopilotInput): Promise<CopilotInstance> {
    const id = randomUUID();
    const copilot: CopilotInstance = {
      id, tenantId: ctx.tenantId,
      name: input.name,
      appContext: input.appContext,
      systemPrompt: input.systemPrompt ?? DEFAULT_PROMPTS[input.appContext],
      suggestedPrompts: input.suggestedPrompts ?? DEFAULT_SUGGESTED_PROMPTS[input.appContext],
      canExecuteActions: input.canExecuteActions ?? false,
      canReadData: input.canReadData ?? true,
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getCopilotMap(ctx.tenantId).set(id, copilot);
    return copilot;
  }

  async getCopilot(ctx: RequestContext, id: string): Promise<CopilotInstance | null> {
    return this.copilots.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listCopilots(ctx: RequestContext, appContext?: CopilotAppContext): Promise<CopilotInstance[]> {
    const m = this.copilots.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (appContext) list = list.filter(c => c.appContext === appContext);
    return list;
  }

  async updateCopilot(ctx: RequestContext, id: string, updates: Partial<CreateCopilotInput>): Promise<CopilotInstance> {
    const copilot = this.copilots.get(ctx.tenantId)?.get(id);
    if (!copilot) throw new Error(`Copilot not found: ${id}`);
    const updated: CopilotInstance = {
      ...copilot,
      name: updates.name ?? copilot.name,
      appContext: updates.appContext ?? copilot.appContext,
      systemPrompt: updates.systemPrompt ?? copilot.systemPrompt,
      suggestedPrompts: updates.suggestedPrompts ?? copilot.suggestedPrompts,
      canExecuteActions: updates.canExecuteActions ?? copilot.canExecuteActions,
      canReadData: updates.canReadData ?? copilot.canReadData,
      enabled: updates.enabled ?? copilot.enabled,
    };
    this.getCopilotMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteCopilot(ctx: RequestContext, id: string): Promise<void> {
    this.copilots.get(ctx.tenantId)?.delete(id);
  }

  async startConversation(ctx: RequestContext, input: StartCopilotConversationInput): Promise<CopilotConversation> {
    const copilot = await this.getCopilot(ctx, input.copilotId);
    if (!copilot) throw new Error(`Copilot not found: ${input.copilotId}`);
    const id = randomUUID();
    const now = new Date().toISOString();
    const conversation: CopilotConversation = {
      id, tenantId: ctx.tenantId,
      copilotId: input.copilotId,
      appContext: copilot.appContext,
      viewContext: input.viewContext,
      messages: [],
      userId: ctx.actorId ?? 'system',
      createdAt: now, lastActivityAt: now,
    };
    this.getConversationMap(ctx.tenantId).set(id, conversation);
    if (input.initialMessage) {
      await this.sendMessage(ctx, { conversationId: id, message: input.initialMessage });
    }
    return conversation;
  }

  async getConversation(ctx: RequestContext, conversationId: string): Promise<CopilotConversation | null> {
    return this.conversations.get(ctx.tenantId)?.get(conversationId) ?? null;
  }

  async listConversations(ctx: RequestContext, userId?: string): Promise<CopilotConversation[]> {
    const m = this.conversations.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (userId) list = list.filter(c => c.userId === userId);
    return list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }

  async deleteConversation(ctx: RequestContext, conversationId: string): Promise<void> {
    this.conversations.get(ctx.tenantId)?.delete(conversationId);
  }

  async sendMessage(ctx: RequestContext, input: SendCopilotMessageInput): Promise<CopilotMessage> {
    const conversation = this.conversations.get(ctx.tenantId)?.get(input.conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${input.conversationId}`);
    const copilot = await this.getCopilot(ctx, conversation.copilotId);
    if (!copilot) throw new Error(`Copilot not found: ${conversation.copilotId}`);
    const now = new Date().toISOString();
    // Update view context if provided
    if (input.viewContext) conversation.viewContext = input.viewContext;
    // Add user message
    const userMsg: CopilotMessage = { id: randomUUID(), role: 'user', content: input.message, timestamp: now };
    conversation.messages.push(userMsg);
    // Generate assistant response
    const response = this.generateResponse(input.message, copilot.appContext, conversation.viewContext);
    const assistantMsg: CopilotMessage = {
      id: randomUUID(), role: 'assistant', content: response.content, timestamp: new Date().toISOString(),
      suggestedActions: response.actions,
    };
    conversation.messages.push(assistantMsg);
    conversation.lastActivityAt = new Date().toISOString();
    this.getConversationMap(ctx.tenantId).set(input.conversationId, conversation);
    return assistantMsg;
  }

  async getSuggestedActions(ctx: RequestContext, copilotId: string, viewContext: CopilotViewContext): Promise<CopilotActionSuggestion[]> {
    const copilot = await this.getCopilot(ctx, copilotId);
    if (!copilot || !copilot.canExecuteActions) return [];
    // Generate context-aware suggestions
    const suggestions: CopilotActionSuggestion[] = [];
    if (viewContext.objectType) {
      suggestions.push({
        actionName: 'update',
        label: `Update ${viewContext.objectType}`,
        description: `Modify the selected ${viewContext.objectType}`,
        confidence: 0.7,
      });
    }
    if (viewContext.selectedObjectIds && viewContext.selectedObjectIds.length > 0) {
      suggestions.push({
        actionName: 'bulk_update',
        label: 'Bulk update selected',
        description: `Update ${viewContext.selectedObjectIds.length} selected objects`,
        confidence: 0.6,
      });
    }
    return suggestions;
  }

  async getSuggestedPrompts(ctx: RequestContext, copilotId: string, _viewContext: CopilotViewContext): Promise<string[]> {
    const copilot = await this.getCopilot(ctx, copilotId);
    if (!copilot) return [];
    return copilot.suggestedPrompts;
  }

  private generateResponse(message: string, appContext: CopilotAppContext, viewContext: CopilotViewContext): { content: string; actions?: CopilotActionSuggestion[] } {
    const lower = message.toLowerCase();
    // Simple rule-based responses
    if (lower.includes('filter') || lower.includes('search')) {
      return {
        content: `I can help you filter ${viewContext.objectType ?? 'objects'}. What criteria would you like to filter by?`,
      };
    }
    if (lower.includes('explain') || lower.includes('what is')) {
      return {
        content: `Here's what I can tell you about ${viewContext.objectType ?? 'this view'}: it shows ${viewContext.objectType ?? 'objects'}${viewContext.filter ? ' with filter applied' : ''}. You can explore properties, take actions, or drill down for more details.`,
      };
    }
    if (lower.includes('action') || lower.includes('do')) {
      return {
        content: `Available actions depend on your permissions. For ${viewContext.objectType ?? 'this context'}, you can typically update, create, or delete objects.`,
        actions: viewContext.objectType ? [{
          actionName: 'update',
          label: `Update ${viewContext.objectType}`,
          description: `Modify the selected ${viewContext.objectType}`,
          confidence: 0.7,
        }] : undefined,
      };
    }
    return {
      content: `I'm here to help with ${appContext.replace('_', ' ')}. You can ask me to filter, search, explain, or suggest actions. What would you like to do?`,
    };
  }

  private getCopilotMap(tenantId: string): Map<string, CopilotInstance> {
    let m = this.copilots.get(tenantId);
    if (!m) { m = new Map(); this.copilots.set(tenantId, m); }
    return m;
  }
  private getConversationMap(tenantId: string): Map<string, CopilotConversation> {
    let m = this.conversations.get(tenantId);
    if (!m) { m = new Map(); this.conversations.set(tenantId, m); }
    return m;
  }
}
