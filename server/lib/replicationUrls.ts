function isPlaceholderStorageId(storageId?: string | null) {
  return !storageId || storageId.startsWith("placeholder-");
}

const R2_KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.[a-z0-9]{2,5}$/;

export function isValidR2Key(key?: string | null): key is string {
  if (!key) return false;
  const match = R2_KEY_PATTERN.exec(key);
  return match !== null && match[2].startsWith(match[1]);
}

export function replicationMediaBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.REPLICATION_MEDIA_BASE_URL?.trim().replace(/\/+$/, "");
  if (!raw || !/^https:\/\/\S+$/.test(raw)) return null;
  return raw;
}

export async function resolveReplicationUrls(
  ctx: { storage: { getUrl: (storageId: string) => Promise<string | null> } },
  rep: {
    storage_id?: string;
    thumbnail_storage_id?: string;
    preview_storage_id?: string;
    motion_storage_id?: string;
    motion_poster_storage_id?: string;
    r2_key?: string;
    thumbnail_r2_key?: string;
    preview_r2_key?: string;
    motion_r2_key?: string;
    motion_poster_r2_key?: string;
    url?: string;
    thumbnail_url?: string;
  },
  opts?: { thumbnail?: boolean; preview?: boolean; motion?: boolean },
) {
  let url: string | null = null;
  let thumbnail_url: string | null = null;
  let preview_url: string | null = null;
  let motion_url: string | null = null;
  let motion_poster_url: string | null = null;

  const base = replicationMediaBaseUrl();
  const fromR2 = (key?: string | null) =>
    base && isValidR2Key(key) ? `${base}/${key}` : null;

  url = fromR2(rep.r2_key);
  if (!url && rep.storage_id && !isPlaceholderStorageId(rep.storage_id)) {
    try {
      url = await ctx.storage.getUrl(rep.storage_id);
    } catch {
    }
  }
  if (!url && rep.url) url = rep.url;

  if (opts?.thumbnail !== false) {
    thumbnail_url = fromR2(rep.thumbnail_r2_key);
    if (!thumbnail_url && !isPlaceholderStorageId(rep.thumbnail_storage_id)) {
      if (rep.thumbnail_storage_id === rep.storage_id && url) {
        thumbnail_url = url;
      } else {
        try {
          thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id!);
        } catch {
        }
      }
    }
    if (!thumbnail_url && rep.thumbnail_url) thumbnail_url = rep.thumbnail_url;
  }

  if (opts?.preview !== false) {
    preview_url = fromR2(rep.preview_r2_key);
    if (!preview_url && !isPlaceholderStorageId(rep.preview_storage_id)) {
      try {
        preview_url = await ctx.storage.getUrl(rep.preview_storage_id!);
      } catch {
      }
    }
  }

  if (opts?.motion !== false) {
    motion_url = fromR2(rep.motion_r2_key);
    if (!motion_url && !isPlaceholderStorageId(rep.motion_storage_id)) {
      try {
        motion_url = await ctx.storage.getUrl(rep.motion_storage_id!);
      } catch {
      }
    }

    motion_poster_url = fromR2(rep.motion_poster_r2_key);
    if (!motion_poster_url && !isPlaceholderStorageId(rep.motion_poster_storage_id)) {
      try {
        motion_poster_url = await ctx.storage.getUrl(rep.motion_poster_storage_id!);
      } catch {
      }
    }
  }

  return { url, thumbnail_url, preview_url, motion_url, motion_poster_url };
}

export interface StorageUrlReader {
  storage: { getUrl: (storageId: string) => Promise<string | null> };
}

export function memoizedStorageUrls(ctx: StorageUrlReader): StorageUrlReader {
  const cache = new Map<string, Promise<string | null>>();
  return {
    storage: {
      getUrl: (storageId: string) => {
        let hit = cache.get(storageId);
        if (!hit) {
          hit = ctx.storage.getUrl(storageId).catch(() => null);
          cache.set(storageId, hit);
        }
        return hit;
      },
    },
  };
}

export { isPlaceholderStorageId };
