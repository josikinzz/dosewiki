import { revalidatePath, revalidateTag } from "next/cache";
import { invalidatePublicDerivedDataCache } from "../data/publicLibrary";
import { PUBLIC_DATA_CACHE_TAGS } from "../data/publicData.cacheTags";
import { resolvePublicationEffects } from "./publicCacheContract";
import type { PublicationSource, PublicationTarget } from "./publicationWire";
import { dispatchPublicationSignal, type PublicationReceipt, type SavedArticleRevision } from "./publicationDispatch";

export type PublicCachePublication = {
  targets: readonly PublicationTarget[];
  source: PublicationSource;
  savedRevisions?: readonly SavedArticleRevision[];
  unknownPaths?: readonly string[];
};

export function applyPublicCacheLocally(publication: PublicCachePublication): void {
  const effect = resolvePublicationEffects(publication.targets);
  for (const entry of effect.paths) {
    if (entry.type) revalidatePath(entry.path, entry.type);
    else revalidatePath(entry.path);
  }
  const tags = new Set(effect.tags);
  if (publication.unknownPaths?.length) {
    for (const path of publication.unknownPaths) revalidatePath(path);
    tags.add(PUBLIC_DATA_CACHE_TAGS.all);
  }
  invalidatePublicDerivedDataCache({
    source: publication.source,
    targets: publication.targets,
    conservative: Boolean(publication.unknownPaths?.length),
  });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}

export async function publishPublicCache(
  publication: PublicCachePublication,
): Promise<PublicationReceipt[]> {
  const receipts: PublicationReceipt[] = [];
  try {
    applyPublicCacheLocally(publication);
    receipts.push({ target: "local", status: "accepted", attempts: 1, verification: "not-requested" });
  } catch (error) {
    receipts.push({ target: "local", status: "unreachable", attempts: 1,
      detail: error instanceof Error ? error.message : "local invalidation failed", verification: "pending" });
  }
  try {
    receipts.push(...await dispatchPublicationSignal(
      publication.targets, publication.source, process.env, publication.savedRevisions,
    ));
  } catch (error) {
    receipts.push({ target: "dispatch", status: "unreachable", attempts: 0,
      detail: error instanceof Error ? error.message : "dispatch failed", verification: "pending" });
  }
  return receipts;
}
