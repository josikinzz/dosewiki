export type ReplicationType = "video" | "image" | "audio";

export type MediaRole = "replication" | "figure";

export type ReplicationStatus =
  | "replication"
  | "not-replication"
  | "unclear"
  | "unreviewed"
  | "source-corrupt";

export type ReplicationPublicationState = "published" | "unpublished" | "duplicate-suppressed";

export function isPublishedState(state: ReplicationPublicationState | null | undefined): boolean {
  return (state ?? "published") === "published";
}

export type ReplicationProvenanceGap = "rights" | "source";

export function isReplicationSourceUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function replicationProvenanceGaps(row: {
  rights_status?: string | null;
  source_url?: string | null;
}): ReplicationProvenanceGap[] {
  const gaps: ReplicationProvenanceGap[] = [];
  if (!row.rights_status || row.rights_status === "unknown") gaps.push("rights");
  if (!isReplicationSourceUrl(row.source_url)) gaps.push("source");
  return gaps;
}

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

function mediaRole(row: { role?: MediaRole }): MediaRole {
  return row.role ?? "replication";
}

function isReplicationRow(row: { role?: MediaRole }): boolean {
  return mediaRole(row) === "replication";
}

const PRESENTABLE_REPLICATION_TYPES: Partial<Record<ReplicationType, true>> = {
  image: true,
  video: true,
  audio: true,
};

const VISUAL_REPLICATION_TYPES: Partial<Record<ReplicationType, true>> = {
  image: true,
  video: true,
};

export function isPublishableReplication(row: {
  role?: MediaRole;
  type: ReplicationType;
  replication_status?: ReplicationStatus;
  publication_state?: ReplicationPublicationState;
}): boolean {
  return (
    isReplicationRow(row) &&
    isPublishedState(row.publication_state) &&
    row.replication_status !== "not-replication" &&
    PRESENTABLE_REPLICATION_TYPES[row.type] === true
  );
}

export function depictsEffect(
  row: { effect_slug?: string; effect_tags?: readonly string[] },
  effectSlug: string,
): boolean {
  return row.effect_slug === effectSlug || row.effect_tags?.includes(effectSlug) === true;
}

export function depictedEffects(row: {
  effect_slug?: string;
  effect_tags?: readonly string[];
}): string[] {
  const slugs = new Set<string>();
  if (row.effect_slug) slugs.add(row.effect_slug);
  for (const tag of row.effect_tags ?? []) slugs.add(tag);
  return [...slugs];
}

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

export function isVisualReplication<T extends { type: ReplicationType }>(
  row: T,
): row is T & { type: "image" | "video" } {
  return VISUAL_REPLICATION_TYPES[row.type] === true;
}

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

export interface ReplicationDateInfo {
  value?: string;
  kind: ReplicationDateKind;
  event_type?: string;
  confidence: ReplicationDateConfidence;
  researched_at: string;
}

interface ReplicationRecord extends ReplicationRightsMetadata {
  _id: string;
  _creationTime: number;
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  role?: MediaRole;
  publication_state?: ReplicationPublicationState;
  duplicate_of_replication_id?: string;
  duplicate_evidence_digest?: string;
  duplicate_operation_id?: string;
  duplicate_suppressed_at?: number;
  type: ReplicationType;
  storage_id?: string;
  effect_slug?: string;
  effect_tags?: string[];
  source_sha256?: string;
  replication_status?: ReplicationStatus;
  viewing_mode?: ReplicationViewingMode;
  viewing_mode_tags?: ReplicationViewingModeTag[];
  title_drugs?: ReplicationTitleDrug[];
  drug_classes?: ReplicationDrugClass[];
  content_family?: ReplicationContentFamily;
  content_tags?: string[];
  artist_primary_type?: ReplicationArtistPrimaryType;
  artist_type_tags?: ReplicationArtistTypeTag[];
  thumbnail_storage_id?: string;
  preview_storage_id?: string;
  motion_storage_id?: string;
  motion_poster_storage_id?: string;
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
  has_audio?: boolean;
  created_at: string;
  date_info?: ReplicationDateInfo;
}

export interface ReplicationWithUrl extends ReplicationRecord {
  url: string;
  thumbnail_url?: string;
  preview_url?: string;
  motion_url?: string;
  motion_poster_url?: string;
}

export interface GalleryReplication extends ReplicationWithUrl {
  effect_order_index?: Readonly<Record<string, number>>;
}

interface PublicGalleryTitleDrug {
  slug: string;
  name: string;
}

interface PublicGalleryDateInfo {
  value?: string;
  kind: ReplicationDateKind;
}

export interface PublicGalleryReplicationPreview {
  _id: string;
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  type: ReplicationType;
  format: string;
  effect_slug?: string;
  effect_tags?: string[];
  viewing_mode_tags?: ReplicationViewingModeTag[];
  title_drugs?: PublicGalleryTitleDrug[];
  drug_classes?: ReplicationDrugClass[];
  content_family?: ReplicationContentFamily;
  artist_type_tags?: ReplicationArtistTypeTag[];
  url: string;
  thumbnail_url?: string;
  preview_url?: string;
  motion_url?: string;
  motion_poster_url?: string;
  width?: number;
  height?: number;
  duration?: number;
  has_audio?: boolean;
  created_at: string;
  date_info?: PublicGalleryDateInfo;
  effect_order_index?: Readonly<Record<string, number>>;
}

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
