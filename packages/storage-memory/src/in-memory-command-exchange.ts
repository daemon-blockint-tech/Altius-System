/**
 * In-memory command exchange service.
 */

import { randomUUID } from 'node:crypto';
import type {
  CommandExchangeService,
  DeclaredCommand,
  DeclareCommandInput,
  CommandExecution,
  DragDropEvent,
  RecordDragDropInput,
  PairSyncEvent,
  RecordPairInput,
  RequestContext,
} from '@altius/spi';

export class InMemoryCommandExchangeService implements CommandExchangeService {
  private readonly commands = new Map<string, Map<string, DeclaredCommand>>();
  private readonly executions = new Map<string, Map<string, CommandExecution>>();
  private readonly dragDrops = new Map<string, Map<string, DragDropEvent>>();
  private readonly pairs = new Map<string, Map<string, PairSyncEvent>>();

  async declareCommand(ctx: RequestContext, input: DeclareCommandInput): Promise<DeclaredCommand> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const cmd: DeclaredCommand = {
      id,
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? '',
      sourceAppId: input.sourceAppId,
      targetAppIds: input.targetAppIds ?? [],
      inputSchema: input.inputSchema ?? { type: 'object' },
      outputSchema: input.outputSchema,
      availableAsTool: input.availableAsTool ?? false,
      chainable: input.chainable ?? false,
      createdAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getCmdMap(ctx.tenantId).set(id, cmd);
    return cmd;
  }

  async listDeclaredCommands(ctx: RequestContext, sourceAppId?: string): Promise<DeclaredCommand[]> {
    const m = this.commands.get(ctx.tenantId);
    if (!m) return [];
    const list = Array.from(m.values());
    if (sourceAppId) return list.filter(c => c.sourceAppId === sourceAppId);
    return list;
  }

  async getDeclaredCommand(ctx: RequestContext, id: string): Promise<DeclaredCommand | null> {
    return this.commands.get(ctx.tenantId)?.get(id) ?? null;
  }

  async executeCommand(
    ctx: RequestContext,
    id: string,
    input: { targetAppId: string; payload: Record<string, unknown> },
  ): Promise<CommandExecution> {
    const declared = this.commands.get(ctx.tenantId)?.get(id);
    if (!declared) throw new Error(`Declared command not found: ${id}`);
    const exec: CommandExecution = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      commandId: id,
      sourceAppId: declared.sourceAppId,
      targetAppId: input.targetAppId,
      command: declared.name,
      input: input.payload,
      output: { acknowledged: true },
      status: 'processed',
      timestamp: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getExecMap(ctx.tenantId).set(exec.id, exec);
    return exec;
  }

  async recordDragDrop(ctx: RequestContext, input: RecordDragDropInput): Promise<DragDropEvent> {
    const event: DragDropEvent = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      sourceAppId: input.sourceAppId,
      targetAppId: input.targetAppId,
      mediaType: input.mediaType,
      payload: input.payload,
      completed: input.completed ?? true,
      timestamp: new Date().toISOString(),
    };
    this.getDragMap(ctx.tenantId).set(event.id, event);
    return event;
  }

  async listDragDrops(ctx: RequestContext, appId?: string): Promise<DragDropEvent[]> {
    const m = this.dragDrops.get(ctx.tenantId);
    if (!m) return [];
    const list = Array.from(m.values());
    if (appId) return list.filter(d => d.sourceAppId === appId || d.targetAppId === appId);
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async recordPair(ctx: RequestContext, input: RecordPairInput): Promise<PairSyncEvent> {
    const event: PairSyncEvent = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      appAId: input.appAId,
      appBId: input.appBId,
      sharedKeys: input.sharedKeys ?? [],
      bidirectional: input.bidirectional ?? true,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getPairMap(ctx.tenantId).set(event.id, event);
    return event;
  }

  async listPairs(ctx: RequestContext, appId?: string): Promise<PairSyncEvent[]> {
    const m = this.pairs.get(ctx.tenantId);
    if (!m) return [];
    const list = Array.from(m.values());
    if (appId) return list.filter(p => p.appAId === appId || p.appBId === appId);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private getCmdMap(t: string) { let m = this.commands.get(t); if (!m) { m = new Map(); this.commands.set(t, m); } return m; }
  private getExecMap(t: string) { let m = this.executions.get(t); if (!m) { m = new Map(); this.executions.set(t, m); } return m; }
  private getDragMap(t: string) { let m = this.dragDrops.get(t); if (!m) { m = new Map(); this.dragDrops.set(t, m); } return m; }
  private getPairMap(t: string) { let m = this.pairs.get(t); if (!m) { m = new Map(); this.pairs.set(t, m); } return m; }
}
