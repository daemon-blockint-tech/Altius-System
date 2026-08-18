/**
 * Tests for Phase 9 services: data freshness, geospatial maps,
 * ontology SQL, and embedded copilots.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataFreshnessService } from '../in-memory-data-freshness.js';
import { InMemoryGeospatialMapService } from '../in-memory-geospatial-maps.js';
import { InMemoryOntologySqlService } from '../in-memory-ontology-sql.js';
import { InMemoryEmbeddedCopilotService } from '../in-memory-embedded-copilots.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Data freshness
// ===========================================================================

describe('InMemoryDataFreshnessService', () => {
  let service: InMemoryDataFreshnessService;

  beforeEach(() => { service = new InMemoryDataFreshnessService(); });

  it('records and retrieves sync by object type', async () => {
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 100, succeeded: true });
    const rec = await service.getFreshnessForType(CTX, 'Patient');
    expect(rec?.objectType).toBe('Patient');
    expect(rec?.lastRecordCount).toBe(100);
    expect(rec?.lastSyncSucceeded).toBe(true);
  });

  it('records and retrieves sync by datasource', async () => {
    await service.recordSync(CTX, { datasource: 'pas-jdbc', recordCount: 50, succeeded: true });
    const rec = await service.getFreshnessForDatasource(CTX, 'pas-jdbc');
    expect(rec?.datasource).toBe('pas-jdbc');
  });

  it('updates existing record on re-sync', async () => {
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 100, succeeded: true });
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 150, succeeded: true });
    const rec = await service.getFreshnessForType(CTX, 'Patient');
    expect(rec?.lastRecordCount).toBe(150);
    expect(rec?.id).toBeDefined();
  });

  it('records failed syncs', async () => {
    await service.recordSync(CTX, { datasource: 'bad-source', recordCount: 0, succeeded: false, error: 'Connection refused' });
    const rec = await service.getFreshnessForDatasource(CTX, 'bad-source');
    expect(rec?.lastSyncSucceeded).toBe(false);
    expect(rec?.lastError).toBe('Connection refused');
  });

  it('queries freshness records', async () => {
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 100, succeeded: true });
    await service.recordSync(CTX, { objectType: 'Order', recordCount: 50, succeeded: true });
    await service.recordSync(CTX, { datasource: 'erp', recordCount: 200, succeeded: true });
    const all = await service.queryFreshness(CTX);
    expect(all).toHaveLength(3);
    const patients = await service.queryFreshness(CTX, { objectType: 'Patient' });
    expect(patients).toHaveLength(1);
  });

  it('gets summary', async () => {
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 100, succeeded: true });
    await service.recordSync(CTX, { objectType: 'Order', recordCount: 50, succeeded: false, error: 'fail' });
    const summary = await service.getSummary(CTX);
    expect(summary.totalTypes).toBe(2);
    expect(summary.errorCount).toBe(1);
  });

  it('deletes freshness records', async () => {
    await service.recordSync(CTX, { objectType: 'Patient', recordCount: 100, succeeded: true });
    await service.deleteFreshness(CTX, 'Patient');
    const rec = await service.getFreshnessForType(CTX, 'Patient');
    expect(rec).toBeNull();
  });
});

// ===========================================================================
// Geospatial maps
// ===========================================================================

describe('InMemoryGeospatialMapService', () => {
  let service: InMemoryGeospatialMapService;

  // Mock object reader with test data
  const mockReader = async (_ctx: RequestContext, objectType: string) => {
    if (objectType === 'Facility') {
      return [
        { id: 'f1', properties: { name: 'Hospital A', location: { lat: 51.5, lng: -0.1 } } },
        { id: 'f2', properties: { name: 'Hospital B', location: { lat: 51.51, lng: -0.12 } } },
        { id: 'f3', properties: { name: 'Hospital C', location: { lat: 52.0, lng: -1.0 } } },
      ];
    }
    return [];
  };

  beforeEach(() => { service = new InMemoryGeospatialMapService(mockReader); });

  it('creates and lists layers', async () => {
    const layer = await service.createLayer(CTX, {
      name: 'Facilities', objectType: 'Facility', geometryField: 'location', kind: 'point',
      style: { fillColor: '#2f6b4f' },
    });
    expect(layer.name).toBe('Facilities');
    const layers = await service.listLayers(CTX, 'Facility');
    expect(layers).toHaveLength(1);
  });

  it('creates and retrieves saved maps', async () => {
    const layer = await service.createLayer(CTX, {
      name: 'L1', objectType: 'Facility', geometryField: 'location', kind: 'point',
    });
    const map = await service.createSavedMap(CTX, {
      name: 'London Facilities', layerIds: [layer.id],
      viewport: { center: { lat: 51.5, lng: -0.1 }, zoom: 10 },
    });
    expect(map.name).toBe('London Facilities');
    const fetched = await service.getSavedMap(CTX, map.id);
    expect(fetched?.name).toBe('London Facilities');
  });

  it('creates annotations', async () => {
    const ann = await service.createAnnotation(CTX, {
      label: 'Marker 1', shape: { type: 'point', coordinates: { lat: 51.5, lng: -0.1 } }, kind: 'marker',
    });
    expect(ann.label).toBe('Marker 1');
    const anns = await service.listAnnotations(CTX);
    expect(anns).toHaveLength(1);
  });

  it('performs search-around (radius query)', async () => {
    const results = await service.searchAround(CTX, 'Facility', 'location', { lat: 51.5, lng: -0.1 }, 5000);
    expect(results.length).toBeGreaterThanOrEqual(2); // f1 and f2 are close
    expect(results[0]!.distanceMeters).toBeLessThanOrEqual(results[1]!.distanceMeters ?? Infinity);
  });

  it('performs spatial intersect with bbox', async () => {
    const results = await service.searchInBBox(CTX, 'Facility', 'location', {
      south: 51.4, west: -0.2, north: 51.6, east: 0.0,
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('performs spatial intersect with circle', async () => {
    const results = await service.spatialIntersect(CTX, 'Facility', 'location', {
      type: 'circle', circle: { center: { lat: 51.5, lng: -0.1 }, radiusMeters: 5000 },
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('calculates distance between points', async () => {
    const dist = await service.distance(CTX, { lat: 51.5, lng: -0.1 }, { lat: 51.51, lng: -0.12 });
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(5000);
  });

  it('checks if a point is inside a shape', async () => {
    const inside = await service.contains(CTX, {
      type: 'bbox', bbox: { south: 51.4, west: -0.2, north: 51.6, east: 0.0 },
    }, { lat: 51.5, lng: -0.1 });
    expect(inside).toBe(true);
    const outside = await service.contains(CTX, {
      type: 'bbox', bbox: { south: 51.4, west: -0.2, north: 51.6, east: 0.0 },
    }, { lat: 52.0, lng: -1.0 });
    expect(outside).toBe(false);
  });

  it('checks point-in-polygon', async () => {
    const inside = await service.contains(CTX, {
      type: 'polygon',
      polygon: { rings: [[
        { lat: 51.4, lng: -0.2 }, { lat: 51.6, lng: -0.2 }, { lat: 51.6, lng: 0.0 }, { lat: 51.4, lng: 0.0 },
      ]] },
    }, { lat: 51.5, lng: -0.1 });
    expect(inside).toBe(true);
  });

  it('buffers a point into a circle', async () => {
    const buffered = await service.buffer(CTX, { type: 'point', coordinates: { lat: 51.5, lng: -0.1 } }, 1000);
    expect(buffered.type).toBe('circle');
  });

  it('shares a saved map', async () => {
    const map = await service.createSavedMap(CTX, {
      name: 'M1', layerIds: [], viewport: { center: { lat: 0, lng: 0 }, zoom: 1 },
    });
    const shared = await service.shareSavedMap(CTX, map.id, ['user2']);
    expect(shared.sharedWith).toContain('user2');
  });

  it('lists saved maps by tags', async () => {
    await service.createSavedMap(CTX, { name: 'M1', layerIds: [], viewport: { center: { lat: 0, lng: 0 }, zoom: 1 }, tags: ['clinical'] });
    await service.createSavedMap(CTX, { name: 'M2', layerIds: [], viewport: { center: { lat: 0, lng: 0 }, zoom: 1 }, tags: ['ops'] });
    const clinical = await service.listSavedMaps(CTX, ['clinical']);
    expect(clinical).toHaveLength(1);
  });
});

// ===========================================================================
// Ontology SQL
// ===========================================================================

describe('InMemoryOntologySqlService', () => {
  let service: InMemoryOntologySqlService;

  const mockReader = async (_ctx: RequestContext, objectType: string) => {
    if (objectType === 'Patient') {
      return [
        { id: 'p1', properties: { name: 'Alice', age: 30, status: 'active' } },
        { id: 'p2', properties: { name: 'Bob', age: 25, status: 'active' } },
        { id: 'p3', properties: { name: 'Carol', age: 40, status: 'inactive' } },
      ];
    }
    if (objectType === 'Order') {
      return [
        { id: 'o1', properties: { patientId: 'p1', total: 100 } },
        { id: 'o2', properties: { patientId: 'p1', total: 50 } },
        { id: 'o3', properties: { patientId: 'p2', total: 200 } },
      ];
    }
    return [];
  };

  beforeEach(() => { service = new InMemoryOntologySqlService(mockReader); });

  it('executes a simple SELECT', async () => {
    const result = await service.execute(CTX, 'SELECT name, age FROM Patient WHERE status = active');
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.accessedObjectTypes).toContain('Patient');
  });

  it('executes SELECT * without WHERE', async () => {
    const result = await service.execute(CTX, 'SELECT * FROM Patient');
    expect(result.rows.length).toBe(3);
  });

  it('executes with LIMIT', async () => {
    const result = await service.execute(CTX, 'SELECT * FROM Patient LIMIT 2');
    expect(result.rows.length).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('executes GROUP BY with COUNT', async () => {
    const result = await service.execute(CTX, 'SELECT status, count(*) FROM Patient GROUP BY status');
    expect(result.rows.length).toBe(2);
  });

  it('executes JOIN', async () => {
    const result = await service.execute(CTX, 'SELECT * FROM Patient JOIN Order ON Patient.id = Order.patientId');
    expect(result.rows.length).toBe(3);
  });

  it('executes ORDER BY', async () => {
    const result = await service.execute(CTX, 'SELECT name, age FROM Patient ORDER BY age DESC');
    expect(result.rows.length).toBe(3);
  });

  it('explains a query', async () => {
    const explain = await service.explain(CTX, 'SELECT * FROM Patient WHERE status = active');
    expect(explain.objectTypes).toContain('Patient');
    expect(explain.fullScan).toBe(false);
  });

  it('validates a query', async () => {
    const valid = await service.validate(CTX, 'SELECT name FROM Patient');
    expect(valid.valid).toBe(true);
    const invalid = await service.validate(CTX, 'NOT SQL');
    expect(invalid.valid).toBe(false);
  });

  it('creates and executes saved queries', async () => {
    const saved = await service.createSavedQuery(CTX, {
      name: 'active-patients', sql: 'SELECT * FROM Patient WHERE status = active',
    });
    expect(saved.objectTypes).toContain('Patient');
    const result = await service.executeSavedQuery(CTX, saved.id);
    expect(result.rows.length).toBe(2);
  });

  it('lists and updates saved queries', async () => {
    await service.createSavedQuery(CTX, { name: 'q1', sql: 'SELECT * FROM Patient' });
    const list = await service.listSavedQueries(CTX);
    expect(list).toHaveLength(1);
    await service.updateSavedQuery(CTX, list[0]!.id, { name: 'q1-updated' });
    expect((await service.getSavedQuery(CTX, list[0]!.id))?.name).toBe('q1-updated');
  });

  it('shares a saved query', async () => {
    const q = await service.createSavedQuery(CTX, { name: 'q1', sql: 'SELECT * FROM Patient' });
    const shared = await service.shareSavedQuery(CTX, q.id, ['user2']);
    expect(shared.sharedWith).toContain('user2');
  });
});

// ===========================================================================
// Embedded copilots
// ===========================================================================

describe('InMemoryEmbeddedCopilotService', () => {
  let service: InMemoryEmbeddedCopilotService;

  beforeEach(() => { service = new InMemoryEmbeddedCopilotService(); });

  it('creates a copilot with default prompts', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'Table Assistant', appContext: 'object_table' });
    expect(copilot.name).toBe('Table Assistant');
    expect(copilot.systemPrompt).toContain('object table');
    expect(copilot.suggestedPrompts.length).toBeGreaterThan(0);
  });

  it('lists copilots by app context', async () => {
    await service.createCopilot(CTX, { name: 'C1', appContext: 'object_table' });
    await service.createCopilot(CTX, { name: 'C2', appContext: 'map_view' });
    const tableCopilots = await service.listCopilots(CTX, 'object_table');
    expect(tableCopilots).toHaveLength(1);
  });

  it('starts a conversation with view context', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'object_detail' });
    const conv = await service.startConversation(CTX, {
      copilotId: copilot.id,
      viewContext: { objectType: 'Patient', objectId: 'p1' },
    });
    expect(conv.viewContext.objectType).toBe('Patient');
    expect(conv.messages).toHaveLength(0);
  });

  it('starts a conversation with an initial message', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'object_table' });
    const conv = await service.startConversation(CTX, {
      copilotId: copilot.id,
      viewContext: { objectType: 'Patient' },
      initialMessage: 'Explain this table',
    });
    expect(conv.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('sends a message and gets a response', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'object_table' });
    const conv = await service.startConversation(CTX, {
      copilotId: copilot.id,
      viewContext: { objectType: 'Patient' },
    });
    const response = await service.sendMessage(CTX, { conversationId: conv.id, message: 'Filter by status' });
    expect(response.role).toBe('assistant');
    expect(response.content).toBeTruthy();
  });

  it('gets suggested actions for a view context', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'object_table', canExecuteActions: true });
    const actions = await service.getSuggestedActions(CTX, copilot.id, {
      objectType: 'Patient', selectedObjectIds: ['p1', 'p2'],
    });
    expect(actions.length).toBeGreaterThan(0);
  });

  it('gets suggested prompts', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'map_view' });
    const prompts = await service.getSuggestedPrompts(CTX, copilot.id, { objectType: 'Facility' });
    expect(prompts.length).toBeGreaterThan(0);
  });

  it('lists conversations', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'general' });
    await service.startConversation(CTX, { copilotId: copilot.id, viewContext: {} });
    await service.startConversation(CTX, { copilotId: copilot.id, viewContext: {} });
    const list = await service.listConversations(CTX);
    expect(list).toHaveLength(2);
  });

  it('updates and deletes copilots', async () => {
    const copilot = await service.createCopilot(CTX, { name: 'C1', appContext: 'general' });
    await service.updateCopilot(CTX, copilot.id, { enabled: false });
    expect((await service.getCopilot(CTX, copilot.id))?.enabled).toBe(false);
    await service.deleteCopilot(CTX, copilot.id);
    expect(await service.getCopilot(CTX, copilot.id)).toBeNull();
  });
});
