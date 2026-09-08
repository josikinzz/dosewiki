/**
 * Cache invalidation after a production article or layout write: the direct
 * save route and the change-proposal apply and revert routes all land here so
 * an applied proposal ships exactly the way a direct save does.
 *
 * Each saved path is translated into the content identity the shared
 * publication contract understands, which expires this deployment's caches
 * immediately and delivers the same identities to the public deployments,
 * whose caches this project cannot reach directly. A path with no known
 * identity keeps the previous behavior: a local global expiry, undelivered,
 * because the receiver refuses identities it cannot map.
 *
 * Delivery receipts are returned rather than thrown. The Convex write has
 * already committed by the time this runs, so a refused or unreachable public
 * deployment is a reportable partial publication, never a save failure.
 */
import { publicationTargetForSavedPath } from "@server/next/publicCacheContract";
import type { PublicationSource, PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import type { PublicationReceipt, SavedArticleRevision } from "@server/next/publicationDispatch";

export async function revalidateSavedPaths(
  paths: readonly string[],
  source: PublicationSource,
  savedRevisions: readonly SavedArticleRevision[] = [],
): Promise<PublicationReceipt[]> {
  if (!paths.length) return [];
  const targets: PublicationTarget[] = [];
  const unknownPaths: string[] = [];
  // Every editorial write also moves the changelog, except a manual refresh
  // that replays an existing revision.
  if (source !== "manual") targets.push({ kind: "changelog" });

  for (const path of paths) {
    const target = publicationTargetForSavedPath(path);
    if (target) targets.push(target);
    else unknownPaths.push(path);
  }

  return publishPublicCache({ targets, source, unknownPaths, savedRevisions });
}
