#!/usr/bin/env node
/**
 * Capability reachability analyser.
 *
 * A capability counts only if a user can reach it through a real API against
 * real Postgres. Prose and grep both overstate that: an interface can be fully
 * written, fully tested, exported from a barrel, and still be reachable from
 * nothing — the backlog calls this "generated-but-dead", and it is the single
 * most common way a row gets graded up without a user gaining anything.
 *
 * So this measures three things per SPI service, from source, with tests
 * excluded from the graph (a test caller is not a user):
 *
 *   inDegree  — non-test files referencing the symbol, minus its own
 *               definition and barrel re-exports. 0 means dead.
 *   surface   — which entry points reach it: rest | graphql | mcp | fhir.
 *   durable   — whether an implementation exists outside storage-memory.
 *
 * Grade mapping, using the audit's "demote don't confirm" bar:
 *   absent   — no surface (nothing routes to it), or no implementation at all
 *   partial  — reachable, but memory-only, so non-durable in production
 *   full     — reachable AND durable
 *
 * `full` here is a necessary condition, not a sufficient one: it says a user
 * can reach a durable implementation, not that the capability is complete.
 * Rows are demoted further by hand where behaviour is missing.
 *
 * Usage: node tools/parity/reachability.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PKGS = join(ROOT, 'packages');

const isTest = (p) =>
  p.includes('__tests__') || p.endsWith('.test.ts') || p.endsWith('.test.tsx') || p.includes('/tests/');

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.turbo') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(PKGS).filter((f) => !isTest(f));
const source = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// SPI service interfaces are the unit of capability here: each is the contract
// a capability is delivered through.
const spiFiles = files.filter((f) => f.includes('/spi/src/'));
const services = new Set();
for (const f of spiFiles) {
  for (const m of source.get(f).matchAll(/^export interface ([A-Za-z0-9_]*(?:Service|Store))\b/gm)) {
    services.add(m[1]);
  }
}

// Entry points: the files that actually put a capability in front of a user.
const surfaceOf = (p) => {
  if (/\/api\/src\/rest\//.test(p)) return 'rest';
  if (/\/api\/src\/graphql\//.test(p)) return 'graphql';
  if (/\/api\/src\/fhir\//.test(p)) return 'fhir';
  if (/\/mcp-server\/src\//.test(p)) return 'mcp';
  return null;
};

// A barrel re-export is not a caller.
const isBarrel = (p) => /\/src\/index\.ts$/.test(p);

// Route modules never name the interface — they read the dependency slot
// (`deps.datasetService`). Matching only the interface name reports every wired
// service as dead. The slot name is not always the interface name lowercased
// either (OntologyUsageMetricsService is wired as `usageMetricsService`), so
// read the real mapping out of ApiDependencies rather than guessing it.
const depSlots = new Map(); // TypeName -> [propName, ...]
{
  const typesFile = join(PKGS, 'api/src/graphql/types.ts');
  const src = readFileSync(typesFile, 'utf8');
  for (const m of src.matchAll(/^\s*([a-zA-Z0-9_]+)\??:\s*([A-Za-z0-9_]+)\s*[;|]/gm)) {
    const [, prop, type] = m;
    if (!depSlots.has(type)) depSlots.set(type, []);
    if (!depSlots.get(type).includes(prop)) depSlots.get(type).push(prop);
  }
}
const propsFor = (svc) => {
  const declared = depSlots.get(svc) ?? [];
  const fallback = svc[0].toLowerCase() + svc.slice(1);
  return declared.length ? declared : [fallback];
};

// A capability need not be read straight from a route: ObjectSetStore is
// reached through `deps.objectSetManager`, whose manager wraps the store. So
// resolve reachability transitively — start from the dep slots routes actually
// read, then follow each slot's declared type into the files that define or
// implement it, picking up the services those reference, and repeat.
const filesReferencing = (name) => {
  const re = new RegExp(`\\b${name}\\b`);
  return [...source].filter(([, src]) => re.test(src)).map(([f]) => f);
};

const reachedVia = new Map(); // service -> Set(surface)
{
  // Seed: dep slots read by each entry-point module.
  const seeds = []; // [typeName, surface]
  for (const [f, src] of source) {
    const s = surfaceOf(f);
    if (!s || /\/graphql\/types\.ts$/.test(f)) continue;
    for (const m of src.matchAll(/deps\.([a-zA-Z0-9_]+)\b/g)) {
      for (const [type, propList] of depSlots) {
        if (propList.includes(m[1])) seeds.push([type, s]);
      }
    }
  }

  for (const [type, surface] of seeds) {
    const seen = new Set();
    const queue = [type];
    while (queue.length) {
      const t = queue.shift();
      if (seen.has(t)) continue;
      seen.add(t);
      if (services.has(t)) {
        if (!reachedVia.has(t)) reachedVia.set(t, new Set());
        reachedVia.get(t).add(surface);
      }
      // Follow only into concrete implementations — a class named T, or a class
      // implementing T. Interface declaration files are deliberately excluded:
      // the SPI co-declares many services per file, and sharing a file is not a
      // call relationship. Following them would let one wired service drag
      // every neighbour in the same file along with it.
      for (const f of filesReferencing(t)) {
        if (isBarrel(f)) continue;
        const src = source.get(f);
        const isImpl =
          new RegExp(`class\\s+${t}\\b`).test(src) ||
          new RegExp(`class\\s+[A-Za-z0-9_]+[^{]*implements[^{]*\\b${t}\\b`).test(src);
        if (!isImpl) continue;
        for (const svc of services) if (svc !== t && new RegExp(`\\b${svc}\\b`).test(src)) queue.push(svc);
      }
    }
  }
}

const rows = [];
for (const svc of [...services].sort()) {
  const props = propsFor(svc);
  const re = new RegExp(`\\b${svc}\\b|` + props.map((p) => `\\bdeps\\.${p}\\b`).join('|'));
  let inDegree = 0;
  const surfaces = new Set();
  let memImpl = false;
  let otherImpl = false;
  const callers = [];

  for (const [f, src] of source) {
    if (!re.test(src)) continue;
    const rel = relative(ROOT, f);
    const isDef = rel.includes('/spi/src/');
    if (!isDef && !isBarrel(f)) {
      inDegree++;
      callers.push(rel);
    }
    const s = surfaceOf(f);
    // graphql/types.ts is a type-only declaration file: it declares the dep
    // slot but routes nothing, so it must not count as a surface. Require an
    // actual read of the slot, not just a mention of the type.
    const reads = props.some((p) => new RegExp(`deps\\.${p}\\b`).test(src));
    if (s && reads && !/\/graphql\/types\.ts$/.test(f)) surfaces.add(s);
    for (const t of reachedVia.get(svc) ?? []) surfaces.add(t);
    // Durable means Postgres-backed, not merely "declared outside
    // storage-memory": several in-memory implementations live in engine/
    // (InMemoryAgentThreadStore), and counting those as durable would grade a
    // capability that vanishes on restart as production-ready.
    // Two ways an implementation declares itself: `implements <Svc>`, or the
    // repo's naming convention (PostgresAuditStore, InMemoryDatasetService).
    // PostgresAuditStore is structurally typed with no `implements` clause, so
    // matching only the explicit form misses the durable implementations.
    const implMatch = src.match(new RegExp(`class\\s+([A-Za-z0-9_]+)[^{]*implements[^{]*\\b${svc}\\b`));
    const named = src.match(new RegExp(`class\\s+((?:Postgres|InMemory|Default)${svc})\\b`));
    const cls = implMatch?.[1] ?? named?.[1];
    if (cls) {
      if (/^Postgres/.test(cls) || rel.includes('storage-postgres')) otherImpl = true;
      else memImpl = true;
    }
  }

  let grade;
  if (!memImpl && !otherImpl) grade = 'absent';
  else if (surfaces.size === 0) grade = 'absent';
  else if (!otherImpl) grade = 'partial';
  else grade = 'full';

  rows.push({
    service: svc,
    inDegree,
    surfaces: [...surfaces].sort(),
    memImpl,
    durableImpl: otherImpl,
    grade,
    callers: callers.slice(0, 6),
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('SERVICE', 36), pad('IN', 4), pad('SURFACES', 22), pad('MEM', 5), pad('DUR', 5), 'GRADE');
  console.log('-'.repeat(88));
  for (const r of rows) {
    console.log(
      pad(r.service, 36),
      pad(r.inDegree, 4),
      pad(r.surfaces.join(',') || '—', 22),
      pad(r.memImpl ? 'y' : '—', 5),
      pad(r.durableImpl ? 'y' : '—', 5),
      r.grade,
    );
  }
  const tally = rows.reduce((a, r) => ((a[r.grade] = (a[r.grade] ?? 0) + 1), a), {});
  console.log('-'.repeat(88));
  console.log(
    `${rows.length} SPI services — full ${tally.full ?? 0}, partial ${tally.partial ?? 0}, absent ${tally.absent ?? 0}`,
  );
}
