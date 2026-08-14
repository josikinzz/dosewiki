import {
  resolveContributorHref,
  resolveContributorReplicationOrder,
  type ContributorDirectory,
} from '@server/contributorDirectory';
import { applyCuratedOrder } from '@server/curatedOrder';
import type { GalleryReplication } from '@/types/replications';
import { hasKnownCreator } from '../components/replicationCredit';

/**
 * Data model for the cross-effect replications gallery: normalization,
 * grouping by artist / effect, intra-group ordering, search, and the curated
 * spotlight selection. Kept framework-free so it stays unit-testable.
 */

export type GalleryMode = 'artist' | 'effect';
export type GalleryTypeFilter = 'all' | 'image' | 'video';
export type GalleryArtistSort = 'count' | 'alpha';

export const UNATTRIBUTED_KEY = '__unattributed__';
export const UNATTRIBUTED_LABEL = 'Unattributed';

/**
 * Curated spotlight. List replication slugs here to feature them at the top of
 * the gallery (in curated order). When empty, the gallery falls back to an
 * automatic selection — see selectSpotlight.
 */
export const FEATURED_REPLICATION_SLUGS: string[] = [];

export interface GalleryGroup {
  /** Stable grouping key (artist key or effect slug). */
  key: string;
  /** Human label for the section header. */
  label: string;
  /** Optional internal link for the header (effect article). */
  href?: string;
  /** Optional external link for the header (artist portfolio). */
  externalUrl?: string;
  count: number;
  imageCount: number;
  videoCount: number;
  items: GalleryReplication[];
}

/** Only items we can actually render (resolved URL) belong in the gallery. */
export function isDisplayable(replication: GalleryReplication): boolean {
  return Boolean(replication.url);
}

/** Canonical key + display name for an artist (folds case / whitespace). */
export function artistIdentity(artist?: string | null): { key: string; label: string } {
  if (!hasKnownCreator(artist)) {
    return { key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL };
  }
  const label = artist!.trim();
  return { key: label.toLowerCase(), label };
}

/**
 * URL segment for the unattributed bucket on /replications/artist/<key>.
 * Distinct from `UNATTRIBUTED_KEY`, which is an in-memory sentinel that never
 * belongs in an address bar.
 */
export const UNKNOWN_ARTIST_URL_KEY = 'unknown';

/**
 * ASCII slug of an artist label: diacritics folded, anything outside
 * [a-z0-9] collapsed to single hyphens. May be empty for degenerate labels
 * (emoji, CJK-only), which callers must handle — see `artistUrlKey`.
 */
function slugifyArtistLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** djb2, base36 — a short stable suffix for labels that do not slugify. */
function stableKeyHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function artistUrlKeyFromIdentity(key: string, label: string): string {
  if (key === UNATTRIBUTED_KEY) {
    return UNKNOWN_ARTIST_URL_KEY;
  }
  const slug = slugifyArtistLabel(label);
  // An empty slug has nothing to say; a named artist whose slug collides with
  // the unattributed bucket's segment ("UnKnown!") must not capture its URL.
  // Both take a stable hashed key derived from the canonical grouping key, so
  // the address survives re-renders, rebuilds, and reorderings of the corpus.
  if (!slug || slug === UNKNOWN_ARTIST_URL_KEY) {
    return `${UNKNOWN_ARTIST_URL_KEY}-${stableKeyHash(key)}`;
  }
  return slug;
}

/**
 * Deterministic URL key for a credit line, addressable as
 * `/replications/artist/<key>`. Derived from `artistIdentity`, so every row
 * that groups together maps to the same key.
 */
export function artistUrlKey(artist?: string | null): string {
  const { key, label } = artistIdentity(artist);
  return artistUrlKeyFromIdentity(key, label);
}

/**
 * URL key for a rendered gallery group: the effect slug in effect mode, the
 * slugified artist key in artist mode. The inverse lookup lives in
 * `resolveGalleryFocus` (src/features/replications/galleryFocus.ts).
 */
export function galleryGroupUrlKey(
  mode: GalleryMode,
  group: Pick<GalleryGroup, 'key' | 'label'>,
): string {
  if (mode === 'effect') {
    return group.key;
  }
  return artistUrlKeyFromIdentity(group.key, group.label);
}

/** Name lookup for effect slugs, humanising a slug with no matching effect. */
export function effectNameLookup(
  effects: readonly { slug: string; name: string }[],
): (slug: string | undefined) => string {
  const map = new Map(effects.map((effect) => [effect.slug, effect.name]));
  // Total in its argument: `effect_slug` is optional on a stored row, and the
  // humanising fallback used to read `.replace` straight off it. The model
  // functions no longer pass a missing slug, but a lookup that throws on one
  // is a trap for the next caller rather than a guard against a bad row.
  return (slug: string | undefined) => (slug ? map.get(slug) ?? slug.replace(/-/g, ' ') : '');
}

/** Effect article href builder, tolerant of a trailing slash on the prefix. */
export function effectHrefBuilder(prefix = '/effects'): (slug: string) => string {
  const base = (prefix || '/effects').replace(/\/$/, '');
  return (slug: string) => `${base}/${slug}`;
}

/** Sort within a group: curated gallery_order first, then newest, then title. */
export function sortWithinGroup(items: GalleryReplication[]): GalleryReplication[] {
  return [...items].sort((a, b) => {
    const ao = a.order_index ?? Number.POSITIVE_INFINITY;
    const bo = b.order_index ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;

    const at = Date.parse(a.created_at ?? '');
    const bt = Date.parse(b.created_at ?? '');
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;

    return a.title.localeCompare(b.title);
  });
}

function tally(items: GalleryReplication[]) {
  let imageCount = 0;
  let videoCount = 0;
  for (const item of items) {
    if (item.type === 'video') videoCount += 1;
    else imageCount += 1;
  }
  return { imageCount, videoCount };
}

export function matchesType(replication: GalleryReplication, filter: GalleryTypeFilter): boolean {
  return filter === 'all' || replication.type === filter;
}

/** Free-text search across artist, effect name, and title. */
export function matchesQuery(
  replication: GalleryReplication,
  query: string,
  effectName: (slug: string) => string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    replication.title,
    replication.artist,
    // `effect_slug` is optional. Handing `undefined` to the lookup crashed the
    // gallery on the reader's first keystroke, and there is no effect name to
    // search for on a row that has no effect — it stays searchable by title and
    // artist. Every stored row today carries an effect, so nothing changes.
    replication.effect_slug ? effectName(replication.effect_slug) : undefined,
    replication.effect_slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * `artist_url` as something safe to render as an outbound link, or `undefined`.
 *
 * The field is a legacy per-row source link and its contents are not uniform:
 * on production three artists carry values that are not URLs at all (`"Josie"`,
 * `"kaylee"`, `reddit.com/u/wheressuede`). Rendered straight into an `href`
 * those resolve *relative to the current page*, so the gallery has been shipping
 * links to `/effects/Josie`. Anything that is not an absolute http(s) URL is
 * dropped rather than linked.
 */
function toExternalArtistUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `contributorDirectory` turns each artist heading into a link to their profile
 * page. It is passed in rather than looked up because this model is pure and
 * runs inside a client component; the directory is read on the server and
 * threaded down. Resolution goes through `resolveContributorHref`, which is the
 * shared alias-aware matcher — the gallery adds no name matching of its own.
 *
 * A credit the directory does not claim simply gets no `href`, and the heading
 * falls back to its external link or to plain text.
 *
 * The marker credits are claimable like any other name. "Various artists",
 * "Midjourney" and "Anonymous" each hold a marker contributor profile, so their
 * sections link to a real page and carry a curatable `replicationOrder`. The
 * unattributed bucket is the one exception below: the rows in it are credited
 * "Unknown" or nothing at all, so there is no name for a profile to claim and
 * no honest page to link a heading reading "Unattributed" to.
 */
export function groupByArtist(
  replications: GalleryReplication[],
  sort: GalleryArtistSort = 'count',
  contributorDirectory: ContributorDirectory = [],
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();

  for (const replication of replications) {
    const { key, label } = artistIdentity(replication.artist);
    let group = buckets.get(key);
    if (!group) {
      group = {
        key,
        label,
        href:
          key === UNATTRIBUTED_KEY
            ? undefined
            : resolveContributorHref(label, contributorDirectory) ?? undefined,
        externalUrl: toExternalArtistUrl(replication.artist_url),
        count: 0,
        imageCount: 0,
        videoCount: 0,
        items: [],
      };
      buckets.set(key, group);
    }
    if (!group.externalUrl) {
      group.externalUrl = toExternalArtistUrl(replication.artist_url);
    }
    group.items.push(replication);
  }

  const groups = Array.from(buckets.values()).map((group) => {
    // A contributor curates their own body of work, so the curation applies to
    // the artist grouping only: it leads their section and the shared
    // newest/title sort carries everything they did not pin. "By effect" keeps
    // the effect's own `gallery_order` (see `sortWithinGroup`) — that is the
    // effect editor's ordering, not the artist's, and the two never mix.
    //
    // The unattributed bucket is skipped rather than looked up: it is keyed by a
    // sentinel and labelled "Unattributed", which is not a credit line anybody
    // is stored under, so a lookup could only ever match a profile that had
    // claimed the word itself. Marker credits are *not* skipped — see above.
    const items = applyCuratedOrder(
      sortWithinGroup(group.items),
      group.key === UNATTRIBUTED_KEY
        ? undefined
        : resolveContributorReplicationOrder(group.label, contributorDirectory),
      (replication) => replication.slug,
    );
    const { imageCount, videoCount } = tally(items);
    return { ...group, items, count: items.length, imageCount, videoCount };
  });

  return groups.sort((a, b) => {
    // Unattributed always sinks to the bottom.
    if (a.key === UNATTRIBUTED_KEY) return 1;
    if (b.key === UNATTRIBUTED_KEY) return -1;
    if (sort === 'alpha') return a.label.localeCompare(b.label);
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export function groupByEffect(
  replications: GalleryReplication[],
  effectName: (slug: string) => string,
  effectHref: (slug: string) => string,
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();

  for (const replication of replications) {
    const slug = replication.effect_slug;

    // "By effect" groups rows by their owning effect, and a row can have none.
    // Such a row gets no bucket rather than one keyed `undefined`, whose header
    // would read the slug back as a name and link to `/effects/undefined`; it
    // stays visible under "By artist", which is a grouping it does belong to.
    // Reading `.replace` off the missing slug used to throw here, taking the
    // whole toggle down. All 247 stored rows carry an effect, so nothing moves.
    if (!slug) {
      continue;
    }

    let group = buckets.get(slug);
    if (!group) {
      group = {
        key: slug,
        label: effectName(slug),
        href: effectHref(slug),
        count: 0,
        imageCount: 0,
        videoCount: 0,
        items: [],
      };
      buckets.set(slug, group);
    }
    group.items.push(replication);
  }

  const groups = Array.from(buckets.values()).map((group) => {
    const items = sortWithinGroup(group.items);
    const { imageCount, videoCount } = tally(items);
    return { ...group, items, count: items.length, imageCount, videoCount };
  });

  return groups.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Curated spotlight, with a graceful fallback before anything is curated:
 * prefer videos and large, attributed pieces so the hero never looks empty.
 */
export function selectSpotlight(
  replications: GalleryReplication[],
  limit = 6,
): GalleryReplication[] {
  const bySlug = new Map(replications.map((replication) => [replication.slug, replication]));

  const curated = FEATURED_REPLICATION_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (replication): replication is GalleryReplication => Boolean(replication),
  );
  if (curated.length >= limit) return curated.slice(0, limit);

  const chosen = new Set(curated.map((replication) => replication.slug));
  const area = (replication: GalleryReplication) =>
    (replication.width ?? 0) * (replication.height ?? 0);

  const fallback = replications
    .filter((replication) => !chosen.has(replication.slug) && Boolean(replication.thumbnail_url || replication.url))
    .sort((a, b) => {
      const aAttr = hasKnownCreator(a.artist) ? 1 : 0;
      const bAttr = hasKnownCreator(b.artist) ? 1 : 0;
      if (aAttr !== bAttr) return bAttr - aAttr;
      const aVid = a.type === 'video' ? 1 : 0;
      const bVid = b.type === 'video' ? 1 : 0;
      if (aVid !== bVid) return bVid - aVid;
      return area(b) - area(a);
    });

  return [...curated, ...fallback].slice(0, limit);
}

export interface GalleryCounts {
  total: number;
  artists: number;
  effects: number;
  images: number;
  videos: number;
}

export function countGallery(replications: GalleryReplication[]): GalleryCounts {
  const artists = new Set<string>();
  const effects = new Set<string>();
  let images = 0;
  let videos = 0;
  for (const replication of replications) {
    artists.add(artistIdentity(replication.artist).key);
    // The header prints this as "N effects". A row with no owning effect would
    // otherwise add `undefined` to the set and claim one effect more than the
    // gallery can actually show.
    if (replication.effect_slug) {
      effects.add(replication.effect_slug);
    }
    if (replication.type === 'video') videos += 1;
    else images += 1;
  }
  return { total: replications.length, artists: artists.size, effects: effects.size, images, videos };
}
