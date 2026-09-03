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
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";

export function revalidateSavedPaths(
  paths: readonly string[],
  source: PublicDerivedDataCacheInvalidation["source"],
): void {
  for (const path of paths) {
    revalidatePath(path);
  }
  invalidatePublicDerivedDataCache({ source });
  revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.all, { expire: 0 });
}
