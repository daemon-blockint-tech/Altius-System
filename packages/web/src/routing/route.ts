/**
 * The URL is the console's location, not a React state variable.
 *
 * Every screen in the reference product is addressable: a breadcrumb shows
 * where you are, the back button works, and a link to a record can be pasted
 * to a colleague. None of that is possible while the active screen lives in
 * `useState` — which is also why a hot reload used to drop whoever was
 * reviewing something back to the first screen.
 *
 * Paths, not a hash: nginx already serves the SPA with
 * `try_files $uri $uri/ /index.html`, so a deep link survives a page load in
 * production, and Vite's dev server does the same.
 *
 *   /supply-chain/operate/objects
 *   /supply-chain/operate/objects/Shipment/shp-001   ← record open
 *
 * Parsing is total: anything unrecognised returns null so the caller can show
 * a "not found" screen rather than guessing and rendering the wrong thing.
 */

/** The four jobs, in URL form. `JobKey` stays the internal shorthand. */
export const JOB_SLUGS = {
  OP: 'operate',
  IN: 'investigate',
  MO: 'model',
  AD: 'administer',
} as const;

export type JobKey = keyof typeof JOB_SLUGS;
export type JobSlug = (typeof JOB_SLUGS)[JobKey];

const SLUG_TO_JOB = Object.fromEntries(
  Object.entries(JOB_SLUGS).map(([key, slug]) => [slug, key as JobKey]),
) as Record<string, JobKey>;

export interface Route {
  /** Domain pack id, e.g. `supply-chain`. */
  pack: string;
  job: JobKey;
  /** Screen id within the job, e.g. `objects`. */
  screen: string;
  /** An open record, shown over the screen that linked to it. */
  record?: { type: string; id: string };
}

/** A usable segment: present, and not absurdly long. */
function isSegment(part: string | undefined): part is string {
  return !!part && part.length <= 128;
}

/**
 * Read a Route out of a pathname. Returns null when the path is not one — an
 * unknown URL is a 404, not a silent redirect to somewhere plausible.
 *
 * Validation happens on the split, still-encoded segments and decoding after:
 * an id may legitimately contain a slash (`ord/42` arrives as `ord%2F42`), and
 * checking the decoded value for slashes rejected exactly the ids that were
 * encoded correctly.
 */
export function parseRoute(pathname: string): Route | null {
  const encoded = pathname.split('/').filter(Boolean);
  if (encoded.length < 3 || encoded.length > 5) return null;

  const parts = encoded.map(decodeURIComponent);
  const [pack, jobSlug, screen, recordType, recordId] = parts;

  if (!isSegment(pack) || !isSegment(jobSlug) || !isSegment(screen)) return null;
  const job = SLUG_TO_JOB[jobSlug];
  if (!job) return null;

  if (encoded.length === 3) return { pack, job, screen };
  // A record needs both halves; `/objects/Shipment` alone is not a location.
  if (!isSegment(recordType) || !isSegment(recordId)) return null;
  return { pack, job, screen, record: { type: recordType, id: recordId } };
}

/** Write a Route as a pathname. Round-trips with parseRoute. */
export function formatRoute(route: Route): string {
  const parts = [route.pack, JOB_SLUGS[route.job], route.screen];
  if (route.record) parts.push(route.record.type, route.record.id);
  return '/' + parts.map(encodeURIComponent).join('/');
}

/** Same location? Compared by value, so a no-op navigation adds no history. */
export function sameRoute(a: Route | null, b: Route | null): boolean {
  if (!a || !b) return a === b;
  return formatRoute(a) === formatRoute(b);
}
