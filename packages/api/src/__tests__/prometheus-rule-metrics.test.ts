/**
 * The Helm PrometheusRule template hard-codes metric names inside PromQL
 * strings. Renaming a gauge in metrics.ts therefore silently disables an alert:
 * PromQL against a non-existent series just never fires, so there is no compile
 * error, no runtime error, and no failing test — the alert simply stops
 * protecting anything.
 *
 * This asserts every app-owned metric named in the template is actually
 * registered. It also fails if the chart moves (the deploy/ -> Orion/ move
 * already happened once), which is the other way this coupling breaks.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import { register } from 'prom-client';

import '../metrics.js'; // registers the app metrics as an import side effect

const RULE_TEMPLATE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../Orion/helm/altius/templates/prometheusrule.yaml',
);

/**
 * Prefixes this app owns. `kube_*` and friends come from kube-state-metrics and
 * are deliberately out of scope. A new app metric using some other prefix would
 * go unchecked — widen this list if that ever happens.
 */
const OWNED_PREFIXES = ['altius_', 'http_'];

/** PromQL refers to histogram series by suffix; the registry holds the base name. */
const SERIES_SUFFIXES = ['_bucket', '_sum', '_count'];

function baseName(series: string): string {
  for (const suffix of SERIES_SUFFIXES) {
    if (series.endsWith(suffix)) return series.slice(0, -suffix.length);
  }
  return series;
}

describe('PrometheusRule metric names', () => {
  it('every app metric referenced by an alert is registered', async () => {
    const template = readFileSync(RULE_TEMPLATE, 'utf-8');

    const referenced = new Set(
      (template.match(/\b(?:altius|http)_[a-z0-9_]+/g) ?? []).filter(name =>
        OWNED_PREFIXES.some(p => name.startsWith(p)),
      ),
    );

    // Guard against the regex silently matching nothing (e.g. the file moved
    // and readFileSync picked up something else).
    expect(referenced.size).toBeGreaterThan(0);

    const registered = new Set((await register.getMetricsAsJSON()).map(m => m.name));

    const missing = [...referenced].filter(
      name => !registered.has(name) && !registered.has(baseName(name)),
    );

    expect(missing, `alert rules reference unregistered metrics: ${missing.join(', ')}`).toEqual([]);
  });
});
