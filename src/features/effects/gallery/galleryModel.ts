import type { ContributorDirectory } from "@server/contributorDirectory";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { applyCuratedOrder } from "@server/curatedOrder";
import type {
  PublicGalleryReplicationPreview,
  ReplicationArtistTypeTag,
  ReplicationContentFamily,
  ReplicationDrugClass,
  ReplicationViewingModeTag,
} from "@/types/replications";
import { hasKnownCreator } from "../components/replicationCredit";
import { replicationMediaRank } from "@/features/replications/mediaRank";
import {
  curatedEffectPosition,
  depictedEffects,
  depictsEffect,
} from "@/types/replications";

/**
 * Data model for the cross-effect replications gallery: normalization,
 * grouping by artist / effect, intra-group ordering, search, and the
 * rail-versus-pool layout split. Kept framework-free so it stays unit-testable.
 *
 * Typed on `PublicGalleryReplicationPreview` — the slim projection the gallery
 * pages serialize — so a raw `GalleryReplication` (a structural superset)
 * works everywhere too.
 */

export type GalleryMode = "artist" | "effect" | "year";
export type GalleryTypeFilter = "all" | "image" | "video" | "audio";
/**
 * A year rail's own key, narrowing the gallery to that rail: `2020`, a merged
 * decade span like `1939-1952`, or `undated`. Not part of the editorial
 * taxonomy: a work's date is a researched fact about the work, not a tag.
 */
export type GalleryYearFilter = "all" | string;
export const UNDATED_YEAR_FILTER = "undated";

/**
 * Which end of time a playlist leads with, and the one exception to it.
 *
 * `newest` and `oldest` are the same axis read in either direction, applied
 * wherever the grouping makes chronology meaningful: inside each playlist
 * under "By artist" and "By effect", and across the year rails themselves
 * under "By year".
 *
 * `curated` exists only for "By effect", where an editor has already chosen
 * what represents the effect (`gallery_order`, reaching this projection as
 * `effect_order_index`). It is that mode's default, so the browse rail opens
 * on the same work as the effect article; naming a direction is an explicit
 * request for a chronological read, and curation yields to it.
 */
export type GalleryOrder = "curated" | "newest" | "oldest";
export type GalleryViewingFilter = "all" | ReplicationViewingModeTag;
export type GalleryArtistTypeFilter = "all" | ReplicationArtistTypeTag;
export type GalleryDrugFilter = "all" | string;
export type GalleryDrugClassFilter = "all" | ReplicationDrugClass;
export type GalleryContentFamilyFilter = "all" | ReplicationContentFamily;
/** Effect slug the work must depict (owning `effect_slug` or an `effect_tags` entry). */
export type GalleryEffectFilter = "all" | string;

export interface GalleryTaxonomyFilterState {
  viewing: GalleryViewingFilter;
  artistType: GalleryArtistTypeFilter;
  effect: GalleryEffectFilter;
  drug: GalleryDrugFilter;
  drugClass: GalleryDrugClassFilter;
  family: GalleryContentFamilyFilter;
}

export const DEFAULT_GALLERY_TAXONOMY_FILTERS: GalleryTaxonomyFilterState = {
  viewing: "all",
  artistType: "all",
  effect: "all",
  drug: "all",
  drugClass: "all",
  family: "all",
};

/**
 * The order a mode uses when the URL names none. "By effect" defers to the
 * editor's curation; the artist and year views are timelines, so they open on
 * the newest work.
 */
export function defaultGalleryOrder(mode: GalleryMode): GalleryOrder {
  return mode === "effect" ? "curated" : "newest";
}

/**
 * Artist rails carry no order control of their own: which rail leads is a
 * hard three-tier sort. Artists dose.wiki has approved as replicators
 * (`approvedReplicator`) lead the page outright; below them any artist with at
 * least one video ranks above every image-only artist; and count then label
 * decides everything within a tier. Video replications are far scarcer than
 * images, so their makers lead the unapproved field.
 *
 * The reader's chronological choice governs the works inside each rail, not
 * which artist they meet first, so the two never competed for one control.
 */

export const UNATTRIBUTED_KEY = "__unattributed__";
export const UNATTRIBUTED_LABEL = "Unattributed";

/**
 * Shared layout constants live here — a plain module — rather than in the
 * "use client" components that consume them, so the server-rendered
 * Replication Index can read the same numbers. Importing a value from a
 * client module into a server component yields a client-reference proxy,
 * not the number.
 */
/** Artist rails revealed per "Show more artists" page. */
export const ARTIST_RAIL_PAGE = 16;
/** Items shown inline in a rail before "View all" takes over. */
export const RAIL_PREVIEW_LIMIT = 14;

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
  audioCount: number;
  /**
   * The artist's claimed profile is an approved replicator: the heading wears
   * the star and the default order lifts the group. Never set on effect groups
   * or the unattributed bucket.
   */
  approvedReplicator?: boolean;
  /**
   * Artist groups only: the Artist Page URL keys of every source-era credit
   * line folded into this group. A claimed profile's group lists each distinct
   * credit it absorbed so a retired handle's address still resolves to it; an
   * unclaimed credit lists only itself.
   */
  creditKeys?: string[];
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
 * Withholding is by owning `effect_slug` alone, never `effect_tags`: what one
 * side withholds must be exactly what the other side still carries. Effect
 * grouping is depicts-based, so a withheld work keeps its place under every
 * effect it depicts while remaining absent from artist browsing.
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
 * videos with a soundtrack, then silent motion, then stills — then the curated
 * rank inside `effectSlug`'s `gallery_order` (the owning effect's when no
 * effect is named), then videos above stills above GIFs (`mediaTier`), then
 * newest researched work date (`workDateMs`) with undated rows sinking below
 * every dated one (newest-ingested first among themselves), then title.
 * Generic so full-fidelity callers (the permalink's neighbour ordering) keep
 * their richer row type through the sort.
 *
 * `effectSlug` matters because a work depicting several effects holds an
 * independent rank in each: sorting an effect's group against the owning
 * effect's rank would rank a tagged-in work by a number from another playlist.
 */
export function sortWithinGroup<
  T extends Pick<
    PublicGalleryReplicationPreview,
    | "title"
    | "type"
    | "format"
    | "created_at"
    | "effect_slug"
    | "effect_order_index"
    | "date_info"
  > & { has_audio?: boolean | null },
>(items: readonly T[], effectSlug?: string): T[] {
  return [...items].sort((a, b) => {
    const arank = replicationMediaRank(a);
    const brank = replicationMediaRank(b);
    if (arank !== brank) return arank - brank;

    const ao = curatedEffectPosition(a, effectSlug) ?? Number.POSITIVE_INFINITY;
    const bo = curatedEffectPosition(b, effectSlug) ?? Number.POSITIVE_INFINITY;
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

/**
 * Chronological order, in either direction, with nothing outranking the date.
 *
 * Deliberately not `sortWithinGroup`. That chain ranks `replicationMediaRank`
 * and `mediaTier` above the date, so a 2020 sounded video preceded a 2026
 * still and a rail read as a media-type grouping rather than a timeline. Media
 * rank and tier are presentation preferences about an effect's curated
 * playlist; a body of work read by date is a timeline.
 *
 * Rows sharing a work date fall to ingest order, then title, so a corpus of
 * year-only dates still lands in a stable, recency-flavoured order rather than
 * an alphabetical one. Both tiebreaks follow the requested direction, so the
 * whole list reads monotonically instead of flipping era order while keeping
 * ties newest-first.
 *
 * Undated rows sink below every dated row in *both* directions. An absent date
 * is not a claim of being old, so "Oldest" must not promote unknown rows to
 * the front; they order among themselves by ingest, in the chosen direction.
 */
export function sortWorksByDate<
  T extends Pick<
    PublicGalleryReplicationPreview,
    "title" | "created_at" | "date_info"
  >,
>(items: readonly T[], direction: "newest" | "oldest" = "newest"): T[] {
  const sign = direction === "oldest" ? -1 : 1;
  return [...items].sort((a, b) => {
    const at = workDateMs(a);
    const bt = workDateMs(b);
    if (at !== null && bt !== null && at !== bt) return (bt - at) * sign;
    if ((at === null) !== (bt === null)) return at === null ? 1 : -1;

    const ac = Date.parse(a.created_at ?? "");
    const bc = Date.parse(b.created_at ?? "");
    if (Number.isFinite(ac) && Number.isFinite(bc) && ac !== bc)
      return (bc - ac) * sign;

    return a.title.localeCompare(b.title);
  });
}

/**
 * The order a group's items take under `order`: the editor's curated playlist,
 * or the timeline in the direction the reader asked for. `effectSlug` names
 * whose curation applies, since a work depicting several effects holds an
 * independent rank in each.
 */
export function orderGroupItems<
  T extends Pick<
    PublicGalleryReplicationPreview,
    | "title"
    | "type"
    | "format"
    | "created_at"
    | "effect_slug"
    | "effect_order_index"
    | "date_info"
  > & { has_audio?: boolean | null },
>(items: readonly T[], order: GalleryOrder, effectSlug?: string): T[] {
  return order === "curated"
    ? sortWithinGroup(items, effectSlug)
    : sortWorksByDate(items, order);
}

/**
 * The group's media split. Counted per kind rather than "video or not": an
 * audio work counted as an image would put a wrong number in the Artist Page's
 * works line, which is the one place this split is read out loud.
 */
function tally(items: PublicGalleryReplicationPreview[]) {
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  for (const item of items) {
    if (item.type === "video") videoCount += 1;
    else if (item.type === "audio") audioCount += 1;
    else imageCount += 1;
  }
  return { imageCount, videoCount, audioCount };
}

export function matchesType(
  replication: PublicGalleryReplicationPreview,
  filter: GalleryTypeFilter,
): boolean {
  return filter === "all" || replication.type === filter;
}

/**
 * Whether a work belongs to a year rail's span. The filter value is a year
 * rail's own key: `2020`, a merged decade span `1939-1952`, or `undated`,
 * which matches exactly the rows `workDateMs` cannot date. This is what a
 * year rail's "View all" narrows to, so the two can never disagree about
 * which works a year holds.
 */
export function matchesYear(
  replication: Pick<PublicGalleryReplicationPreview, "date_info">,
  filter: GalleryYearFilter,
): boolean {
  if (filter === "all") return true;
  const ms = workDateMs(replication);
  if (filter === UNDATED_YEAR_FILTER) return ms === null;
  if (ms === null) return false;
  const year = new Date(ms).getUTCFullYear();
  const [from, to] = filter.split("-");
  const start = Number(from);
  const end = to === undefined ? start : Number(to);
  return year >= start && year <= end;
}

export function matchesTaxonomyFilters(
  replication: PublicGalleryReplicationPreview,
  filters: GalleryTaxonomyFilterState,
): boolean {
  return (
    (filters.viewing === "all" || replication.viewing_mode_tags?.includes(filters.viewing) === true) &&
    (filters.artistType === "all" || replication.artist_type_tags?.includes(filters.artistType) === true) &&
    (filters.effect === "all" || depictsEffect(replication, filters.effect)) &&
    (filters.drug === "all" || replication.title_drugs?.some((drug) => drug.slug === filters.drug) === true) &&
    (filters.drugClass === "all" || replication.drug_classes?.includes(filters.drugClass) === true) &&
    (filters.family === "all" || replication.content_family === filters.family)
  );
}

export function countActiveTaxonomyFilters(filters: GalleryTaxonomyFilterState): number {
  return Object.values(filters).filter((value) => value !== "all").length;
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
 * record in src/features/replications/galleryFocus.ts).
 *
 * A Contributor Profile is the canonical identity. Every credit line it
 * claims — through the shared alias-aware matcher, the gallery adds no name
 * matching of its own — folds into one group headed by the profile's display
 * name, whose slug is the group's address. Individual work `artist` strings
 * are never rewritten: search and provenance still expose the historical
 * handle, and its old Artist Page URL forwards via `creditKeys`. An unclaimed
 * credit line keys and labels itself.
 *
 * `contributorDirectory` is passed in rather than looked up because this
 * model is pure and runs inside a client component; the directory is read on
 * the server and threaded down. Beyond identity it supplies the claiming
 * profile's approved-replicator flag.
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
  contributorDirectory: ContributorDirectory = [],
  order: GalleryOrder = "newest",
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();
  // The claiming profile per bucket key, resolved once per distinct credit
  // line: the matcher is a linear scan of the directory, and a few thousand
  // rows share a few hundred credits.
  const profileByCredit = new Map<string, ContributorDirectory[number] | null>();
  const profileByBucket = new Map<string, ContributorDirectory[number]>();
  // Buckets whose portfolio link came from a credit line spelled as the
  // profile's display name; a retired handle's link never overrides it.
  const canonicalExternalUrl = new Set<string>();

  for (const replication of replications) {
    if (isWithheldFromArtistViews(replication)) {
      continue;
    }
    const credit = artistIdentity(replication.artist);
    let profile = profileByCredit.get(credit.key);
    if (profile === undefined) {
      profile =
        credit.key === UNATTRIBUTED_KEY
          ? null
          : (findContributorProfileByAuthorName(contributorDirectory, credit.label) ?? null);
      profileByCredit.set(credit.key, profile);
    }
    const { key, label } = profile
      ? artistIdentity(profile.displayName)
      : credit;
    const creditKey = artistUrlKeyFromIdentity(credit.key, credit.label);
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
        externalUrl: undefined,
        count: 0,
        imageCount: 0,
        videoCount: 0,
        audioCount: 0,
        creditKeys: [creditKey],
        items: [],
      };
      buckets.set(key, group);
      if (profile) {
        profileByBucket.set(key, profile);
      }
    } else if (!group.creditKeys!.includes(creditKey)) {
      group.creditKeys!.push(creditKey);
    }
    const externalUrl = toExternalArtistUrl(replication.artist_url);
    if (externalUrl) {
      const canonical = credit.key === key;
      if (!group.externalUrl || (canonical && !canonicalExternalUrl.has(key))) {
        group.externalUrl = externalUrl;
      }
      if (canonical) {
        canonicalExternalUrl.add(key);
      }
    }
    group.items.push(replication);
  }

  const groups = Array.from(buckets.values()).map((group) => {
    // The unattributed bucket has no contributor owner, so it carries no
    // endorsement.
    const profile = profileByBucket.get(group.key);
    // A rail is a timeline: the date decides, in the direction the reader
    // chose, and nothing outranks it — not the audio-first media rank, not the
    // media tier, and not a stored `replicationOrder` prefix. An artist has no
    // curated playlist, so `curated` reads as the default `newest` here.
    const items = sortWorksByDate(
      group.items,
      order === "oldest" ? "oldest" : "newest",
    );
    const { imageCount, videoCount, audioCount } = tally(items);
    return {
      ...group,
      items,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      ...(profile?.approvedReplicator === true ? { approvedReplicator: true } : {}),
    };
  });

  return groups.sort((a, b) => {
    // Unattributed always sinks to the bottom.
    if (a.key === UNATTRIBUTED_KEY) return 1;
    if (b.key === UNATTRIBUTED_KEY) return -1;
    // Hard tiers: approved replicators above everyone, then video-having
    // artists above image-only artists; count then label decides everything
    // within a tier.
    const approved =
      Number(b.approvedReplicator === true) - Number(a.approvedReplicator === true);
    if (approved !== 0) return approved;
    const tier = Number(b.videoCount > 0) - Number(a.videoCount > 0);
    if (tier !== 0) return tier;
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

/**
 * The subset of `contributorDirectory` that `groupByArtist` can actually
 * consult for these works: one entry per claiming profile of a credit line
 * present in `replications`.
 *
 * The complete directory carries one entry per credited artist in the whole
 * corpus — a few thousand rows, and on production the largest single thing in
 * the gallery index's RSC payload. The prerendered rails show a couple of
 * dozen artists, so the initial render needs a couple of dozen entries; the
 * rest only become reachable once the explorer has fetched the complete
 * corpus, which now carries the complete directory alongside it.
 *
 * Resolution mirrors `groupByArtist` exactly — same withheld filter, same
 * unattributed exclusion, same alias-aware matcher — so grouping the same
 * works against the pruned directory produces identical groups.
 */
export function selectContributorDirectoryForWorks(
  replications: PublicGalleryReplicationPreview[],
  contributorDirectory: ContributorDirectory,
): ContributorDirectory {
  const claimedKeys = new Set<string>();
  const resolvedCredits = new Set<string>();
  for (const replication of replications) {
    if (isWithheldFromArtistViews(replication)) continue;
    const credit = artistIdentity(replication.artist);
    if (credit.key === UNATTRIBUTED_KEY || resolvedCredits.has(credit.key)) {
      continue;
    }
    resolvedCredits.add(credit.key);
    const profile = findContributorProfileByAuthorName(
      contributorDirectory,
      credit.label,
    );
    if (profile) claimedKeys.add(profile.key);
  }
  return contributorDirectory.filter((entry) => claimedKeys.has(entry.key));
}

/**
 * An effect group's editorial prefix: the slugs it holds that carry a position
 * in *this* effect's `gallery_order`, in that order. Undefined when the
 * effect has curated nothing, which leaves the automatic sort untouched.
 */
function curatedPrefixOf(group: GalleryGroup): string[] | undefined {
  const curated = group.items
    .map((item) => ({
      slug: item.slug,
      position: curatedEffectPosition(item, group.key),
    }))
    .filter(
      (entry): entry is { slug: string; position: number } =>
        entry.position !== undefined,
    )
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.slug);
  return curated.length ? curated : undefined;
}

/**
 * "By effect" browse groups, one per effect any visible work depicts.
 *
 * Membership is `depictsEffect`, the same union the effect article's own
 * collection uses: a work owned by `chromatic-aberration` and tagged
 * `colour-enhancement` belongs to both playlists, so it appears in both
 * groups. Bucketing on the owning `effect_slug` alone made the browse rail a
 * strict subset of the article it links to, which is why 13 effects opened on
 * a work that was not their curated first pick: the pick lived in another
 * bucket entirely. A work therefore appears in as many groups as it depicts
 * effects, exactly as it appears in as many effect articles.
 */
export function groupByEffect(
  replications: PublicGalleryReplicationPreview[],
  effectName: (slug: string) => string,
  effectHref: (slug: string) => string | undefined,
  order: GalleryOrder = "curated",
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();

  for (const replication of replications) {
    // A row can depict nothing at all. It gets no bucket rather than one keyed
    // `undefined`, whose header would read the slug back as a name and link to
    // `/effects/undefined`; it stays visible under "By artist", which is a
    // grouping it does belong to. Reading `.replace` off the missing slug used
    // to throw here, taking the whole toggle down.
    for (const slug of depictedEffects(replication)) {
      let group = buckets.get(slug);
      if (!group) {
        group = {
          key: slug,
          label: effectName(slug),
          href: effectHref(slug),
          count: 0,
          imageCount: 0,
          videoCount: 0,
          audioCount: 0,
          items: [],
        };
        buckets.set(slug, group);
      }
      group.items.push(replication);
    }
  }

  const groups = Array.from(buckets.values()).map((group) => {
    // Under `curated` the effect's stored `gallery_order` reaches this
    // projection as each row's `effect_order_index` (the array itself never
    // leaves Convex), so rebuild the editor's prefix from this effect's own
    // positions and apply it the way `groupByArtist` applies a claimed
    // contributor's stored order: curation is authoritative across media
    // ranks. Ranking it inside `sortWithinGroup` instead confines the prefix
    // to one audio-first media-rank bucket, so any uncurated sounded video
    // outranks the editor's chosen opener and the browse rail contradicts the
    // effect article's own showcase.
    //
    // Naming a direction retires the prefix entirely for as long as it is
    // named. A reader asking for the oldest work has asked past the editor's
    // pick, and a curated prefix that survived would leave the front of the
    // rail out of chronological order while claiming to be sorted by date.
    const items =
      order === "curated"
        ? applyCuratedOrder(
            sortWithinGroup(group.items, group.key),
            curatedPrefixOf(group),
            (replication) => replication.slug,
          )
        : sortWorksByDate(group.items, order);
    const { imageCount, videoCount, audioCount } = tally(items);
    return { ...group, items, count: items.length, imageCount, videoCount, audioCount };
  });

  return groups.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export const UNDATED_YEAR_LABEL = "Undated";

/**
 * "By year" browse groups: the archive as a timeline, one rail per year while
 * the corpus is dense enough to fill one, then one rail per decade once it
 * thins out.
 *
 * Granularity is derived from the data, never hardcoded. Walking back from the
 * newest year, every year that carries at least `MIN_RAIL_SIZE` works gets its
 * own rail; the first year too thin to fill one ends the per-year run, and
 * everything older buckets by decade. Production runs 2026 back to 2009 as
 * year rails (2008 holds two works and breaks the run), then decade rails into
 * the 1930s. A fixed cutoff would rot as the deep tail grows; this one moves
 * with it.
 *
 * Decade rails are labelled by the span they actually hold ("2000–2008", not
 * "2000s", which would overclaim a decade whose 2009 is a rail of its own).
 * A decade still too thin for a rail merges into the next decade up, so the
 * oldest works keep a dated home instead of dropping into the undated pool:
 * two 1952 works and one from 1939 read as a single "1939–1952" rail.
 *
 * Undated rows group last in both directions. An absent date is not a claim
 * of being old, so "Oldest" must not open the page on unknown work.
 */
export function groupByYear(
  replications: PublicGalleryReplicationPreview[],
  order: GalleryOrder = "newest",
): GalleryGroup[] {
  const direction = order === "oldest" ? "oldest" : "newest";
  const byYear = new Map<number, PublicGalleryReplicationPreview[]>();
  const undated: PublicGalleryReplicationPreview[] = [];

  for (const replication of replications) {
    const ms = workDateMs(replication);
    if (ms === null) {
      undated.push(replication);
      continue;
    }
    const year = new Date(ms).getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(replication);
    else byYear.set(year, [replication]);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  // The newest unbroken run of years dense enough to each fill a rail.
  let perYearFloor = Number.POSITIVE_INFINITY;
  for (const year of years) {
    if ((byYear.get(year) ?? []).length < MIN_RAIL_SIZE) break;
    perYearFloor = year;
  }

  const buckets: Array<{ items: PublicGalleryReplicationPreview[]; years: number[] }> = [];
  // Oldest first while merging, so a decade too thin to stand alone folds
  // forward into the next one up rather than stranding the archive's tail.
  let carried: { items: PublicGalleryReplicationPreview[]; years: number[] } | null = null;
  for (const year of [...years].reverse()) {
    const items = byYear.get(year) ?? [];
    if (year >= perYearFloor) {
      if (carried) {
        buckets.push(carried);
        carried = null;
      }
      buckets.push({ items, years: [year] });
      continue;
    }
    const decade = Math.floor(year / 10) * 10;
    const sameDecade =
      carried !== null && Math.floor(carried.years[0] / 10) * 10 === decade;
    if (carried && (sameDecade || carried.items.length < MIN_RAIL_SIZE)) {
      carried.items.push(...items);
      carried.years.push(year);
    } else {
      if (carried) buckets.push(carried);
      carried = { items: [...items], years: [year] };
    }
  }
  if (carried) buckets.push(carried);

  const groups: GalleryGroup[] = buckets.map((bucket) => {
    const span = [...bucket.years].sort((a, b) => a - b);
    const first = span[0];
    const last = span[span.length - 1];
    const items = sortWorksByDate(bucket.items, direction);
    const { imageCount, videoCount, audioCount } = tally(items);
    return {
      key: first === last ? `${first}` : `${first}-${last}`,
      // En dash: a span, not a subtraction.
      label: first === last ? `${first}` : `${first}\u2013${last}`,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      items,
    };
  });

  const spanStart = (group: GalleryGroup) => Number(group.key.split("-")[0]);
  const spanEnd = (group: GalleryGroup) => {
    const parts = group.key.split("-");
    return Number(parts[parts.length - 1]);
  };
  groups.sort((a, b) =>
    direction === "oldest" ? spanStart(a) - spanStart(b) : spanEnd(b) - spanEnd(a),
  );

  if (undated.length) {
    const items = sortWorksByDate(undated, direction);
    const { imageCount, videoCount, audioCount } = tally(items);
    groups.push({
      key: UNDATED_YEAR_FILTER,
      label: UNDATED_YEAR_LABEL,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      items,
    });
  }

  return groups;
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
    // The header prints this as "N effects", and "By effect" now renders one
    // group per depicted effect, so count the same union. A row that depicts
    // nothing contributes none rather than adding `undefined` and claiming one
    // effect more than the gallery can show.
    for (const slug of depictedEffects(replication)) {
      effects.add(slug);
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
