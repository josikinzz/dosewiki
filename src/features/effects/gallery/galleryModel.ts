import {
  resolveContributorReplicationOrder,
  type ContributorDirectory,
} from "@server/contributorDirectory";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { applyCuratedOrder } from "@server/curatedOrder";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { hasKnownCreator } from "../components/replicationCredit";
import {
  replicationMediaRank,
  sortByMediaRank,
} from "@/features/replications/mediaRank";

/**
 * Data model for the cross-effect replications gallery: normalization,
 * grouping by artist / effect, intra-group ordering, search, and the
 * rail-versus-pool layout split. Kept framework-free so it stays unit-testable.
 *
 * Typed on `PublicGalleryReplicationPreview` — the slim projection the gallery
 * pages serialize — so a raw `GalleryReplication` (a structural superset)
 * works everywhere too.
 */

export type GalleryMode = "artist" | "effect";
export type GalleryTypeFilter = "all" | "image" | "video";
export type GalleryArtistSort = "video-first" | "count" | "alpha";

/**
 * The gallery's default artist order: a hard two-tier sort where any artist
 * with at least one video ranks above every image-only artist, and the old
 * count-then-alpha default applies within each tier. Video replications are
 * far scarcer than images, so their makers lead the page.
 */
export const DEFAULT_GALLERY_ARTIST_SORT: GalleryArtistSort = "video-first";

export const UNATTRIBUTED_KEY = "__unattributed__";
export const UNATTRIBUTED_LABEL = "Unattributed";

export interface GalleryGroup {
  /** Stable grouping key (artist key or effect slug). */
  key: string;
  /** Human label for the section header. */
  label: string;
  /** Internal link for the header: the Artist Page or the effect article. Absent only for the unattributed bucket. */
  href?: string;
  /** Optional external link for the header (artist portfolio). */
  externalUrl?: string;
  count: number;
  imageCount: number;
  videoCount: number;
  items: PublicGalleryReplicationPreview[];
}

/** Only items we can actually render (resolved URL) belong in the gallery. */
export function isDisplayable(
  replication: PublicGalleryReplicationPreview,
): boolean {
  return Boolean(replication.url);
}

/**
 * Effects whose works are withheld from artist-oriented browsing.
 *
 * This is a browsing-presentation choice, not an unpublication — the same
 * distinction `dropGalleryExcludedArtistWorks` draws for an opted-out
 * contributor. A withheld work keeps its place under "By effect", in the
 * effect article's own section, on its permalink, and in the public API.
 * Nothing here takes anything down.
 *
 * The asymmetry is the point. An artist's body of work is browsed casually:
 * you open a rail, the expanded viewer, or a profile to see what someone makes, and
 * you take whatever the next tile happens to be. An effect is sought
 * deliberately: you arrive at "unspeakable horrors" having asked for it by
 * name. Renderings of that effect belong to the reader who went looking, not
 * to the reader idly paging past an artist.
 *
 * Membership is by owning `effect_slug` alone, never `effect_tags`: what one
 * side withholds must be exactly what the other side still carries, and
 * effect grouping buckets on `effect_slug`.
 */
export const ARTIST_VIEW_WITHHELD_EFFECT_SLUGS: ReadonlySet<string> = new Set([
  "unspeakable-horrors",
]);

/**
 * Whether this work is withheld from artist rails, decks, and profiles.
 *
 * Typed on the owning slug alone rather than on a whole preview row:
 * the sitemap's route plan carries a narrower row than the gallery does, and
 * the rule must be stated once, not restated per row shape.
 */
export function isWithheldFromArtistViews(
  replication: Pick<PublicGalleryReplicationPreview, "effect_slug">,
): boolean {
  const slug = replication.effect_slug;
  return slug !== undefined && ARTIST_VIEW_WITHHELD_EFFECT_SLUGS.has(slug);
}

/** Canonical key + display name for an artist (folds case / whitespace). */
export function artistIdentity(artist?: string | null): {
  key: string;
  label: string;
} {
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
export const UNKNOWN_ARTIST_URL_KEY = "unknown";

/**
 * ASCII slug of an artist label: diacritics folded, anything outside
 * [a-z0-9] collapsed to single hyphens. May be empty for degenerate labels
 * (emoji, CJK-only), which callers must handle — see `artistUrlKey`.
 */
function slugifyArtistLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  group: Pick<GalleryGroup, "key" | "label">,
): string {
  if (mode === "effect") {
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
  return (slug: string | undefined) =>
    slug ? (map.get(slug) ?? slug.replace(/-/g, " ")) : "";
}

/** Effect article href builder, tolerant of a trailing slash on the prefix. */
export function effectHrefBuilder(
  prefix = "/effects",
  linkableEffectSlugs?: ReadonlySet<string>,
): (slug: string) => string | undefined {
  const base = (prefix || "/effects").replace(/\/$/, "");
  return (slug: string) =>
    !linkableEffectSlugs || linkableEffectSlugs.has(slug)
      ? `${base}/${slug}`
      : undefined;
}

/** First date-ish token in a `date_info.value`: year, year-month, or full date. */
const WORK_DATE_TOKEN = /\d{4}(?:-\d{2}){0,2}/;

/**
 * Researched work date in epoch ms, or null when the row has none: the first
 * year / year-month / full-date token in `date_info.value` (year-only parses
 * as Jan 1 UTC, so "on or before 2024-04-08T04:45:05Z" resolves to
 * 2024-04-08). A `kind` of 'unknown', a missing `date_info`, or an
 * unparseable value is null — the sort sinks such rows below every dated one
 * rather than guessing from the ingest timestamp.
 */
export function workDateMs(
  row: Pick<PublicGalleryReplicationPreview, "date_info">,
): number | null {
  const info = row.date_info;
  if (!info || info.kind === "unknown" || !info.value) return null;
  const token = WORK_DATE_TOKEN.exec(info.value)?.[0];
  if (!token) return null;
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Presentation tier of a work: videos lead, GIFs trail, every other still sits
 * between. A GIF is a short loop like a video but renders as a heavy,
 * low-fidelity image, so it neither belongs with the videos it imitates nor
 * ahead of the crisp stills it degrades next to.
 */
function mediaTier(
  row: Pick<PublicGalleryReplicationPreview, "type" | "format">,
): number {
  if (row.type === "video") return 0;
  return row.format?.toLowerCase() === "gif" ? 2 : 1;
}

/**
 * Sort within a group: audio-first media rank (`replicationMediaRank`) leads —
 * videos with a soundtrack, then silent motion, then stills — then curated
 * gallery_order, then videos above stills above GIFs (`mediaTier`), then
 * newest researched work date (`workDateMs`) with undated rows sinking below
 * every dated one (newest-ingested first among themselves), then title.
 * Generic so full-fidelity callers (the permalink's neighbour ordering) keep
 * their richer row type through the sort.
 */
export function sortWithinGroup<
  T extends Pick<
    PublicGalleryReplicationPreview,
    "title" | "type" | "format" | "created_at" | "order_index" | "date_info"
  > & { has_audio?: boolean | null },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const arank = replicationMediaRank(a);
    const brank = replicationMediaRank(b);
    if (arank !== brank) return arank - brank;

    const ao = a.order_index ?? Number.POSITIVE_INFINITY;
    const bo = b.order_index ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;

    const atier = mediaTier(a);
    const btier = mediaTier(b);
    if (atier !== btier) return atier - btier;

    const at = workDateMs(a);
    const bt = workDateMs(b);
    if (at !== null && bt !== null && at !== bt) return bt - at;
    if ((at === null) !== (bt === null)) return at === null ? 1 : -1;
    if (at === null && bt === null) {
      const ac = Date.parse(a.created_at ?? "");
      const bc = Date.parse(b.created_at ?? "");
      if (Number.isFinite(ac) && Number.isFinite(bc) && ac !== bc)
        return bc - ac;
    }

    return a.title.localeCompare(b.title);
  });
}

function tally(items: PublicGalleryReplicationPreview[]) {
  let imageCount = 0;
  let videoCount = 0;
  for (const item of items) {
    if (item.type === "video") videoCount += 1;
    else imageCount += 1;
  }
  return { imageCount, videoCount };
}

export function matchesType(
  replication: PublicGalleryReplicationPreview,
  filter: GalleryTypeFilter,
): boolean {
  return filter === "all" || replication.type === filter;
}

/** Free-text search across artist, effect name, and title. */
export function matchesQuery(
  replication: PublicGalleryReplicationPreview,
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
    .join(" ")
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
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every attributed artist heading links to their Artist Page — the one public
 * surface per credited artist (/replications/artist/<key>, see the decision
 * record in src/features/replications/galleryFocus.ts). The key derives from
 * the credit line itself, so no directory lookup decides where a name goes.
 *
 * `contributorDirectory` still travels here for the contributor's curated
 * `replicationOrder`: it is passed in rather than looked up because this model
 * is pure and runs inside a client component; the directory is read on the
 * server and threaded down. Resolution goes through the shared alias-aware
 * matcher — the gallery adds no name matching of its own.
 *
 * The unattributed bucket is the one heading with no `href`: its page exists
 * (the `unknown` key), but the rows in it are credited "Unknown", "Anonymous"
 * or nothing at all, and none of those names a creator, so a heading reading
 * "Unattributed" claims no identity and falls back to plain text. ("Anonymous"
 * does hold a marker profile, but its works fold into this bucket — see
 * `hasKnownCreator` — so no section ever carries that name here.)
 *
 * Works of a withheld effect never reach this grouping — see
 * `isWithheldFromArtistViews`. Filtering here rather than at each call site is
 * what keeps the gallery's artist mode, expanded viewer, and every
 * `/replications/artist/<key>` page saying the same thing: an artist left
 * holding nothing has no group, so they have no rail, viewer group, or page
 * (`resolveGalleryFocus` finds no group and the route 404s).
 */
export function groupByArtist(
  replications: PublicGalleryReplicationPreview[],
  sort: GalleryArtistSort = DEFAULT_GALLERY_ARTIST_SORT,
  contributorDirectory: ContributorDirectory = [],
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();

  for (const replication of replications) {
    if (isWithheldFromArtistViews(replication)) {
      continue;
    }
    const { key, label } = artistIdentity(replication.artist);
    let group = buckets.get(key);
    if (!group) {
      group = {
        key,
        label,
        href:
          key === UNATTRIBUTED_KEY
            ? undefined
            : getPublicRoutePath({
                family: "replicationArtist",
                params: { key: artistUrlKeyFromIdentity(key, label) },
              }),
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
    // Either way the audio-first media rank stays primary: the curation
    // reorders works within a rank, never a still above a sounded video.
    //
    // The unattributed bucket is skipped rather than looked up: it is keyed by a
    // sentinel and labelled "Unattributed", which is not a credit line anybody
    // is stored under, so a lookup could only ever match a profile that had
    // claimed the word itself. Marker credits are *not* skipped — see above.
    const items = sortByMediaRank(
      applyCuratedOrder(
        sortWithinGroup(group.items),
        group.key === UNATTRIBUTED_KEY
          ? undefined
          : resolveContributorReplicationOrder(group.label, contributorDirectory),
        (replication) => replication.slug,
      ),
      (replication) => replication,
    );
    const { imageCount, videoCount } = tally(items);
    return { ...group, items, count: items.length, imageCount, videoCount };
  });

  return groups.sort((a, b) => {
    // Unattributed always sinks to the bottom.
    if (a.key === UNATTRIBUTED_KEY) return 1;
    if (b.key === UNATTRIBUTED_KEY) return -1;
    if (sort === "alpha") return a.label.localeCompare(b.label);
    if (sort === "video-first") {
      // Hard tier: video-having artists above image-only artists; the plain
      // count order decides everything within a tier.
      const tier = Number(b.videoCount > 0) - Number(a.videoCount > 0);
      if (tier !== 0) return tier;
    }
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export function groupByEffect(
  replications: PublicGalleryReplicationPreview[],
  effectName: (slug: string) => string,
  effectHref: (slug: string) => string | undefined,
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
 * Hybrid browse layout: a group earns its own horizontal rail only when it
 * carries at least `minRailSize` works; thinner groups pool into one dense
 * masonry tail so a two-work artist costs two tiles, not a whole row. Order
 * is preserved on both sides, so the pool inherits the corpus ordering
 * (count desc, then label — unattributed last in artist mode).
 */
export const MIN_RAIL_SIZE = 3;

export function splitRailsAndPool(
  groups: GalleryGroup[],
  minRailSize: number = MIN_RAIL_SIZE,
): { rails: GalleryGroup[]; pool: GalleryGroup[] } {
  const rails: GalleryGroup[] = [];
  const pool: GalleryGroup[] = [];
  for (const group of groups) {
    (group.count >= minRailSize ? rails : pool).push(group);
  }
  return { rails, pool };
}

export interface GalleryCounts {
  total: number;
  artists: number;
  effects: number;
  images: number;
  videos: number;
}

export function countGallery(
  replications: PublicGalleryReplicationPreview[],
): GalleryCounts {
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
    if (replication.type === "video") videos += 1;
    else images += 1;
  }
  return {
    total: replications.length,
    artists: artists.size,
    effects: effects.size,
    images,
    videos,
  };
}
