/**
 * Tests for the AIP domain pack.
 *
 * Before this change, there was no AIP domain pack — no Conversation or
 * ChatMessage ObjectTypes, no HasMessage link, and no StartConversation /
 * SendMessage actions. This test verifies the pack loads and parses.
 */

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDomainPacks } from '../schema-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOMAIN_PACKS_DIR = resolve(__dirname, '..', '..', '..', '..', 'domain-packs');

describe('AIP domain pack', () => {
  it('loads with core and produces Conversation + ChatMessage types', async () => {
    const { parsed, spiSchema, packs } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);

    expect(packs).toHaveLength(2);
    expect(packs[1]!.name).toBe('aip');

    // 2 object types: Conversation + ChatMessage
    expect(parsed.objectTypes).toHaveLength(2);
    const objNames = parsed.objectTypes.map(t => t.name).sort();
    expect(objNames).toEqual(['ChatMessage', 'Conversation']);

    // 1 link type: HasMessage
    expect(parsed.linkTypes).toHaveLength(1);
    expect(parsed.linkTypes[0]!.name).toBe('HasMessage');

    // 2 action types: StartConversation + SendMessage
    expect(parsed.actionTypes).toHaveLength(2);
    const actionNames = parsed.actionTypes.map(a => a.name).sort();
    expect(actionNames).toEqual(['SendMessage', 'StartConversation']);

    // SPI schema mirrors parsed schema
    expect(spiSchema.objectTypes).toHaveLength(2);
    expect(spiSchema.linkTypes).toHaveLength(1);
  });

  it('Conversation has expected fields', async () => {
    const { parsed } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const conversation = parsed.objectTypes.find(t => t.name === 'Conversation')!;
    expect(conversation).toBeDefined();

    const fieldNames = conversation.fields.map(f => f.name);
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('status');
    expect(fieldNames).toContain('model');
    expect(fieldNames).toContain('systemPrompt');
    expect(fieldNames).toContain('messages');
  });

  it('ChatMessage has expected fields', async () => {
    const { parsed } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const message = parsed.objectTypes.find(t => t.name === 'ChatMessage')!;
    expect(message).toBeDefined();

    const fieldNames = message.fields.map(f => f.name);
    expect(fieldNames).toContain('role');
    expect(fieldNames).toContain('content');
    expect(fieldNames).toContain('model');
    expect(fieldNames).toContain('promptTokens');
    expect(fieldNames).toContain('completionTokens');
    expect(fieldNames).toContain('conversation');
  });

  it('HasMessage link connects Conversation to ChatMessage', async () => {
    const { parsed } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const link = parsed.linkTypes[0]!;
    expect(link.name).toBe('HasMessage');
    expect(link.from).toBe('Conversation');
    expect(link.to).toBe('ChatMessage');
  });

  it('StartConversation action has title param', async () => {
    const { parsed } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const action = parsed.actionTypes.find(a => a.name === 'StartConversation')!;
    expect(action).toBeDefined();

    const paramFields = action.fields.filter(f =>
      f.directives.some(d => d.kind === 'param'),
    );
    const paramNames = paramFields.map(f => f.name);
    expect(paramNames).toContain('title');
    expect(paramNames).toContain('model');
    expect(paramNames).toContain('systemPrompt');
  });

  it('SendMessage action has conversation + content params', async () => {
    const { parsed } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const action = parsed.actionTypes.find(a => a.name === 'SendMessage')!;
    expect(action).toBeDefined();

    const paramFields = action.fields.filter(f =>
      f.directives.some(d => d.kind === 'param'),
    );
    const paramNames = paramFields.map(f => f.name);
    expect(paramNames).toContain('conversation');
    expect(paramNames).toContain('content');
  });

  it('aip pack declares the aip capability', async () => {
    const { packs } = await loadDomainPacks(DOMAIN_PACKS_DIR, ['core', 'aip']);
    const aipPack = packs.find(p => p.name === 'aip')!;
    expect(aipPack.capabilities).toEqual(expect.arrayContaining(['aip']));
  });
});
