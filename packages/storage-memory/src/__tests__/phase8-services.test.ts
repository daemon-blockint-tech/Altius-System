/**
 * Tests for enterprise connector catalog, multi-ontology governance,
 * graph analysis, value formatting, and platform assistant.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryConnectorCatalogService } from '../in-memory-enterprise-connectors.js';
import { InMemoryMultiOntologyGovernanceService } from '../in-memory-multi-ontology.js';
import { InMemoryGraphAnalysisService } from '../in-memory-graph-analysis.js';
import { InMemoryPlatformAssistantService } from '../in-memory-platform-assistant.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Enterprise connector catalog
// ===========================================================================

describe('InMemoryConnectorCatalogService', () => {
  let service: InMemoryConnectorCatalogService;

  beforeEach(() => {
    service = new InMemoryConnectorCatalogService();
  });

  it('lists catalog entries', async () => {
    const catalog = await service.listCatalog(CTX);
    expect(catalog.length).toBeGreaterThanOrEqual(6);
    expect(catalog.find(e => e.id === 'dynamics-365-bc')).toBeDefined();
  });

  it('filters by vendor', async () => {
    const ms = await service.listCatalog(CTX, 'Microsoft');
    expect(ms.every(e => e.vendor === 'Microsoft')).toBe(true);
  });

  it('lists vendors', async () => {
    const vendors = await service.listVendors(CTX);
    expect(vendors).toContain('Microsoft');
    expect(vendors).toContain('Salesforce');
  });

  it('gets a catalog entry by ID', async () => {
    const entry = await service.getCatalogEntry(CTX, 'salesforce');
    expect(entry?.product).toContain('Sales Cloud');
  });

  it('configures a connector with AzureAD auth', async () => {
    const configured = await service.configure(CTX, {
      vendorConnectorId: 'dynamics-365-bc',
      instanceName: 'my-bc',
      config: { url: 'https://api.businesscentral.dynamics.com/v2.0/tenant/production', table: 'customers' },
      auth: { type: 'azuread', tenantId: 'tid', clientId: 'cid', clientSecret: 'secret' },
    });
    expect(configured.instanceName).toBe('my-bc');
    expect(configured.auth.type).toBe('azuread');
  });

  it('rejects unsupported auth scheme', async () => {
    await expect(service.configure(CTX, {
      vendorConnectorId: 'dynamics-365-bc',
      instanceName: 'bad',
      config: { url: 'https://example.com', table: 't' },
      auth: { type: 'api-key', apiKey: 'key' },
    })).rejects.toThrow();
  });

  it('creates and validates egress policies', async () => {
    const policy = await service.createEgressPolicy(CTX, {
      name: 'ms-only',
      allowedHosts: ['*.businesscentral.dynamics.com'],
      deniedHosts: ['evil.com'],
    });
    expect(policy.id).toBeTruthy();
    const valid = await service.validateEgress(CTX, 'api.businesscentral.dynamics.com', policy.id);
    expect(valid.allowed).toBe(true);
    const invalid = await service.validateEgress(CTX, 'evil.com', policy.id);
    expect(invalid.allowed).toBe(false);
    const notMatched = await service.validateEgress(CTX, 'random.com', policy.id);
    expect(notMatched.allowed).toBe(false);
  });

  it('configures a connector with egress policy validation', async () => {
    const policy = await service.createEgressPolicy(CTX, {
      name: 'sf-only',
      allowedHosts: ['*.salesforce.com'],
    });
    const configured = await service.configure(CTX, {
      vendorConnectorId: 'salesforce',
      instanceName: 'my-sf',
      config: { url: 'https://myorg.my.salesforce.com/services/data/v59.0', table: 'Account' },
      auth: { type: 'oauth2-authcode', authUrl: 'https://login.salesforce.com/oauth2/auth', tokenUrl: 'https://login.salesforce.com/oauth2/token', clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://app.example.com/callback' },
      egressPolicyId: policy.id,
    });
    expect(configured.lastValidation?.allowed).toBe(true);
  });

  it('lists, updates, and deletes configured connectors', async () => {
    await service.configure(CTX, {
      vendorConnectorId: 'snowflake',
      instanceName: 'my-snowflake',
      config: { url: 'jdbc:snowflake://account.snowflakecomputing.com', table: 'CUSTOMERS' },
      auth: { type: 'basic', username: 'user', password: 'pass' },
    });
    expect((await service.listConfigured(CTX))).toHaveLength(1);
    await service.updateConfigured(CTX, 'my-snowflake', { enabled: false });
    expect((await service.getConfigured(CTX, 'my-snowflake'))?.enabled).toBe(false);
    await service.deleteConfigured(CTX, 'my-snowflake');
    expect((await service.listConfigured(CTX))).toHaveLength(0);
  });
});

// ===========================================================================
// Multi-ontology governance
// ===========================================================================

describe('InMemoryMultiOntologyGovernanceService', () => {
  let service: InMemoryMultiOntologyGovernanceService;

  beforeEach(() => {
    service = new InMemoryMultiOntologyGovernanceService();
  });

  it('creates and retrieves spaces', async () => {
    const space = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    expect(space.name).toBe('ops');
    expect(space.orgScope).toBe('operations');
    const fetched = await service.getSpace(CTX, space.id);
    expect(fetched?.name).toBe('ops');
    const byName = await service.getSpaceByName(CTX, 'ops');
    expect(byName?.id).toBe(space.id);
  });

  it('lists spaces by org scope', async () => {
    await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    await service.createSpace(CTX, { name: 'fin', orgScope: 'finance' });
    const ops = await service.listSpaces(CTX, 'operations');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.name).toBe('ops');
  });

  it('creates ontologies in spaces', async () => {
    const space = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    const ont = await service.createOntology(CTX, { name: 'core', spaceId: space.id });
    expect(ont.name).toBe('core');
    expect(ont.spaceId).toBe(space.id);
    expect(ont.orgScope).toBe('operations');
    const fetched = await service.getOntology(CTX, ont.id);
    expect(fetched?.name).toBe('core');
  });

  it('creates and lists markings', async () => {
    await service.createMarking(CTX, { name: 'CONFIDENTIAL', label: 'Confidential', category: 'sensitivity', requiredClearance: 'L2' });
    await service.createMarking(CTX, { name: 'PHI', label: 'Protected Health Information', category: 'compliance', requiredClearance: 'L3' });
    const all = await service.listMarkings(CTX);
    expect(all).toHaveLength(2);
    const sens = await service.listMarkings(CTX, 'sensitivity');
    expect(sens).toHaveLength(1);
    expect(sens[0]!.name).toBe('CONFIDENTIAL');
  });

  it('checks same-org access (allowed)', async () => {
    const space = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    const ont = await service.createOntology(CTX, { name: 'core', spaceId: space.id });
    const result = await service.checkAccess(CTX, ont.id, 'operations');
    expect(result.allowed).toBe(true);
    expect(result.viaSharingRule).toBe(false);
  });

  it('checks cross-org access without sharing rule (denied)', async () => {
    const space = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    const ont = await service.createOntology(CTX, { name: 'core', spaceId: space.id });
    const result = await service.checkAccess(CTX, ont.id, 'finance');
    expect(result.allowed).toBe(false);
    expect(result.denialReasons.length).toBeGreaterThan(0);
  });

  it('allows cross-org access via sharing rule', async () => {
    const space = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    const ont = await service.createOntology(CTX, { name: 'core', spaceId: space.id });
    await service.createSharingRule(CTX, { sourceSpaceId: space.id, targetOrgScope: 'finance' });
    const result = await service.checkAccess(CTX, ont.id, 'finance');
    expect(result.allowed).toBe(true);
    expect(result.viaSharingRule).toBe(true);
  });

  it('resolves accessible ontologies for an org', async () => {
    const space1 = await service.createSpace(CTX, { name: 'ops', orgScope: 'operations' });
    const space2 = await service.createSpace(CTX, { name: 'fin', orgScope: 'finance' });
    await service.createOntology(CTX, { name: 'core-ops', spaceId: space1.id });
    await service.createOntology(CTX, { name: 'core-fin', spaceId: space2.id });
    await service.createSharingRule(CTX, { sourceSpaceId: space2.id, targetOrgScope: 'operations' });
    const accessible = await service.resolveAccessibleOntologies(CTX, 'operations');
    expect(accessible).toHaveLength(2);
  });
});

// ===========================================================================
// Graph analysis
// ===========================================================================

describe('InMemoryGraphAnalysisService', () => {
  let service: InMemoryGraphAnalysisService;

  beforeEach(() => {
    service = new InMemoryGraphAnalysisService();
  });

  it('creates and retrieves an analysis', async () => {
    const analysis = await service.create(CTX, {
      name: 'patient-graph',
      rootObjectType: 'Patient',
      rootObjectId: 'p1',
      traversalSteps: [{ linkType: 'treats', direction: 'outgoing', maxDepth: 2 }],
    });
    expect(analysis.name).toBe('patient-graph');
    expect(analysis.version).toBe(1);
    const fetched = await service.get(CTX, analysis.id);
    expect(fetched?.name).toBe('patient-graph');
  });

  it('updates an analysis and creates a new version', async () => {
    const analysis = await service.create(CTX, {
      name: 'graph1', rootObjectType: 'Patient', rootObjectId: 'p1', traversalSteps: [],
    });
    const updated = await service.update(CTX, analysis.id, { description: 'updated' }, 'added description');
    expect(updated.version).toBe(2);
    expect(updated.description).toBe('updated');
  });

  it('lists versions', async () => {
    const analysis = await service.create(CTX, {
      name: 'graph1', rootObjectType: 'Patient', rootObjectId: 'p1', traversalSteps: [],
    });
    await service.update(CTX, analysis.id, { description: 'v2' });
    await service.update(CTX, analysis.id, { description: 'v3' });
    const versions = await service.listVersions(CTX, analysis.id);
    expect(versions).toHaveLength(3);
    expect(versions[0]!.version).toBe(3);
  });

  it('reverts to a previous version', async () => {
    const analysis = await service.create(CTX, {
      name: 'graph1', rootObjectType: 'Patient', rootObjectId: 'p1', traversalSteps: [],
    });
    await service.update(CTX, analysis.id, { description: 'changed' });
    const reverted = await service.revert(CTX, analysis.id, 1);
    expect(reverted.version).toBe(3);
    expect(reverted.description).toBe('');
  });

  it('shares and unshares analyses', async () => {
    const analysis = await service.create(CTX, {
      name: 'graph1', rootObjectType: 'Patient', rootObjectId: 'p1', traversalSteps: [],
    });
    await service.share(CTX, analysis.id, ['user2', 'user3']);
    const shared = await service.listShared(CTX, 'user2');
    expect(shared).toHaveLength(1);
    await service.unshare(CTX, analysis.id, ['user2']);
    const sharedAfter = await service.listShared(CTX, 'user2');
    expect(sharedAfter).toHaveLength(0);
  });

  it('duplicates an analysis', async () => {
    const analysis = await service.create(CTX, {
      name: 'graph1', rootObjectType: 'Patient', rootObjectId: 'p1', traversalSteps: [],
    });
    const copy = await service.duplicate(CTX, analysis.id, 'graph1-copy');
    expect(copy.name).toBe('graph1-copy');
    expect(copy.id).not.toBe(analysis.id);
    expect(copy.version).toBe(1);
  });

  it('lists analyses by tags', async () => {
    await service.create(CTX, { name: 'g1', rootObjectType: 'P', rootObjectId: 'p1', traversalSteps: [], tags: ['urgent', 'clinical'] });
    await service.create(CTX, { name: 'g2', rootObjectType: 'P', rootObjectId: 'p2', traversalSteps: [], tags: ['clinical'] });
    const clinical = await service.list(CTX, ['clinical']);
    expect(clinical).toHaveLength(2);
    const urgent = await service.list(CTX, ['urgent']);
    expect(urgent).toHaveLength(1);
  });
});

// ===========================================================================
// Value formatting — DELETED in §4D, folded into DisplayDirective
// ===========================================================================

// ===========================================================================
// Platform assistant
// ===========================================================================

describe('InMemoryPlatformAssistantService', () => {
  let service: InMemoryPlatformAssistantService;

  beforeEach(() => {
    service = new InMemoryPlatformAssistantService();
  });

  it('starts a session', async () => {
    const session = await service.startSession(CTX, { mode: 'data_integration' });
    expect(session.mode).toBe('data_integration');
    expect(session.messages).toHaveLength(0);
  });

  it('starts a session with an initial request and generates a plan', async () => {
    const session = await service.startSession(CTX, { mode: 'data_integration', initialRequest: 'Connect to Salesforce and sync accounts' });
    expect(session.messages.length).toBeGreaterThanOrEqual(2);
    const plans = await service.listPlans(CTX);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.mode).toBe('data_integration');
  });

  it('generates a plan with steps', async () => {
    const plan = await service.generatePlan(CTX, 'ontology_editing', 'Add a new Patient type with name and age properties');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0]!.action).toBe('review_schema');
    expect(plan.needsClarification).toBe(false);
  });

  it('generates clarifications for vague requests', async () => {
    const plan = await service.generatePlan(CTX, 'data_integration', 'help me');
    expect(plan.needsClarification).toBe(true);
    expect(plan.clarifications.length).toBeGreaterThan(0);
  });

  it('approves and executes a plan', async () => {
    const plan = await service.generatePlan(CTX, 'governance_audit', 'Audit all permissions');
    expect(plan.needsClarification).toBe(false);
    const approved = await service.approvePlan(CTX, plan.id);
    expect(approved.approved).toBe(true);
    const result = await service.executePlan(CTX, plan.id);
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(plan.steps.length);
  });

  it('rejects executing an unapproved plan', async () => {
    const plan = await service.generatePlan(CTX, 'ml', 'Train a model');
    await expect(service.executePlan(CTX, plan.id)).rejects.toThrow('approved');
  });

  it('answers clarifications and re-checks', async () => {
    const plan = await service.generatePlan(CTX, 'data_integration', 'help');
    expect(plan.needsClarification).toBe(true);
    const answers: Record<string, string> = {};
    for (const q of plan.clarifications) answers[q.id] = 'Salesforce';
    const answered = await service.answerClarifications(CTX, plan.id, answers);
    expect(answered.needsClarification).toBe(false);
  });

  it('rejects approval when clarification is needed', async () => {
    const plan = await service.generatePlan(CTX, 'data_integration', 'help');
    await expect(service.approvePlan(CTX, plan.id)).rejects.toThrow('clarification');
  });

  it('registers and lists tools', async () => {
    await service.registerTool(CTX, {
      name: 'analyze_source', description: 'Analyze a data source', modes: ['data_integration'],
      paramSchema: { type: 'object' }, riskLevel: 'low', requiresApproval: false,
      execute: async () => ({ analyzed: true }),
    });
    const tools = await service.listTools(CTX, 'data_integration');
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('analyze_source');
  });

  it('lists sessions', async () => {
    await service.startSession(CTX, { mode: 'general' });
    await service.startSession(CTX, { mode: 'ml' });
    const sessions = await service.listSessions(CTX);
    expect(sessions).toHaveLength(2);
  });

  it('deletes a session', async () => {
    const session = await service.startSession(CTX, { mode: 'general' });
    await service.deleteSession(CTX, session.id);
    const fetched = await service.getSession(CTX, session.id);
    expect(fetched).toBeNull();
  });
});
