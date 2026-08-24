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

/**
 * Read a row's role, applying the stored default.
 *
 * The column is optional so the rows that predate it stay correct without a
 * backfill: every one of them is a replication, and an absent `role` says so.
 * Use this rather than comparing `row.role` directly, so that default is stated
 * once instead of once per consumer.
 */
export function mediaRole(row: { role?: MediaRole }): MediaRole {
  return row.role ?? "replication";
}

/** Whether a stored row should be counted and shown as a replication. */
export function isReplicationRow(row: { role?: MediaRole }): boolean {
  return mediaRole(row) === "replication";
}

/**
 * The media kinds a replication surface can actually draw today.
 *
 * `audio` is storable but nothing renders it: every tile, rail, carousel and the
 * permalink branch on `type === 'video'` with an *image* fallback, so an audio
 * row would be handed to `<AppImage src="….mp3">` beneath a pill reading
 * "Image". Until one of those surfaces grows a real audio branch, an audio row
 * is a row we cannot draw — the same category as a row whose storage id
 * resolves to no URL, which every surface already drops.
 *
 * Widen this set together with those branches, never ahead of them.
 */
const PRESENTABLE_REPLICATION_TYPES: ReadonlySet<ReplicationType> =
  new Set<ReplicationType>(["image", "video"]);

/**
 * Whether the public replication surfaces may publish a stored row.
 *
 * Two independent reasons to withhold one, answered in a single place so a new
 * surface cannot pick up half the rule:
 *
 *  - it is a figure rather than a replication. A diagram is credited and
 *    rights-tracked in the same table, but every surface that would show it
 *    asserts something untrue about it: the permalink emits JSON-LD reading
 *    "A replication of the subjective effect X", the gallery counts it as a work
 *    by its credited artist, and the sitemap offers that page to crawlers.
 *  - it is a media kind nothing can draw yet (see above).
 *
 * This is a *publication* gate and not a data gate. `convex/replications.ts`
 * keeps returning every stored row, so the rights and provenance tooling under
 * `scripts/replications/` still audits figures — which is exactly where an asset
 * whose rights travel with it most needs to stay visible — and a future
 * article-figure gallery reads the same rows through a helper of its own.
 *
 * Set membership rather than an `!== 'audio'` comparison, so a kind added to the
 * union later is withheld until a surface can draw it. `strictNullChecks` is off
 * in both tsconfigs, so a row is not proof of its own shape; an absent or
 * unrecognised `type` is not in the set and is withheld too.
 */
export function isPublishableReplication(row: {
  role?: MediaRole;
  type: ReplicationType;
}): boolean {
  return isReplicationRow(row) && PRESENTABLE_REPLICATION_TYPES.has(row.type);
}

/**
 * Replication rights status. Replication media is separate from dose.wiki's
 * CC0 article dataset unless an individual item says otherwise.
 */
export type ReplicationRightsStatus =
  | "creator-retained"
  | "explicit-license"
  | "unknown"
  | "permission-granted"
  | "public-domain";

export interface ReplicationRightsMetadata {
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

export type ReplicationDateConfidence =
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
 * Raw replication record from Convex database.
 */
export interface ReplicationRecord extends ReplicationRightsMetadata {
  _id: string;
  _creationTime: number;
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  /** Absent means `'replication'`. Read it through {@link mediaRole}. */
  role?: MediaRole;
  type: ReplicationType;
  storage_id: string;
  /**
   * Owning effect, when there is one. Absent for assets with no effect at all:
   * figures embedded in effect-index articles, page heroes, a molecule diagram.
   */
  effect_slug?: string;
  /**
   * Effects this asset also depicts, as effect slugs. Editorial metadata only:
   * written from the `/dev` Replication Studio, read by nothing public yet.
   */
  effect_tags?: string[];
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
 * Replication enriched for the cross-effect gallery. `order_index` is the
 * item's position within its effect's `gallery_order` (absent when the effect
 * has no curated order), used for intra-effect sorting in the gallery.
 */
export interface GalleryReplication extends ReplicationWithUrl {
  order_index?: number;
}

/**
 * The slim projection of a {@link GalleryReplication} that the public gallery
 * surfaces (the /replications explorer, its artist/effect focus views, and the
 * expanded viewer) actually render. The gallery corpus loader projects the raw
 * Convex rows down to this shape (`projectPublicGalleryReplicationPreview` in
 * lib/convex/publicData.replications.ts) before they cross into page props, so
 * storage IDs, rights metadata, and other studio-only fields never serialize
 * into the RSC payload. The replication permalink (/replications/[slug]) stays
 * on the full-fidelity {@link ReplicationWithUrl} records — its credit block
 * and lightbox caption need the rights fields this shape drops.
 *
 * Every field here exists on {@link GalleryReplication} with the same type, so
 * a full record is always assignable where a preview is expected.
 */
export interface PublicGalleryReplicationPreview {
  /** Convex row id; the gallery uses it only as a stable React key. */
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
  date_info?: ReplicationDateInfo;
  /** Position within the owning effect's curated `gallery_order`. */
  order_index?: number;
}

/**
 * Grouped replications by type.
 */
export interface GroupedReplications {
  images: ReplicationWithUrl[];
  videos: ReplicationWithUrl[];
}

/**
 * Gallery metadata for ordering and presentation.
 */
export interface GalleryMetadata {
  effectSlug: string;
  totalCount: number;
  imageCount: number;
  videoCount: number;
  order?: string[];
}

/**
 * Lightgallery item data structure.
 */
export interface LightGalleryItem {
  id: string;
  src: string;
  thumb: string;
  subHtml: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Replication upload form data.
 */
export interface ReplicationUploadInput {
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  type: ReplicationType;
  effect_slug: string;
  file: File;
}

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
