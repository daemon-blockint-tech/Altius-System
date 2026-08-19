/**
 * In-memory multi-ontology governance service.
 */

import { randomUUID } from 'node:crypto';
import type {
  MultiOntologyGovernanceService,
  OntologySpace,
  CreateSpaceInput,
  OntologyEntity,
  CreateOntologyInput,
  MarkingRecord,
  CreateMarkingInput,
  SharingRule,
  CreateSharingRuleInput,
  OntologyAccessResult,
  RequestContext,
} from '@altius/spi';

export class InMemoryMultiOntologyGovernanceService implements MultiOntologyGovernanceService {
  private readonly spaces = new Map<string, Map<string, OntologySpace>>();
  private readonly spacesByName = new Map<string, Map<string, string>>(); // tenant → name → id
  private readonly ontologies = new Map<string, Map<string, OntologyEntity>>();
  private readonly markings = new Map<string, Map<string, MarkingRecord>>();
  private readonly sharingRules = new Map<string, Map<string, SharingRule>>();

  async createSpace(ctx: RequestContext, input: CreateSpaceInput): Promise<OntologySpace> {
    const id = randomUUID();
    const space: OntologySpace = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      orgScope: input.orgScope,
      shared: input.shared ?? false,
      sharedWithOrgs: input.sharedWithOrgs,
      ontologyIds: [],
      defaultMarkings: input.defaultMarkings ?? [],
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
    };
    this.getSpaceMap(ctx.tenantId).set(id, space);
    this.getSpaceNameMap(ctx.tenantId).set(input.name, id);
    return space;
  }

  async getSpace(ctx: RequestContext, id: string): Promise<OntologySpace | null> {
    return this.spaces.get(ctx.tenantId)?.get(id) ?? null;
  }

  async getSpaceByName(ctx: RequestContext, name: string): Promise<OntologySpace | null> {
    const id = this.spacesByName.get(ctx.tenantId)?.get(name);
    return id ? (this.spaces.get(ctx.tenantId)?.get(id) ?? null) : null;
  }

  async listSpaces(ctx: RequestContext, orgScope?: string): Promise<OntologySpace[]> {
    const m = this.spaces.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (orgScope) list = list.filter(s => s.orgScope === orgScope || (s.shared && s.sharedWithOrgs?.includes(orgScope)));
    return list;
  }

  async updateSpace(ctx: RequestContext, id: string, updates: Partial<CreateSpaceInput>): Promise<OntologySpace> {
    const space = this.spaces.get(ctx.tenantId)?.get(id);
    if (!space) throw new Error(`Space not found: ${id}`);
    const updated: OntologySpace = {
      ...space,
      name: updates.name ?? space.name,
      description: updates.description ?? space.description,
      orgScope: updates.orgScope ?? space.orgScope,
      shared: updates.shared ?? space.shared,
      sharedWithOrgs: updates.sharedWithOrgs ?? space.sharedWithOrgs,
      defaultMarkings: updates.defaultMarkings ?? space.defaultMarkings,
    };
    this.getSpaceMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteSpace(ctx: RequestContext, id: string): Promise<void> {
    const space = this.spaces.get(ctx.tenantId)?.get(id);
    if (space) this.getSpaceNameMap(ctx.tenantId).delete(space.name);
    this.spaces.get(ctx.tenantId)?.delete(id);
  }

  async createOntology(ctx: RequestContext, input: CreateOntologyInput): Promise<OntologyEntity> {
    const space = this.spaces.get(ctx.tenantId)?.get(input.spaceId);
    if (!space) throw new Error(`Space not found: ${input.spaceId}`);
    const id = randomUUID();
    const now = new Date().toISOString();
    const ontology: OntologyEntity = {
      id, tenantId: ctx.tenantId,
      name: input.name,
      displayName: input.displayName ?? input.name,
      spaceId: input.spaceId,
      schemaVersion: input.schemaVersion ?? 1,
      markings: input.markings ?? space.defaultMarkings,
      readOnly: input.readOnly ?? false,
      orgScope: space.orgScope,
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    this.getOntologyMap(ctx.tenantId).set(id, ontology);
    // Add to space
    const updatedSpace = { ...space, ontologyIds: [...space.ontologyIds, id] };
    this.getSpaceMap(ctx.tenantId).set(input.spaceId, updatedSpace);
    return ontology;
  }

  async getOntology(ctx: RequestContext, id: string): Promise<OntologyEntity | null> {
    return this.ontologies.get(ctx.tenantId)?.get(id) ?? null;
  }

  async getOntologyByName(ctx: RequestContext, spaceId: string, name: string): Promise<OntologyEntity | null> {
    const m = this.ontologies.get(ctx.tenantId);
    if (!m) return null;
    for (const o of m.values()) {
      if (o.spaceId === spaceId && o.name === name) return o;
    }
    return null;
  }

  async listOntologies(ctx: RequestContext, spaceId?: string): Promise<OntologyEntity[]> {
    const m = this.ontologies.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (spaceId) list = list.filter(o => o.spaceId === spaceId);
    return list;
  }

  async updateOntology(ctx: RequestContext, id: string, updates: Partial<CreateOntologyInput>): Promise<OntologyEntity> {
    const o = this.ontologies.get(ctx.tenantId)?.get(id);
    if (!o) throw new Error(`Ontology not found: ${id}`);
    const updated: OntologyEntity = {
      ...o,
      name: updates.name ?? o.name,
      displayName: updates.displayName ?? o.displayName,
      schemaVersion: updates.schemaVersion ?? o.schemaVersion,
      markings: updates.markings ?? o.markings,
      readOnly: updates.readOnly ?? o.readOnly,
      updatedAt: new Date().toISOString(),
    };
    this.getOntologyMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteOntology(ctx: RequestContext, id: string): Promise<void> {
    const o = this.ontologies.get(ctx.tenantId)?.get(id);
    if (o) {
      // Remove from space
      const space = this.spaces.get(ctx.tenantId)?.get(o.spaceId);
      if (space) {
        const updated = { ...space, ontologyIds: space.ontologyIds.filter(oid => oid !== id) };
        this.getSpaceMap(ctx.tenantId).set(o.spaceId, updated);
      }
    }
    this.ontologies.get(ctx.tenantId)?.delete(id);
  }

  async createMarking(ctx: RequestContext, input: CreateMarkingInput): Promise<MarkingRecord> {
    const id = randomUUID();
    const marking: MarkingRecord = {
      id, tenantId: ctx.tenantId,
      name: input.name, label: input.label,
      description: input.description ?? '',
      category: input.category,
      requiredClearance: input.requiredClearance,
      propagates: input.propagates ?? false,
      createdAt: new Date().toISOString(),
    };
    this.getMarkingMap(ctx.tenantId).set(input.name, marking);
    return marking;
  }

  async getMarking(ctx: RequestContext, name: string): Promise<MarkingRecord | null> {
    return this.markings.get(ctx.tenantId)?.get(name) ?? null;
  }

  async listMarkings(ctx: RequestContext, category?: string): Promise<MarkingRecord[]> {
    const m = this.markings.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (category) list = list.filter(mk => mk.category === category);
    return list;
  }

  async deleteMarking(ctx: RequestContext, name: string): Promise<void> {
    this.markings.get(ctx.tenantId)?.delete(name);
  }

  async createSharingRule(ctx: RequestContext, input: CreateSharingRuleInput): Promise<SharingRule> {
    const id = randomUUID();
    const rule: SharingRule = {
      id, tenantId: ctx.tenantId,
      sourceSpaceId: input.sourceSpaceId,
      targetOrgScope: input.targetOrgScope,
      ontologyIds: input.ontologyIds ?? [],
      allowedMarkings: input.allowedMarkings ?? [],
      bidirectional: input.bidirectional ?? false,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
      enabled: input.enabled ?? true,
    };
    this.getRuleMap(ctx.tenantId).set(id, rule);
    return rule;
  }

  async getSharingRule(ctx: RequestContext, id: string): Promise<SharingRule | null> {
    return this.sharingRules.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listSharingRules(ctx: RequestContext, sourceSpaceId?: string): Promise<SharingRule[]> {
    const m = this.sharingRules.get(ctx.tenantId);
    if (!m) return [];
    let list = Array.from(m.values());
    if (sourceSpaceId) list = list.filter(r => r.sourceSpaceId === sourceSpaceId);
    return list;
  }

  async updateSharingRule(ctx: RequestContext, id: string, updates: Partial<CreateSharingRuleInput>): Promise<SharingRule> {
    const rule = this.sharingRules.get(ctx.tenantId)?.get(id);
    if (!rule) throw new Error(`Sharing rule not found: ${id}`);
    const updated: SharingRule = {
      ...rule,
      targetOrgScope: updates.targetOrgScope ?? rule.targetOrgScope,
      ontologyIds: updates.ontologyIds ?? rule.ontologyIds,
      allowedMarkings: updates.allowedMarkings ?? rule.allowedMarkings,
      bidirectional: updates.bidirectional ?? rule.bidirectional,
      enabled: updates.enabled ?? rule.enabled,
    };
    this.getRuleMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteSharingRule(ctx: RequestContext, id: string): Promise<void> {
    this.sharingRules.get(ctx.tenantId)?.delete(id);
  }

  async checkAccess(ctx: RequestContext, ontologyId: string, callerOrgScope: string): Promise<OntologyAccessResult> {
    const ontology = this.ontologies.get(ctx.tenantId)?.get(ontologyId);
    if (!ontology) throw new Error(`Ontology not found: ${ontologyId}`);
    const space = this.spaces.get(ctx.tenantId)?.get(ontology.spaceId);
    if (!space) throw new Error(`Space not found: ${ontology.spaceId}`);
    const denialReasons: string[] = [];
    // Same org → allow
    if (space.orgScope === callerOrgScope) {
      return { allowed: true, spaceId: space.id, callerOrgScope, ontologyOrgScope: space.orgScope, viaSharingRule: false, denialReasons: [] };
    }
    // Check sharing rules
    const rules = await this.listSharingRules(ctx, space.id);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      // Check if the target org matches
      if (rule.targetOrgScope !== callerOrgScope && !(rule.bidirectional && space.orgScope === callerOrgScope)) continue;
      // Check ontology filter
      if (rule.ontologyIds.length > 0 && !rule.ontologyIds.includes(ontologyId)) continue;
      // Check markings
      if (rule.allowedMarkings.length > 0) {
        const hasDisallowed = ontology.markings.some(m => !rule.allowedMarkings.includes(m));
        if (hasDisallowed) {
          denialReasons.push(`Ontology has markings not allowed by sharing rule ${rule.id}`);
          continue;
        }
      }
      return { allowed: true, spaceId: space.id, callerOrgScope, ontologyOrgScope: space.orgScope, viaSharingRule: true, denialReasons: [], sharingRuleId: rule.id };
    }
    denialReasons.push(`No sharing rule grants ${callerOrgScope} access to ontology ${ontologyId} in space ${space.name}`);
    return { allowed: false, spaceId: space.id, callerOrgScope, ontologyOrgScope: space.orgScope, viaSharingRule: false, denialReasons };
  }

  async resolveAccessibleOntologies(ctx: RequestContext, callerOrgScope: string): Promise<OntologyEntity[]> {
    const allOntologies = await this.listOntologies(ctx);
    const accessible: OntologyEntity[] = [];
    for (const o of allOntologies) {
      const result = await this.checkAccess(ctx, o.id, callerOrgScope);
      if (result.allowed) accessible.push(o);
    }
    return accessible;
  }

  private getSpaceMap(tenantId: string): Map<string, OntologySpace> {
    let m = this.spaces.get(tenantId);
    if (!m) { m = new Map(); this.spaces.set(tenantId, m); }
    return m;
  }
  private getSpaceNameMap(tenantId: string): Map<string, string> {
    let m = this.spacesByName.get(tenantId);
    if (!m) { m = new Map(); this.spacesByName.set(tenantId, m); }
    return m;
  }
  private getOntologyMap(tenantId: string): Map<string, OntologyEntity> {
    let m = this.ontologies.get(tenantId);
    if (!m) { m = new Map(); this.ontologies.set(tenantId, m); }
    return m;
  }
  private getMarkingMap(tenantId: string): Map<string, MarkingRecord> {
    let m = this.markings.get(tenantId);
    if (!m) { m = new Map(); this.markings.set(tenantId, m); }
    return m;
  }
  private getRuleMap(tenantId: string): Map<string, SharingRule> {
    let m = this.sharingRules.get(tenantId);
    if (!m) { m = new Map(); this.sharingRules.set(tenantId, m); }
    return m;
  }
}
