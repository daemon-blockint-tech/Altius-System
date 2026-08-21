/**
 * MultiOntologyGovernanceService conformance — the same assertions against
 * every provider.
 *
 * Most of this category is about `checkAccess`, on purpose. Spaces and ontology
 * entities are records; sharing rules are an **authorization surface**, and the
 * failure that matters is not losing one but the two providers reading one
 * differently. A disagreement about ordering returns rows in a surprising
 * order. A disagreement here means one deployment granting a partner org access
 * the other denies, with neither side looking wrong from where it stands.
 *
 * The decision itself is shared code in @altius/spi, which is half the
 * guarantee. This is the half that checks both providers feed it the same
 * space, the same ontology and the same rules, in the same order.
 */

import { describe, it, expect } from 'vitest';
import type { MultiOntologyGovernanceService, RequestContext } from '@altius/spi';

export type MultiOntologyFactory = () =>
  | MultiOntologyGovernanceService
  | Promise<MultiOntologyGovernanceService>;

export function registerMultiOntologyTests(providerName: string, factory: MultiOntologyFactory): void {
  describe(`[${providerName}] SPI Conformance: MultiOntologyGovernanceService`, () => {
    // Postgres keeps rows between cases where a fresh Map does not, so each
    // case gets a tenant no other case touches.
    let counter = 0;
    const ctxFor = (label: string): RequestContext => ({ tenantId: `t_mog_${label}_${counter++}`, actorId: 'u1' });

    describe('spaces', () => {
      it('creates a space owning nothing, with defaults applied', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_create');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        expect(space.name).toBe('trust-a');
        expect(space.orgScope).toBe('org_a');
        expect(space.shared).toBe(false);
        expect(space.description).toBe('');
        expect(space.defaultMarkings).toEqual([]);
        expect(space.ontologyIds).toEqual([]);
        expect(space.createdBy).toBe('u1');
      });

      it('round-trips shared-with orgs and default markings', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_fields');
        const space = await svc.createSpace(ctx, {
          name: 'trust-a', orgScope: 'org_a',
          description: 'the acute trust',
          shared: true, sharedWithOrgs: ['org_b', 'org_c'],
          defaultMarkings: ['PII', 'NHS'],
        });
        const found = await svc.getSpace(ctx, space.id);
        expect(found!.shared).toBe(true);
        expect(found!.sharedWithOrgs).toEqual(['org_b', 'org_c']);
        expect(found!.defaultMarkings).toEqual(['PII', 'NHS']);
        expect(found!.description).toBe('the acute trust');
      });

      it('returns null for an unknown space id', async () => {
        const svc = await factory();
        expect(await svc.getSpace(ctxFor('space_missing'), 'no-such-space')).toBeNull();
        expect(await svc.getSpaceByName(ctxFor('space_missing'), 'no-such-name')).toBeNull();
      });

      it('finds a space by name', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_byname');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        expect((await svc.getSpaceByName(ctx, 'trust-a'))!.id).toBe(space.id);
      });

      it('lets the most recent space win a duplicate name', async () => {
        // Neither provider enforces uniqueness on the name, so this pins what
        // actually happens rather than asserting a constraint that is not
        // there. Adding one on either side would reject writes the other
        // accepts.
        const svc = await factory();
        const ctx = ctxFor('space_dupname');
        await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const second = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_b' });
        expect((await svc.getSpaceByName(ctx, 'trust-a'))!.id).toBe(second.id);
        expect(await svc.listSpaces(ctx)).toHaveLength(2);
      });

      it('lists spaces an org can see: its own, plus shared ones naming it', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_list');
        await svc.createSpace(ctx, { name: 'own', orgScope: 'org_a' });
        await svc.createSpace(ctx, { name: 'shared-with-a', orgScope: 'org_b', shared: true, sharedWithOrgs: ['org_a'] });
        await svc.createSpace(ctx, { name: 'shared-elsewhere', orgScope: 'org_b', shared: true, sharedWithOrgs: ['org_c'] });
        await svc.createSpace(ctx, { name: 'private-b', orgScope: 'org_b' });

        expect(await svc.listSpaces(ctx)).toHaveLength(4);
        const visible = (await svc.listSpaces(ctx, 'org_a')).map(s => s.name).sort();
        expect(visible).toEqual(['own', 'shared-with-a']);
      });

      it('updates a space, leaving unspecified fields alone', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_update');
        const space = await svc.createSpace(ctx, {
          name: 'trust-a', orgScope: 'org_a', defaultMarkings: ['PII'],
        });
        const updated = await svc.updateSpace(ctx, space.id, { description: 'renamed reason' });
        expect(updated.description).toBe('renamed reason');
        expect(updated.name).toBe('trust-a');
        expect(updated.orgScope).toBe('org_a');
        expect(updated.defaultMarkings).toEqual(['PII']);
      });

      it('reports a missing space on update', async () => {
        const svc = await factory();
        await expect(svc.updateSpace(ctxFor('space_gone'), 'no-such-space', { shared: true }))
          .rejects.toThrow(/not found/i);
      });

      it('deletes a space', async () => {
        const svc = await factory();
        const ctx = ctxFor('space_delete');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        await svc.deleteSpace(ctx, space.id);
        expect(await svc.getSpace(ctx, space.id)).toBeNull();
        expect(await svc.getSpaceByName(ctx, 'trust-a')).toBeNull();
      });

      it('keeps spaces in separate tenants apart', async () => {
        const svc = await factory();
        const a = ctxFor('space_iso_a');
        const b = ctxFor('space_iso_b');
        const space = await svc.createSpace(a, { name: 'trust-a', orgScope: 'org_a' });
        expect(await svc.getSpace(b, space.id)).toBeNull();
        expect(await svc.listSpaces(b)).toHaveLength(0);
      });
    });

    describe('ontology entities', () => {
      it('creates an ontology inheriting the space org scope and default markings', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_create');
        const space = await svc.createSpace(ctx, {
          name: 'trust-a', orgScope: 'org_a', defaultMarkings: ['PII'],
        });
        const ont = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id });
        // Inheritance is the interesting part: an ontology created without
        // markings still carries the space's classification.
        expect(ont.markings).toEqual(['PII']);
        expect(ont.orgScope).toBe('org_a');
        expect(ont.displayName).toBe('patient');
        expect(ont.schemaVersion).toBe(1);
        expect(ont.readOnly).toBe(false);
      });

      it('lets explicit markings override the space defaults', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_markings');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a', defaultMarkings: ['PII'] });
        const ont = await svc.createOntology(ctx, { name: 'ref', spaceId: space.id, markings: [] });
        expect(ont.markings).toEqual([]);
      });

      it('refuses to create an ontology in a space that does not exist', async () => {
        const svc = await factory();
        await expect(svc.createOntology(ctxFor('ont_nospace'), { name: 'x', spaceId: 'no-such-space' }))
          .rejects.toThrow(/not found/i);
      });

      it('adds the ontology to the space it belongs to', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_inspace');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const a = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id });
        const b = await svc.createOntology(ctx, { name: 'episode', spaceId: space.id });
        expect((await svc.getSpace(ctx, space.id))!.ontologyIds).toEqual([a.id, b.id]);
      });

      it('removes a deleted ontology from its space', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_delete');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const a = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id });
        const b = await svc.createOntology(ctx, { name: 'episode', spaceId: space.id });
        await svc.deleteOntology(ctx, a.id);
        expect(await svc.getOntology(ctx, a.id)).toBeNull();
        expect((await svc.getSpace(ctx, space.id))!.ontologyIds).toEqual([b.id]);
      });

      it('finds an ontology by name within its space', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_byname');
        const spaceA = await svc.createSpace(ctx, { name: 'a', orgScope: 'org_a' });
        const spaceB = await svc.createSpace(ctx, { name: 'b', orgScope: 'org_b' });
        const inA = await svc.createOntology(ctx, { name: 'patient', spaceId: spaceA.id });
        await svc.createOntology(ctx, { name: 'patient', spaceId: spaceB.id });
        // Same name in two spaces resolves per space, not globally.
        expect((await svc.getOntologyByName(ctx, spaceA.id, 'patient'))!.id).toBe(inA.id);
        expect(await svc.getOntologyByName(ctx, spaceA.id, 'nothing')).toBeNull();
      });

      it('lists ontologies, filterable by space', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_list');
        const spaceA = await svc.createSpace(ctx, { name: 'a', orgScope: 'org_a' });
        const spaceB = await svc.createSpace(ctx, { name: 'b', orgScope: 'org_b' });
        await svc.createOntology(ctx, { name: 'patient', spaceId: spaceA.id });
        await svc.createOntology(ctx, { name: 'episode', spaceId: spaceA.id });
        await svc.createOntology(ctx, { name: 'supplier', spaceId: spaceB.id });
        expect(await svc.listOntologies(ctx)).toHaveLength(3);
        expect(await svc.listOntologies(ctx, spaceA.id)).toHaveLength(2);
      });

      it('updates an ontology without moving it between spaces', async () => {
        const svc = await factory();
        const ctx = ctxFor('ont_update');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const ont = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id, markings: ['PII'] });
        const updated = await svc.updateOntology(ctx, ont.id, { displayName: 'Patient', readOnly: true });
        expect(updated.displayName).toBe('Patient');
        expect(updated.readOnly).toBe(true);
        // Unspecified fields hold, and the space is not a field you can change:
        // moving an ontology between spaces would move it between org scopes,
        // which is an access change dressed up as an edit.
        expect(updated.name).toBe('patient');
        expect(updated.markings).toEqual(['PII']);
        expect(updated.spaceId).toBe(space.id);
        expect(updated.orgScope).toBe('org_a');
      });

      it('reports a missing ontology on update', async () => {
        const svc = await factory();
        await expect(svc.updateOntology(ctxFor('ont_gone'), 'no-such-ontology', { readOnly: true }))
          .rejects.toThrow(/not found/i);
      });
    });

    describe('sharing rules', () => {
      it('creates a rule enabled by default, sharing the whole space', async () => {
        const svc = await factory();
        const ctx = ctxFor('rule_create');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const rule = await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b' });
        // Both defaults decide who can see what: an empty `ontologyIds` shares
        // everything in the space, an empty `allowedMarkings` allows every
        // marking, and `enabled` defaults on.
        expect(rule.enabled).toBe(true);
        expect(rule.ontologyIds).toEqual([]);
        expect(rule.allowedMarkings).toEqual([]);
        expect(rule.bidirectional).toBe(false);
        expect(rule.createdBy).toBe('u1');
      });

      it('round-trips the ontology and marking lists', async () => {
        const svc = await factory();
        const ctx = ctxFor('rule_fields');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const rule = await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b',
          ontologyIds: ['o1', 'o2'], allowedMarkings: ['PII'], bidirectional: true, enabled: false,
        });
        const found = await svc.getSharingRule(ctx, rule.id);
        expect(found!.ontologyIds).toEqual(['o1', 'o2']);
        expect(found!.allowedMarkings).toEqual(['PII']);
        expect(found!.bidirectional).toBe(true);
        expect(found!.enabled).toBe(false);
      });

      it('lists rules, filterable by source space', async () => {
        const svc = await factory();
        const ctx = ctxFor('rule_list');
        const a = await svc.createSpace(ctx, { name: 'a', orgScope: 'org_a' });
        const b = await svc.createSpace(ctx, { name: 'b', orgScope: 'org_b' });
        await svc.createSharingRule(ctx, { sourceSpaceId: a.id, targetOrgScope: 'org_b' });
        await svc.createSharingRule(ctx, { sourceSpaceId: b.id, targetOrgScope: 'org_a' });
        expect(await svc.listSharingRules(ctx)).toHaveLength(2);
        expect(await svc.listSharingRules(ctx, a.id)).toHaveLength(1);
      });

      it('updates and deletes a rule', async () => {
        const svc = await factory();
        const ctx = ctxFor('rule_update');
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const rule = await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['PII'],
        });
        const updated = await svc.updateSharingRule(ctx, rule.id, { enabled: false });
        expect(updated.enabled).toBe(false);
        expect(updated.targetOrgScope).toBe('org_b');
        expect(updated.allowedMarkings).toEqual(['PII']);
        expect(updated.sourceSpaceId).toBe(space.id);

        await svc.deleteSharingRule(ctx, rule.id);
        expect(await svc.getSharingRule(ctx, rule.id)).toBeNull();
      });

      it('reports a missing rule on update', async () => {
        const svc = await factory();
        await expect(svc.updateSharingRule(ctxFor('rule_gone'), 'no-such-rule', { enabled: false }))
          .rejects.toThrow(/not found/i);
      });
    });

    describe('the access check', () => {
      /** A space in org_a holding one ontology, plus a helper to add rules. */
      async function crossOrg(label: string, markings: string[] = []) {
        const svc = await factory();
        const ctx = ctxFor(label);
        const space = await svc.createSpace(ctx, { name: 'trust-a', orgScope: 'org_a' });
        const ont = await svc.createOntology(ctx, { name: 'patient', spaceId: space.id, markings });
        return { svc, ctx, space, ont };
      }

      it('allows the owning org without any rule', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_same');
        const result = await svc.checkAccess(ctx, ont.id, 'org_a');
        expect(result.allowed).toBe(true);
        expect(result.viaSharingRule).toBe(false);
        expect(result.spaceId).toBe(space.id);
        expect(result.ontologyOrgScope).toBe('org_a');
        expect(result.denialReasons).toEqual([]);
        expect(result.sharingRuleId).toBeUndefined();
      });

      it('denies another org when no rule grants it', async () => {
        // Fails closed, and says why — the property that makes losing rules
        // loud rather than silent.
        const { svc, ctx, ont } = await crossOrg('acc_none');
        const result = await svc.checkAccess(ctx, ont.id, 'org_b');
        expect(result.allowed).toBe(false);
        expect(result.viaSharingRule).toBe(false);
        expect(result.denialReasons).toHaveLength(1);
        expect(result.denialReasons[0]).toMatch(/no sharing rule grants org_b/i);
      });

      it('allows another org through a rule, and names the rule', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_rule');
        const rule = await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b' });
        const result = await svc.checkAccess(ctx, ont.id, 'org_b');
        expect(result.allowed).toBe(true);
        expect(result.viaSharingRule).toBe(true);
        // Which rule granted it is the audit answer, so both providers have to
        // attribute the grant to the same one.
        expect(result.sharingRuleId).toBe(rule.id);
      });

      it('ignores a disabled rule', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_disabled');
        await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b', enabled: false });
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(false);
      });

      it('ignores a rule aimed at a different org', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_otherorg');
        await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_c' });
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(false);
        expect((await svc.checkAccess(ctx, ont.id, 'org_c')).allowed).toBe(true);
      });

      it('honours a rule that names specific ontologies', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_subset');
        const other = await svc.createOntology(ctx, { name: 'episode', spaceId: space.id });
        await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', ontologyIds: [ont.id],
        });
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(true);
        expect((await svc.checkAccess(ctx, other.id, 'org_b')).allowed).toBe(false);
      });

      it('denies an ontology carrying a marking the rule does not allow', async () => {
        // The check is over what the ontology *has*, not what the rule wants:
        // any marking outside the allowed list denies the whole ontology.
        const { svc, ctx, space, ont } = await crossOrg('acc_marking', ['PII', 'RESTRICTED']);
        await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['PII'],
        });
        const result = await svc.checkAccess(ctx, ont.id, 'org_b');
        expect(result.allowed).toBe(false);
        expect(result.denialReasons.some(r => /markings not allowed/i.test(r))).toBe(true);
      });

      it('allows an ontology whose markings are all on the allowed list', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_marking_ok', ['PII']);
        await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['PII', 'NHS'],
        });
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(true);
      });

      it('treats an empty allowedMarkings as allowing every marking', async () => {
        const { svc, ctx, space, ont } = await crossOrg('acc_marking_empty', ['RESTRICTED']);
        await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b' });
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(true);
      });

      it('falls through a non-matching rule to a later one that matches', async () => {
        // Rules are evaluated in list order and the first match wins, so the
        // order has to be a total one: which rule is credited with the grant is
        // the audit answer, and it must not swap between calls.
        const { svc, ctx, space, ont } = await crossOrg('acc_fallthrough', ['PII']);
        await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['NHS'],
        });
        const permissive = await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', allowedMarkings: ['PII'],
        });
        const result = await svc.checkAccess(ctx, ont.id, 'org_b');
        expect(result.allowed).toBe(true);
        expect(result.sharingRuleId).toBe(permissive.id);
      });

      it('credits the first matching rule, not a later one', async () => {
        // When two rules both grant, which one is credited is the audit answer
        // — "org_b saw this because of rule X". Both providers list rules in
        // insertion order and take the first match, so the attribution has to
        // be stable and identical. A provider ordering rules any other way
        // would still allow access and still be wrong here.
        const { svc, ctx, space, ont } = await crossOrg('acc_firstmatch');
        const firstRule = await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b' });
        await svc.createSharingRule(ctx, { sourceSpaceId: space.id, targetOrgScope: 'org_b' });
        const result = await svc.checkAccess(ctx, ont.id, 'org_b');
        expect(result.allowed).toBe(true);
        expect(result.sharingRuleId).toBe(firstRule.id);
      });

      it('grants nothing extra for a bidirectional rule', async () => {
        // PINNED AS-IS, NOT ENDORSED. `bidirectional` cannot change any
        // outcome: the clause reading it also requires the caller to be in the
        // space's own org, and that case has already returned `allowed: true`
        // on the same-org check. So the flag is inert in both providers.
        //
        // Reproduced rather than repaired because repairing it would *widen*
        // who can reach an ontology — the one direction an access check must
        // never move as a side effect of relocating code. Raised as a contract
        // question instead.
        const { svc, ctx, space, ont } = await crossOrg('acc_bidi');
        const otherSpace = await svc.createSpace(ctx, { name: 'trust-b', orgScope: 'org_b' });
        const otherOnt = await svc.createOntology(ctx, { name: 'supplier', spaceId: otherSpace.id });
        await svc.createSharingRule(ctx, {
          sourceSpaceId: space.id, targetOrgScope: 'org_b', bidirectional: true,
        });
        // org_b reaches org_a's ontology, as the rule says.
        expect((await svc.checkAccess(ctx, ont.id, 'org_b')).allowed).toBe(true);
        // But org_a does NOT reach org_b's, even though the rule claims to be
        // two-way. That is the inertness, asserted so it cannot change quietly.
        expect((await svc.checkAccess(ctx, otherOnt.id, 'org_a')).allowed).toBe(false);
      });

      it('throws for an ontology that does not exist', async () => {
        const svc = await factory();
        await expect(svc.checkAccess(ctxFor('acc_noont'), 'no-such-ontology', 'org_a'))
          .rejects.toThrow(/not found/i);
      });

      it('throws for an ontology whose space has been deleted', async () => {
        // Deleting a space does not cascade in either provider, so its
        // ontologies outlive it and become uncheckable. A sharp edge, pinned
        // rather than smoothed.
        const { svc, ctx, space, ont } = await crossOrg('acc_nospace');
        await svc.deleteSpace(ctx, space.id);
        await expect(svc.checkAccess(ctx, ont.id, 'org_a')).rejects.toThrow(/space not found/i);
      });
    });

    describe('resolving what an org can see', () => {
      it('returns only the ontologies the caller can reach', async () => {
        const svc = await factory();
        const ctx = ctxFor('resolve');
        const spaceA = await svc.createSpace(ctx, { name: 'a', orgScope: 'org_a' });
        const spaceB = await svc.createSpace(ctx, { name: 'b', orgScope: 'org_b' });
        const ownA = await svc.createOntology(ctx, { name: 'patient', spaceId: spaceA.id });
        const sharedB = await svc.createOntology(ctx, { name: 'supplier', spaceId: spaceB.id });
        await svc.createOntology(ctx, { name: 'secret', spaceId: spaceB.id });
        await svc.createSharingRule(ctx, {
          sourceSpaceId: spaceB.id, targetOrgScope: 'org_a', ontologyIds: [sharedB.id],
        });

        const visible = await svc.resolveAccessibleOntologies(ctx, 'org_a');
        expect(visible.map(o => o.id).sort()).toEqual([ownA.id, sharedB.id].sort());
      });

      it('returns nothing for an org with no space and no grant', async () => {
        const svc = await factory();
        const ctx = ctxFor('resolve_none');
        const space = await svc.createSpace(ctx, { name: 'a', orgScope: 'org_a' });
        await svc.createOntology(ctx, { name: 'patient', spaceId: space.id });
        expect(await svc.resolveAccessibleOntologies(ctx, 'org_z')).toEqual([]);
      });
    });
  });
}
