/**
 * Tests for websearch-style query syntax in the memory provider.
 *
 * Proves the parser-based search supports:
 *   - `"phrase"`     → contiguous substring
 *   - `word1 word2`  → AND (both required)
 *   - `a OR b`       → either matches
 *   - `-word`        → exclusion
 *
 * These tests fail against the old single-substring ILIKE implementation
 * (which treated `acute care` as one literal and had no OR/exclusion).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../memory-storage-provider.js';
import type { RequestContext, OntologySchema } from '@altius/spi';

const ctx: RequestContext = { tenantId: 't-1', actorId: 'user-1' };

const schema: OntologySchema = {
  version: 1,
  objectTypes: [
    {
      name: 'Patient',
      properties: [
        { name: 'name', type: 'string', required: true },
        { name: 'diagnosis', type: 'string', required: false },
        { name: 'ward', type: 'string', required: false },
      ],
    },
  ],
  linkTypes: [],
};

let provider: MemoryStorageProvider;

beforeEach(async () => {
  provider = new MemoryStorageProvider();
  await provider.applySchema(ctx, schema);
});

describe('search — websearch query syntax', () => {
  describe('phrase', () => {
    it('matches a quoted phrase as contiguous only', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'jones', diagnosis: 'acute care needed' });
      await provider.createObject(ctx, 'Patient', { name: 'smith', diagnosis: 'acute, then care later' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: '"acute care"', fields: ['diagnosis'] });
      expect(r.hits.map((h) => h.object.name)).toEqual(['jones']);
    });
  });

  describe('AND (implicit)', () => {
    it('requires both words to match somewhere', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'jones', diagnosis: 'acute', ward: 'icu' });
      await provider.createObject(ctx, 'Patient', { name: 'smith', diagnosis: 'acute', ward: 'general' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: 'acute icu', fields: ['diagnosis', 'ward'] });
      expect(r.hits.map((h) => h.object.name)).toEqual(['jones']);
    });
  });

  describe('OR', () => {
    it('matches either term', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'a', diagnosis: 'sepsis' });
      await provider.createObject(ctx, 'Patient', { name: 'b', diagnosis: 'trauma' });
      await provider.createObject(ctx, 'Patient', { name: 'c', diagnosis: 'stable' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: 'sepsis OR trauma', fields: ['diagnosis'] });
      expect(r.hits.map((h) => h.object.name).sort()).toEqual(['a', 'b']);
    });

    it('combines OR with a required term', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'a', diagnosis: 'sepsis', ward: 'icu' });
      await provider.createObject(ctx, 'Patient', { name: 'b', diagnosis: 'trauma', ward: 'icu' });
      await provider.createObject(ctx, 'Patient', { name: 'c', diagnosis: 'sepsis', ward: 'general' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: 'icu sepsis OR trauma', fields: ['diagnosis', 'ward'] });
      // icu required; sepsis or trauma optional → a and b match, c does not (ward=general)
      expect(r.hits.map((h) => h.object.name).sort()).toEqual(['a', 'b']);
    });
  });

  describe('exclusion', () => {
    it('filters out rows containing the excluded term', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'a', diagnosis: 'acute critical' });
      await provider.createObject(ctx, 'Patient', { name: 'b', diagnosis: 'acute stable' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: 'acute -stable', fields: ['diagnosis'] });
      expect(r.hits.map((h) => h.object.name)).toEqual(['a']);
    });
  });

  describe('backward compatibility', () => {
    it('a bare word still matches as a substring', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'a', diagnosis: 'hospital ward' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: 'ward', fields: ['diagnosis'] });
      expect(r.hits).toHaveLength(1);
      expect(r.hits[0]!.object.name).toBe('a');
    });

    it('empty query returns no hits', async () => {
      await provider.createObject(ctx, 'Patient', { name: 'a', diagnosis: 'x' });
      const r = await provider.searchObjects(ctx, 'Patient', { query: '', fields: ['diagnosis'] });
      expect(r.hits).toHaveLength(0);
    });
  });
});
