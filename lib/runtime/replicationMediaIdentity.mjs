export const REPLICATION_MEDIA_KEY_FIELDS = Object.freeze([
  "r2_key", "thumbnail_r2_key", "preview_r2_key", "motion_r2_key", "motion_poster_r2_key",
]);

export const REPLICATION_MEDIA_IDENTITY_FIELDS = Object.freeze([
  ...REPLICATION_MEDIA_KEY_FIELDS,
  "storage_id", "thumbnail_storage_id", "preview_storage_id", "motion_storage_id", "motion_poster_storage_id",
]);

export function replicationMediaIdentity(row) {
  return Object.fromEntries(REPLICATION_MEDIA_IDENTITY_FIELDS.map((field) => [field, row[field] ?? null]));
}

export function replicationMediaKeyFromUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const match = new URL(value).pathname.match(/(?:^|\/)(media\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.[a-z0-9]{2,5})$/);
    return match && match[2] === match[3].slice(0, 2) ? match[1] : null;
  } catch {
    return null;
  }
}
