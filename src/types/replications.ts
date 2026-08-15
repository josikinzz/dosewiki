/**
 * TypeScript types for replications (videos and images of effects).
 */

/**
 * Media kind of a stored row. `audio` joined `video`/`image` when audio assets
 * needed somewhere to live; widening the union is additive and leaves every
 * existing `'video' | 'image'` comparison meaning what it already meant.
 */
export type ReplicationType = 'video' | 'image' | 'audio';

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
export type MediaRole = 'replication' | 'figure';

/**
 * Read a row's role, applying the stored default.
 *
 * The column is optional so the rows that predate it stay correct without a
 * backfill: every one of them is a replication, and an absent `role` says so.
 * Use this rather than comparing `row.role` directly, so that default is stated
 * once instead of once per consumer.
 */
export function mediaRole(row: { role?: MediaRole }): MediaRole {
  return row.role ?? 'replication';
}

/** Whether a stored row should be counted and shown as a replication. */
export function isReplicationRow(row: { role?: MediaRole }): boolean {
  return mediaRole(row) === 'replication';
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
const PRESENTABLE_REPLICATION_TYPES: ReadonlySet<ReplicationType> = new Set<ReplicationType>([
  'image',
  'video',
]);

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
  | 'creator-retained'
  | 'explicit-license'
  | 'unknown'
  | 'permission-granted'
  | 'public-domain';

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
  width?: number;
  height?: number;
  format: string;
  file_size?: number;
  duration?: number;
  created_at: string;
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
  type: 'image' | 'video';
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
