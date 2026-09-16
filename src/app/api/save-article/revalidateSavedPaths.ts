/**
 * Cache invalidation after a production article or layout write: the direct
 * save route and the change-proposal apply and revert routes all land here so
 * an applied proposal ships exactly the way a direct save does.
 *
 * Each saved path is translated into the content identity the shared
 * publication contract understands. Editorial writes expire this deployment
 * immediately, then the transactionally captured outbox performs translation
 * enqueue and public dispatch in that order. Manual cache-only expiry remains
 * synchronous and never creates translation work. A path with no known
 * identity keeps the previous local global-expiry behavior.
 *
 * Editorial receipts remain pending until publication-delivery has created
 * durable locale work. They never describe queue interruption as completion.
 */
import { publicationTargetForSavedPath } from "@server/next/publicCacheContract";
import type { PublicationSource, PublicationTarget } from "@server/next/publicationWire";
import { applyPublicCacheLocally, publishPublicCache } from "@server/next/publishPublicCache";
import type { PublicationReceipt, SavedArticleRevision } from "@server/next/publicationDispatch";

export async function revalidateSavedPaths(
  paths: readonly string[],
  source: PublicationSource,
  savedRevisions: readonly SavedArticleRevision[] = [],
  articleDependencies: Readonly<Record<string, "detail" | "content" | "membership">> = {},
): Promise<PublicationReceipt[]> {
  if (!paths.length) return [];
  const targets: PublicationTarget[] = [];
  const unknownPaths: string[] = [];
  // Every editorial write also moves the changelog, except a manual refresh
  // that replays an existing revision.
  if (source !== "manual") targets.push({ kind: "changelog" });

  for (const path of paths) {
    const target = publicationTargetForSavedPath(path);
    if (target) {
      targets.push(target.kind === "article" && articleDependencies[target.slug]
        ? { ...target, dependency: articleDependencies[target.slug] }
        : target);
    } else {
      unknownPaths.push(path);
    }
  }

  if (source === "manual") {
    return publishPublicCache({ targets, source, unknownPaths, savedRevisions });
  }

  // The writer transaction has already captured these identities in
  // publicCachePublications. Expire the editor deployment now, but leave
  // external dispatch to publication-delivery, which first creates durable
  // translation or catalog work. A queue interruption therefore cannot be
  // reported as completed publication.
  try {
    applyPublicCacheLocally({ targets, source, unknownPaths, savedRevisions });
    return [{
      target: "durable-outbox",
      status: "pending",
      attempts: 0,
      savedRevisions,
      verification: savedRevisions.length ? "pending" : "not-requested",
      detail: "Public delivery is pending durable locale translation or catalog refresh intent",
    }];
  } catch (error) {
    return [{
      target: "local",
      status: "unreachable",
      attempts: 1,
      savedRevisions,
      verification: savedRevisions.length ? "pending" : "not-requested",
      detail: error instanceof Error ? error.message : "local invalidation failed",
    }];
  }
}
