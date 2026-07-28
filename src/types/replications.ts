/**
 * TypeScript types for replications (videos and images of effects).
 */

/**
 * Replication type - either video or image.
 */
export type ReplicationType = 'video' | 'image';

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
  type: ReplicationType;
  storage_id: string;
  effect_slug: string;
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
