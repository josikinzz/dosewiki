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
