/**
 * Tests for Phase 10 widget services: embedding, layout/device-capture,
 * widget library, and platform resources.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEmbeddingService } from '../in-memory-embedding.js';
import { InMemoryLayoutDeviceCaptureService } from '../in-memory-layout-device-capture.js';
import { InMemoryPlatformResourceService } from '../in-memory-platform-resources.js';
import type { RequestContext } from '@altius/spi';

const CTX: RequestContext = { tenantId: 't1', actorId: 'u1' };

// ===========================================================================
// Embedding service
// ===========================================================================

describe('InMemoryEmbeddingService', () => {
  let service: InMemoryEmbeddingService;
  beforeEach(() => { service = new InMemoryEmbeddingService(); });

  it('registers and retrieves apps', async () => {
    const app = await service.registerApp(CTX, { name: 'Workshop', kind: 'workshop', url: 'https://app.example.com' });
    expect(app.name).toBe('Workshop');
    expect(await service.getApp(CTX, app.id)).not.toBeNull();
    expect((await service.getAppByName(CTX, 'Workshop'))?.id).toBe(app.id);
  });

  it('lists apps by kind', async () => {
    await service.registerApp(CTX, { name: 'W1', kind: 'workshop', url: 'https://w.example.com' });
    await service.registerApp(CTX, { name: 'Q1', kind: 'quiver', url: 'https://q.example.com' });
    const workshops = await service.listApps(CTX, 'workshop');
    expect(workshops).toHaveLength(1);
  });

  it('gets embedding manifest', async () => {
    const app = await service.registerApp(CTX, { name: 'W1', kind: 'workshop', url: 'https://w.example.com', embeddable: true, allowedEmbedOrigins: ['https://host.com'] });
    const manifest = await service.getEmbeddingManifest(CTX, app.id);
    expect(manifest?.framingAllowed).toBe(true);
    expect(manifest?.frameSrc).toContain('https://host.com');
  });

  it('sends and tracks cross-app commands', async () => {
    const appA = await service.registerApp(CTX, { name: 'A', kind: 'workshop', url: 'https://a.com', supportsCommands: true });
    const appB = await service.registerApp(CTX, { name: 'B', kind: 'workshop', url: 'https://b.com', supportsCommands: true });
    const cmd = await service.sendCommand(CTX, appA.id, { targetAppId: appB.id, command: 'select', payload: { id: 'obj1' } });
    expect(cmd.status).toBe('pending');
    const updated = await service.updateCommandStatus(CTX, cmd.id, 'processed', { ok: true });
    expect(updated.status).toBe('processed');
    expect((await service.getCommand(CTX, cmd.id))?.status).toBe('processed');
  });

  it('lists commands by app', async () => {
    const appA = await service.registerApp(CTX, { name: 'A', kind: 'workshop', url: 'https://a.com' });
    const appB = await service.registerApp(CTX, { name: 'B', kind: 'workshop', url: 'https://b.com' });
    await service.sendCommand(CTX, appA.id, { targetAppId: appB.id, command: 'update' });
    const cmds = await service.listCommands(CTX, appA.id);
    expect(cmds).toHaveLength(1);
  });

  it('creates and manages app pairings', async () => {
    const appA = await service.registerApp(CTX, { name: 'A', kind: 'workshop', url: 'https://a.com' });
    const appB = await service.registerApp(CTX, { name: 'B', kind: 'workshop', url: 'https://b.com' });
    const pairing = await service.createPairing(CTX, { appAId: appA.id, appBId: appB.id, sharedStateKeys: ['selectedId'] });
    expect(pairing.sharedStateKeys).toContain('selectedId');
    const synced = await service.syncSharedState(CTX, pairing.id, 'selectedId', 'obj1');
    expect(synced.delivered).toBe(true);
  });

  it('updates and deletes apps', async () => {
    const app = await service.registerApp(CTX, { name: 'W1', kind: 'workshop', url: 'https://w.com' });
    await service.updateApp(CTX, app.id, { enabled: false });
    expect((await service.getApp(CTX, app.id))?.enabled).toBe(false);
    await service.deleteApp(CTX, app.id);
    expect(await service.getApp(CTX, app.id)).toBeNull();
  });
});

// ===========================================================================
// Layout / device capture
// ===========================================================================

describe('InMemoryLayoutDeviceCaptureService', () => {
  let service: InMemoryLayoutDeviceCaptureService;
  beforeEach(() => { service = new InMemoryLayoutDeviceCaptureService(); });

  it('sets and gets UI state', async () => {
    await service.setState(CTX, { key: 'layout:table1', value: { columns: ['name', 'age'] } });
    const state = await service.getState(CTX, 'layout:table1');
    expect(state?.value).toEqual({ columns: ['name', 'age'] });
  });

  it('lists state by user', async () => {
    await service.setState(CTX, { key: 'k1', value: 'v1' });
    await service.setState(CTX, { key: 'k2', value: 'v2' });
    const list = await service.listState(CTX, 'u1');
    expect(list).toHaveLength(2);
  });

  it('deletes state', async () => {
    await service.setState(CTX, { key: 'k1', value: 'v1' });
    await service.deleteState(CTX, 'k1');
    expect(await service.getState(CTX, 'k1')).toBeNull();
  });

  it('records QR code capture', async () => {
    const cap = await service.recordCapture(CTX, { kind: 'qr_code', data: { decodedValue: 'PAT-001' } });
    expect(cap.kind).toBe('qr_code');
    expect(cap.data.decodedValue).toBe('PAT-001');
  });

  it('records geolocation capture', async () => {
    const cap = await service.recordCapture(CTX, {
      kind: 'geolocation',
      data: { coordinates: { lat: 51.5, lng: -0.1, accuracy: 5 } },
      objectType: 'Facility', objectId: 'f1',
    });
    expect(cap.data.coordinates?.lat).toBe(51.5);
    expect(cap.objectId).toBe('f1');
  });

  it('lists captures by kind', async () => {
    await service.recordCapture(CTX, { kind: 'qr_code', data: { decodedValue: 'A' } });
    await service.recordCapture(CTX, { kind: 'geolocation', data: { coordinates: { lat: 0, lng: 0 } } });
    const qr = await service.listCaptures(CTX, 'qr_code');
    expect(qr).toHaveLength(1);
  });

  it('resolves deep links', async () => {
    await service.registerDeepLinkPattern(CTX, 'app1', '/app/{name}/view/{id}', 'object_detail');
    const resolved = await service.resolveDeepLink(CTX, '/app/patient/view/p1');
    expect(resolved.valid).toBe(true);
    expect(resolved.params.name).toBe('patient');
    expect(resolved.params.id).toBe('p1');
    expect(resolved.screen).toBe('object_detail');
  });

  it('rejects invalid deep links', async () => {
    const resolved = await service.resolveDeepLink(CTX, '/unknown/path');
    expect(resolved.valid).toBe(false);
  });
});

// ===========================================================================
// Widget library — DELETED in §4C, consolidated onto workshop-platform
// ===========================================================================

// ===========================================================================
// Platform resources
// ===========================================================================

describe('InMemoryPlatformResourceService', () => {
  let service: InMemoryPlatformResourceService;
  beforeEach(() => { service = new InMemoryPlatformResourceService(); });

  it('creates and retrieves resources', async () => {
    const r = await service.createResource(CTX, { name: 'report.pdf', kind: 'file', mimeType: 'application/pdf', sizeBytes: 1024 });
    expect(r.name).toBe('report.pdf');
    expect((await service.getResource(CTX, r.id))?.name).toBe('report.pdf');
  });

  it('creates folder hierarchy', async () => {
    const folder = await service.createResource(CTX, { name: 'Reports', kind: 'folder', isFolder: true });
    const file = await service.createResource(CTX, { name: 'Q1.pdf', kind: 'file', parentId: folder.id, mimeType: 'application/pdf' });
    expect(file.path).toBe('Reports/Q1.pdf');
  });

  it('lists resources by parent', async () => {
    const folder = await service.createResource(CTX, { name: 'F1', kind: 'folder', isFolder: true });
    await service.createResource(CTX, { name: 'f1.txt', kind: 'file', parentId: folder.id });
    await service.createResource(CTX, { name: 'f2.txt', kind: 'file', parentId: folder.id });
    const children = await service.listResources(CTX, folder.id);
    expect(children).toHaveLength(2);
  });

  it('browses root resources', async () => {
    await service.createResource(CTX, { name: 'A.txt', kind: 'file' });
    await service.createResource(CTX, { name: 'B.txt', kind: 'file' });
    const root = await service.browse(CTX);
    expect(root).toHaveLength(2);
  });

  it('searches resources by name', async () => {
    await service.createResource(CTX, { name: 'patient_report.pdf', kind: 'file' });
    await service.createResource(CTX, { name: 'order_data.csv', kind: 'file' });
    const results = await service.search(CTX, 'patient');
    expect(results).toHaveLength(1);
  });

  it('links a resource to an object', async () => {
    const r = await service.createResource(CTX, { name: 'scan.pdf', kind: 'file' });
    const link = await service.linkToObject(CTX, { resourceId: r.id, objectType: 'Patient', objectId: 'p1' });
    expect(link.linkKind).toBe('attachment');
    const links = await service.getLinksForObject(CTX, 'Patient', 'p1');
    expect(links).toHaveLength(1);
  });

  it('gets links for a resource', async () => {
    const r = await service.createResource(CTX, { name: 'doc.pdf', kind: 'file' });
    await service.linkToObject(CTX, { resourceId: r.id, objectType: 'Patient', objectId: 'p1' });
    await service.linkToObject(CTX, { resourceId: r.id, objectType: 'Order', objectId: 'o1', linkKind: 'reference' });
    const links = await service.getLinksForResource(CTX, r.id);
    expect(links).toHaveLength(2);
  });

  it('upload-and-links in one operation', async () => {
    const result = await service.uploadAndLink(CTX, {
      name: 'xray.jpg', objectType: 'Patient', objectId: 'p1',
      mimeType: 'image/jpeg', sizeBytes: 2048, storageRef: 'blob://xray.jpg',
    });
    expect(result.resource.name).toBe('xray.jpg');
    expect(result.link.objectId).toBe('p1');
  });

  it('deletes a resource and its links', async () => {
    const r = await service.createResource(CTX, { name: 'doc.pdf', kind: 'file' });
    await service.linkToObject(CTX, { resourceId: r.id, objectType: 'Patient', objectId: 'p1' });
    await service.deleteResource(CTX, r.id);
    expect(await service.getResource(CTX, r.id)).toBeNull();
    expect(await service.getLinksForResource(CTX, r.id)).toHaveLength(0);
  });
});
