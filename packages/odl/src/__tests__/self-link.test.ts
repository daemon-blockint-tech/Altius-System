/**
 * A link type may point a type at itself.
 *
 * Self-links are how a pack models hierarchy and threading — a reply pointing
 * at its parent comment, a task at its parent task, an org unit at its parent.
 * Nothing in the compiler forbade it, but no fixture exercised it either, and
 * the OpenFGA generator derives `viewer`/`editor` through a type's outbound
 * link: a self-link is exactly the shape that could emit `viewer: viewer from
 * <its own relation>`, which OpenFGA rejects as a cycle.
 *
 * These pin that a self-link parses, validates, and generates usable output on
 * all three surfaces, so the threading shape stays available to packs.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '../parser/index.js';
import { validateSchema } from '../validator/index.js';
import { generateGraphQLSchema } from '../codegen/index.js';
import { generateOpenFGAModel } from '../codegen/openfga.js';

/** A threaded comment: replies point at their parent, comments point at a subject. */
const THREADED = `
extend schema @namespace(name: "collab", version: "0.1.0")

type Comment @objectType {
  id: ID! @primary
  body: String!
  authorId: String! @indexed
  parent: Comment @link(type: "ReplyTo", direction: OUTBOUND)
  replies: [Comment!]! @link(type: "ReplyTo", direction: INBOUND)
}

type Patient @objectType {
  id: ID! @primary
  name: String
  comments: [Comment!]! @link(type: "CommentOn", direction: INBOUND)
}

type CommentOn @linkType(from: "Comment", to: "Patient", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}

type ReplyTo @linkType(from: "Comment", to: "Comment", cardinality: MANY_TO_ONE) {
  id: ID! @primary
}
`;

function errorsOf(schema: ReturnType<typeof parseOdl>): string[] {
  const result = validateSchema(schema) as unknown;
  const issues = Array.isArray(result)
    ? result
    : ((result as { issues?: unknown[] }).issues ?? []);
  return (issues as Array<{ severity: string; code: string; message: string }>)
    .filter(i => i.severity === 'error')
    .map(i => `${i.code}: ${i.message}`);
}

describe('self-referential link types', () => {
  it('parses a link whose from and to are the same type', () => {
    const schema = parseOdl(THREADED);
    const replyTo = schema.linkTypes.find(l => l.name === 'ReplyTo');

    expect(replyTo).toBeDefined();
    expect(replyTo!.from).toBe('Comment');
    expect(replyTo!.to).toBe('Comment');
  });

  it('validates without errors', () => {
    expect(errorsOf(parseOdl(THREADED))).toEqual([]);
  });

  it('generates a GraphQL schema that builds', () => {
    expect(() => generateGraphQLSchema(parseOdl(THREADED))).not.toThrow();
  });

  it('never grounds a permission in the type\'s own self-link relation', () => {
    const model = generateOpenFGAModel(parseOdl(THREADED)) as unknown;
    const parsed = (typeof model === 'string' ? JSON.parse(model) : model) as {
      types: Array<{
        name: string;
        relations: Array<{
          name: string;
          derivedFrom?: string;
          directTypes?: string[];
          derivedThrough?: { relation: string; through: string };
        }>;
      }>;
    };

    const comment = parsed.types.find(t => t.name === 'comment');
    expect(comment).toBeDefined();
    const byName = new Map(comment!.relations.map(r => [r.name, r]));

    // The self-link relation is still emitted, so ReplyTo tuples remain
    // storable and traversable.
    expect(byName.get('reply_to')?.directTypes).toEqual(['[comment]']);

    // But viewer/editor must not be derived *through* it. That renders as
    // `viewer: viewer from reply_to` on type comment — a recursive definition
    // with no base case, so no tuple can ever satisfy it and every check on a
    // Comment fails closed and silently.
    for (const name of ['viewer', 'editor']) {
      const rel = byName.get(name);
      expect(rel).toBeDefined();
      const through = rel!.derivedThrough?.through;
      if (through) {
        expect(byName.get(through)?.directTypes).not.toContain('[comment]');
      }
    }

    // Grounded instead: something must actually be able to grant access.
    expect(byName.get('assigned')?.directTypes).toEqual(['[user]']);
    expect(byName.get('viewer')?.derivedFrom).toBe('assigned');
  });
});
