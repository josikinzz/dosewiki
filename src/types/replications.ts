/**
 * TypeScript types for replications (videos and images of effects).
 */

/**
 * Media kind of a stored row. `audio` joined `video`/`image` when audio assets
 * needed somewhere to live; widening the union is additive and leaves every
 * existing `'video' | 'image'` comparison meaning what it already meant.
 */
export type ReplicationType = "video" | "image" | "audio";

/**
 * What a stored row *is*, as opposed to what it depicts.
 *
 * `'replication'` — an artist's rendition of a subjective effect. The gallery,
 * the artist credits, and the /effects surfaces all mean this.
 *
 * `'figure'` — an explanatory asset stored, credited, and rights-tracked exactly
 * the same way but which is nobody's rendition of an experience: ECG/EEG traces,
 * Bristol stool charts, vertebral-column diagrams, molecule figures. It belongs
 * in the media store so its rights travel with it; it is not a replication.
 */
export type MediaRole = "replication" | "figure";

export type ReplicationStatus =
  | "replication"
  | "not-replication"
  | "unclear"
  | "unreviewed"
  | "source-corrupt";

export type ReplicationPublicationState = "published" | "duplicate-suppressed";

type ReplicationViewingMode =
  | "open-eye"
  | "closed-eye"
  | "mixed"
  | "uncertain";

export type ReplicationViewingModeTag = "open-eye" | "closed-eye";
export type ReplicationDrugClass =
  | "psychedelics"
  | "dissociatives"
  | "deliriants"
  | "other";
export interface ReplicationTitleDrug {
  slug: string;
  name: string;
  class: ReplicationDrugClass;
  matched_title_text: string;
}
export type ReplicationContentFamily =
  | "experiential-replication"
  | "visionary-psychedelic-art"
  | "traditional-cultural-art"
  | "dark-surrealism"
  | "optical-perceptual-art"
  | "generative-abstract-art"
  | "effect-illustration"
  | "explanatory-figure"
  | "uncertain";
type ReplicationArtistPrimaryType =
  | "replicator"
  | "traditional-psychedelic-artist"
  | "mixed"
  | "other"
  | "uncertain";
export type ReplicationArtistTypeTag =
  | "replicator"
  | "traditional-psychedelic-artist";

export interface PublicReplicationArtistTaxonomy {
  key: string;
  primary_type: ReplicationArtistPrimaryType;
  artist_type_tags: ReplicationArtistTypeTag[];
}

/**
 * Read a row's role, applying the stored default.
 *
 * The column is optional so the rows that predate it stay correct without a
 * backfill: every one of them is a replication, and an absent `role` says so.
 * Use this rather than comparing `row.role` directly, so that default is stated
 * once instead of once per consumer.
 */
function mediaRole(row: { role?: MediaRole }): MediaRole {
  return row.role ?? "replication";
}

/** Whether a stored row should be counted and shown as a replication. */
function isReplicationRow(row: { role?: MediaRole }): boolean {
  return mediaRole(row) === "replication";
}

/**
 * The media kinds a replication surface can actually present today.
 *
 * `audio` joined `image` and `video` once a surface could draw it: the effect
 * article's Audio Replications section, the `/replications/audio` index, and
 * the permalink all render an audio row through `AudioReplicationPlayer`, the
 * transport that already served the inline `subjectiveEffects.audio_replications`
 * clips. Rights posture for those rows follows the publication rights policy
 * recorded in the media review repo
 * (`Data/publication-rights-policy-2026-09-11.json`, ledger t72/t16); nothing
 * in this module decides it.
 *
 * The effect *article* carousel still drops audio, and deliberately: those
 * articles present the same clips through their own `AudioReplicationCard`
 * section, so publishing them into the carousel too would show one clip twice
 * on one page. That is a per-surface presentation choice, made in
 * `showcaseModel` through {@link isVisualReplication}, not a publication
 * decision, which is why it does not live here.
 *
 * Keyed membership rather than an `!== 'audio'` comparison, so a kind added to
 * the union later is withheld until a surface can present it. `strictNullChecks`
 * is off in both tsconfigs, so a row is not proof of its own shape; an absent or
 * unrecognised `type` is not in the table and is withheld too.
 */
const PRESENTABLE_REPLICATION_TYPES: Partial<Record<ReplicationType, true>> = {
  image: true,
  video: true,
  audio: true,
};

/** The media kinds a *frame* surface can draw: a poster, a tile, a still. */
const VISUAL_REPLICATION_TYPES: Partial<Record<ReplicationType, true>> = {
  image: true,
  video: true,
};

/**
 * Whether the public replication surfaces may publish a stored row.
 *
 * Three independent reasons to withhold one, answered in a single place so a new
 * surface cannot pick up half the rule:
 *
 *  - it is a figure rather than a replication. A diagram is credited and
 *    rights-tracked in the same table, but every surface that would show it
 *    asserts something untrue about it: the permalink emits JSON-LD reading
 *    "A replication of the subjective effect X", the gallery counts it as a work
 *    by its credited artist, and the sitemap offers that page to crawlers.
 *  - it is a media kind nothing can present yet (see above).
 *  - it is a confirmed duplicate whose provenance and media remain stored but
 *    whose public route is consolidated into a designated keeper.
 *
 * This is a *publication* gate and not a data gate. `server/replications.ts`
 * keeps returning every stored row, so the rights and provenance tooling under
 * `scripts/replications/` still audits figures — which is exactly where an asset
 * whose rights travel with it most needs to stay visible — and a future
 * article-figure gallery reads the same rows through a helper of its own.
 *
 * It is also not a *drawability* gate. A published row still has to reach a
 * surface that can render its kind: frame surfaces narrow further with
 * {@link isVisualReplication}, and the audio surfaces select `type === 'audio'`
 * directly. An open-coded `type === 'image' || type === 'video'` in a new frame
 * surface is a second convention and will drift from this table.
 */
export function isPublishableReplication(row: {
  role?: MediaRole;
  type: ReplicationType;
  replication_status?: ReplicationStatus;
  publication_state?: ReplicationPublicationState;
}): boolean {
  return (
    isReplicationRow(row) &&
    row.publication_state !== "duplicate-suppressed" &&
    row.replication_status !== "not-replication" &&
    PRESENTABLE_REPLICATION_TYPES[row.type] === true
  );
}

/** An exact publisher assignment, not an inferred ancestor or related effect. */
export function depictsEffect(
  row: { effect_slug?: string; effect_tags?: readonly string[] },
  effectSlug: string,
): boolean {
  return row.effect_slug === effectSlug || row.effect_tags?.includes(effectSlug) === true;
}

/**
 * Every effect a work depicts: its owning `effect_slug` plus each explicit
 * `effect_tags` entry. The set `depictsEffect` answers, enumerated — an
 * effect's playlist carries every work that depicts it, so effect grouping
 * places a work in each of these.
 */
export function depictedEffects(row: {
  effect_slug?: string;
  effect_tags?: readonly string[];
}): string[] {
  const slugs = new Set<string>();
  if (row.effect_slug) slugs.add(row.effect_slug);
  for (const tag of row.effect_tags ?? []) slugs.add(tag);
  return [...slugs];
}

/**
 * A work's position within one effect's curated `gallery_order`, or
 * `undefined` when that effect never curated it.
 *
 * Per-effect rather than a single number because the same work holds an
 * independent rank in every playlist it belongs to: position 0 of
 * `colour-enhancement` can be position 55 of its owning
 * `chromatic-aberration`. Omitting `effectSlug` asks for the owning effect's
 * rank, which is the only meaningful answer outside an effect-grouped view.
 */
export function curatedEffectPosition(
  row: {
    effect_slug?: string;
    effect_order_index?: Readonly<Record<string, number>>;
  },
  effectSlug?: string,
): number | undefined {
  const key = effectSlug ?? row.effect_slug;
  return key === undefined ? undefined : row.effect_order_index?.[key];
}

/**
 * Narrow a publishable row to the kinds a frame surface can draw.
 *
 * Tiles, rails, carousels, the immersive viewer and the permalink preview are
 * all built around a poster image; handing them an audio row would render
 * `<AppImage src="….mp3">` beneath a pill reading "Image". They filter with
 * this rather than restating the kinds, so widening
 * {@link PRESENTABLE_REPLICATION_TYPES} again cannot silently leak a kind into
 * a frame.
 */
export function isVisualReplication<T extends { type: ReplicationType }>(
  row: T,
): row is T & { type: "image" | "video" } {
  return VISUAL_REPLICATION_TYPES[row.type] === true;
}

/**
 * Replication rights status. Replication media is separate from dose.wiki's
 * CC0 article dataset unless an individual item says otherwise.
 */
type ReplicationRightsStatus =
  | "creator-retained"
  | "explicit-license"
  | "unknown"
  | "permission-granted"
  | "public-domain";

interface ReplicationRightsMetadata {
  rights_status?: ReplicationRightsStatus;
  license_name?: string;
  license_url?: string;
  credit_line?: string;
  source_url?: string;
  rightsholder?: string;
  permission_notes?: string;
  removal_contact?: string;
}

export type ReplicationDateKind =
  | "exact_date"
  | "year"
  | "range"
  | "upper_bound"
  | "inferred"
  | "unknown";

type ReplicationDateConfidence =
  | "high"
  | "medium-high"
  | "medium"
  | "medium-low"
  | "low"
  | "none";

/**
 * Best defensible temporal statement for a replication — when the work was
 * actually made, as opposed to when it was ingested (`created_at`).
 * `event_type` explains what the value dates; it may be creation, first
 * publication, or only an earliest-known/source-file bound. `value` shapes
 * vary by `kind`: an ISO date ("2014-09-23"), a bare year ("1981"), or prose
 * like "on or before 2024-04-08T04:45:05Z". Resolve it through `workDateMs`
 * (src/features/effects/gallery/galleryModel.ts) rather than parsing ad hoc.
 */
export interface ReplicationDateInfo {
  value?: string;
  kind: ReplicationDateKind;
  event_type?: string;
  confidence: ReplicationDateConfidence;
  researched_at: string;
}

/**
 * Raw replication record from Postgres database.
 */
interface ReplicationRecord extends ReplicationRightsMetadata {
  _id: string;
  _creationTime: number;
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  /** Absent means `'replication'`. Read it through {@link mediaRole}. */
  role?: MediaRole;
  /** Absent means published; duplicate suppression is reversible metadata. */
  publication_state?: ReplicationPublicationState;
  duplicate_of_replication_id?: string;
  duplicate_evidence_digest?: string;
  duplicate_operation_id?: string;
  duplicate_suppressed_at?: number;
  type: ReplicationType;
  storage_id?: string;
  /**
   * Owning effect, when there is one. Assets without an owner can still carry
   * explicit depicted-effect tags; figures and page heroes often have neither.
   */
  effect_slug?: string;
  /**
   * Explicit additional depicted-effect identities, not ancestors. The gallery
   * filter, effect article collection and public API all read these assignments.
   */
  effect_tags?: string[];
  /** SHA-256 of the immutable acquisition source, when recorded at intake. */
  source_sha256?: string;
  replication_status?: ReplicationStatus;
  viewing_mode?: ReplicationViewingMode;
  viewing_mode_tags?: ReplicationViewingModeTag[];
  title_drugs?: ReplicationTitleDrug[];
  drug_classes?: ReplicationDrugClass[];
  content_family?: ReplicationContentFamily;
  content_tags?: string[];
  /** Joined from the artist taxonomy table for gallery filtering. */
  artist_primary_type?: ReplicationArtistPrimaryType;
  artist_type_tags?: ReplicationArtistTypeTag[];
  thumbnail_storage_id?: string;
  /**
   * Low-res muted preview rendition for gallery in-view autoplay (video rows
   * only). Written by scripts/replications/generate-preview-renditions.mjs.
   */
  preview_storage_id?: string;
  /**
   * Full-viewer silent video rendition for controllable GIF-like motion.
   * The original storage_id remains the rights/provenance source.
   */
  motion_storage_id?: string;
  /** Poster paired with motion_storage_id. */
  motion_poster_storage_id?: string;
  /**
   * Cloudflare R2 archive keys (`media/sha256/<first-two-hex>/<sha256>.<ext>`),
   * one per media variant. Optional and additive: the Postgres storage IDs stay
   * populated as the rollback source during the R2 migration. Clients never
   * build URLs from these — `resolveReplicationUrls` does, server-side.
   */
  r2_key?: string;
  thumbnail_r2_key?: string;
  preview_r2_key?: string;
  motion_r2_key?: string;
  motion_poster_r2_key?: string;
  width?: number;
  height?: number;
  format: string;
  file_size?: number;
  duration?: number;
  /**
   * Whether the stored video contains audible signal. `true` = decoded peak
   * above the silence floor; `false` = no audio stream or digitally silent;
   * absent = never probed. Only meaningful on `type: "video"` rows.
   */
  has_audio?: boolean;
  created_at: string;
  /** Best-estimate work date; see {@link ReplicationDateInfo}. */
  date_info?: ReplicationDateInfo;
}

/**
 * Replication with storage URLs attached (for client-side use).
 */
export interface ReplicationWithUrl extends ReplicationRecord {
  url: string;
  thumbnail_url?: string;
  /**
   * Resolved URL of the low-res muted preview rendition, when the row has one
   * (`preview_storage_id`; video rows only). The gallery autoplays this in
   * view; absence means hover-to-play of the full `url` instead.
   */
  preview_url?: string;
  /** Resolved full-viewer motion rendition for animated image rows. */
  motion_url?: string;
  /** Resolved poster paired with motion_url. */
  motion_poster_url?: string;
}

/**
 * Replication enriched for the cross-effect gallery. `effect_order_index` maps
 * each effect this work depicts to its position in that effect's
 * `gallery_order`; read it through `curatedEffectPosition`. Effects that never
 * curated the work are absent, as is the whole field when none did.
 */
export interface GalleryReplication extends ReplicationWithUrl {
  effect_order_index?: Readonly<Record<string, number>>;
}

/**
 * The {@link ReplicationTitleDrug} fields the gallery actually reads: the
 * drug filter matches on `slug` and the filter options label on `name`.
 * `class` and `matched_title_text` never render on a gallery surface, so
 * they stay off the serialized corpus. A full entry remains assignable here.
 */
interface PublicGalleryTitleDrug {
  slug: string;
  name: string;
}

/**
 * The {@link ReplicationDateInfo} fields the gallery's newest-work-first sort
 * reads (`workDateMs` looks at `kind` and `value` only). Research provenance
 * (`event_type`, `confidence`, `researched_at`) renders nowhere in the
 * gallery — the expanded viewer fetches the full record for its details
 * pane — so it stays off the serialized corpus. A full record's `date_info`
 * remains assignable here.
 */
interface PublicGalleryDateInfo {
  value?: string;
  kind: ReplicationDateKind;
}

/**
 * The slim projection of a {@link GalleryReplication} that the public gallery
 * surfaces (the /replications explorer, its artist/effect focus views, and the
 * expanded viewer) actually render. The gallery corpus loader projects the raw
 * Postgres rows down to this shape (`projectPublicGalleryReplicationPreview` in
 * lib/data/publicData.replications.ts) before they cross into page props, so
 * storage IDs, rights metadata, and other studio-only fields never serialize
 * into the RSC payload. The replication permalink (/replications/[slug]) stays
 * on the full-fidelity {@link ReplicationWithUrl} records — its credit block
 * and lightbox caption need the rights fields this shape drops.
 *
 * Every field here also exists on {@link GalleryReplication} with an
 * assignable type (`title_drugs` and `date_info` narrow to the sub-fields the
 * gallery reads), so a full record is always assignable where a preview is
 * expected.
 */
export interface PublicGalleryReplicationPreview {
  /** Postgres row id; the gallery uses it only as a stable React key. */
  _id: string;
  slug: string;
  title: string;
  artist: string;
  /** Legacy per-row artist link; sanitized before it renders as an href. */
  artist_url?: string;
  type: ReplicationType;
  /** Container format ("gif", "mp4", ...); the media-tier sort demotes GIFs by it. */
  format: string;
  /** Owning effect: drives by-effect grouping, the effect chip, withholding. */
  effect_slug?: string;
  /** Other effects the work also depicts; the depicted-effect filter reads it. */
  effect_tags?: string[];
  viewing_mode_tags?: ReplicationViewingModeTag[];
  title_drugs?: PublicGalleryTitleDrug[];
  drug_classes?: ReplicationDrugClass[];
  content_family?: ReplicationContentFamily;
  artist_type_tags?: ReplicationArtistTypeTag[];
  url: string;
  thumbnail_url?: string;
  /** Low-res muted rendition the gallery autoplays in view (video rows). */
  preview_url?: string;
  /** Full-viewer controllable motion rendition for animated image rows. */
  motion_url?: string;
  /** Poster paired with motion_url. */
  motion_poster_url?: string;
  width?: number;
  height?: number;
  /** Video duration in seconds, shown on the tile's duration badge. */
  duration?: number;
  /** Whether a video contains audible signal; absent = unprobed. */
  has_audio?: boolean;
  /** ISO ingest timestamp; undated rows tiebreak by it after every dated row. */
  created_at: string;
  /** Best-estimate work date; the shared newest-work-first sort reads it. */
  date_info?: PublicGalleryDateInfo;
  /**
   * Position within each depicted effect's curated `gallery_order`, keyed by
   * effect slug. Read it through `curatedEffectPosition`.
   */
  effect_order_index?: Readonly<Record<string, number>>;
}

/**
 * Grouped replications by type.
 */


/**
 * Gallery metadata for ordering and presentation.
 */


/**
 * Lightgallery item data structure.
 */


/**
 * Replication upload form data.
 */


/**
 * Replication with basic metadata (for UI display).
 */
export interface ReplicationMetadata extends ReplicationRightsMetadata {
  slug: string;
  title: string;
  artist: string;
  type: ReplicationType;
  effectSlug: string;
  thumbnailUrl?: string;
}

export interface AudioReplicationMetadata extends ReplicationRightsMetadata {
  title: string;
  artist: string;
  artist_url?: string;
  description?: string;
  resource: string;
}
