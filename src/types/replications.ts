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
  thumbnail_storage_id?: string;
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
