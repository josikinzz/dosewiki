/**
 * Cache invalidation after a production article or layout write: the direct
 * save route and the change-proposal apply and revert routes all land here so
 * an applied proposal ships exactly the way a direct save does.
 *
 * `expire: 0` makes the write visible on the next request instead of at the
 * end of the public-data cache window.
 */
import { revalidatePath, revalidateTag } from "next/cache";
import {
  invalidatePublicDerivedDataCache,
  type PublicDerivedDataCacheInvalidation,
} from "@server/convex/publicLibrary";
import {
  PUBLIC_CONVEX_CACHE_TAGS,
  PUBLIC_SUBSTANCE_LISTS_TAG,
  PUBLIC_CHANGELOG_LISTS_TAG,
  publicSubstanceTag,
  publicSubstanceGalleryTag,
  publicArticleHistoryTag,
} from "@server/convex/publicData.cache";

export function revalidateSavedPaths(
  paths: readonly string[],
  source: PublicDerivedDataCacheInvalidation["source"],
): void {
  const tags = new Set<string>();
  if (source !== "manual") tags.add(PUBLIC_CHANGELOG_LISTS_TAG);
  for (const path of paths) {
    if (path === "/copy-blocks") {
      tags.add(PUBLIC_CONVEX_CACHE_TAGS.copy);
      continue;
    }
    revalidatePath(path);
    if (path === "/about") {
      tags.add(PUBLIC_CONVEX_CACHE_TAGS.about);
    } else if (["/substances", "/chemical", "/mechanism"].includes(path)) {
      tags.add(PUBLIC_SUBSTANCE_LISTS_TAG);
      tags.add(PUBLIC_CONVEX_CACHE_TAGS.layouts);
    } else if (/^\/[a-z0-9][a-z0-9-]*$/.test(path)) {
      const slug = path.slice(1);
      tags.add(publicSubstanceTag(slug));
      tags.add(publicSubstanceGalleryTag(slug));
      tags.add(publicArticleHistoryTag(slug));
      tags.add(PUBLIC_SUBSTANCE_LISTS_TAG);
      tags.add(PUBLIC_CHANGELOG_LISTS_TAG);
    } else {
      // Unscoped/global changes retain the immediate full-expiry escape hatch.
      tags.add(PUBLIC_CONVEX_CACHE_TAGS.all);
    }
  }
  invalidatePublicDerivedDataCache({ source });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}
