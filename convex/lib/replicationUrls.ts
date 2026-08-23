function isPlaceholderStorageId(storageId?: string | null) {
  return !storageId || storageId.startsWith("placeholder-");
}

/** Resolve native storage first, then preserve the row's direct-URL fallbacks. */
export async function resolveReplicationUrls(
  ctx: { storage: { getUrl: (storageId: string) => Promise<string | null> } },
  rep: {
    storage_id: string;
    thumbnail_storage_id?: string;
    preview_storage_id?: string;
    motion_storage_id?: string;
    motion_poster_storage_id?: string;
    url?: string;
    thumbnail_url?: string;
  },
  opts?: { preview?: boolean },
) {
  let url = null;
  let thumbnail_url = null;
  let preview_url = null;
  let motion_url = null;
  let motion_poster_url = null;

  if (!isPlaceholderStorageId(rep.storage_id)) {
    try {
      url = await ctx.storage.getUrl(rep.storage_id);
    } catch {
      // Invalid or missing storage IDs fall through to the direct URL.
    }
  }
  if (!url && rep.url) url = rep.url;

  if (!isPlaceholderStorageId(rep.thumbnail_storage_id)) {
    if (rep.thumbnail_storage_id === rep.storage_id && url) {
      thumbnail_url = url;
    } else {
      try {
        thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id!);
      } catch {
        // Invalid or missing storage IDs fall through to the direct URL.
      }
    }
  }
  if (!thumbnail_url && rep.thumbnail_url) thumbnail_url = rep.thumbnail_url;

  if (opts?.preview !== false && !isPlaceholderStorageId(rep.preview_storage_id)) {
    try {
      preview_url = await ctx.storage.getUrl(rep.preview_storage_id!);
    } catch {
      // Preview URLs deliberately have no direct-URL fallback.
    }
  }

  if (!isPlaceholderStorageId(rep.motion_storage_id)) {
    try {
      motion_url = await ctx.storage.getUrl(rep.motion_storage_id!);
    } catch {
      // Motion renditions deliberately have no direct-URL fallback.
    }
  }

  if (!isPlaceholderStorageId(rep.motion_poster_storage_id)) {
    try {
      motion_poster_url = await ctx.storage.getUrl(rep.motion_poster_storage_id!);
    } catch {
      // Motion posters deliberately have no direct-URL fallback.
    }
  }

  return { url, thumbnail_url, preview_url, motion_url, motion_poster_url };
}

/** Resolve each distinct storage ID at most once during one query invocation. */
export function memoizedStorageUrls(ctx: {
  storage: { getUrl: (storageId: string) => Promise<string | null> };
}): { storage: { getUrl: (storageId: string) => Promise<string | null> } } {
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
