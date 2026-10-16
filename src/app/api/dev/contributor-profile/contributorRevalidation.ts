import { revalidatePath } from "next/cache";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import {
  isPublicationTarget,
  type PublicationTarget,
} from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import type { PublicationReceipt } from "@server/next/publicationDispatch";
import { getPublicRoutePath } from "@server/next/publicSite";
import { normalizeContributorProfileKey } from "@/utils/publicRouteIdentity";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";

export type ContributorRevalidationScope = "profile" | "ordering" | "attribution";

export async function revalidateContributorSurfaces({
  contributorKeys,
  scope,
  galleryVisibilityChanged = false,
}: {
  contributorKeys: readonly string[];
  scope: ContributorRevalidationScope;
  galleryVisibilityChanged?: boolean;
}): Promise<PublicationReceipt[]> {
  const targets: PublicationTarget[] = [];
  let unnamedKey = false;
  const profileJobSlugs: string[] = [];

  for (const key of contributorKeys) {
    const normalized = normalizeContributorProfileKey(key);
    if (!normalized) {
      continue;
    }
    profileJobSlugs.push(`profile/${normalized}`);
    const target: PublicationTarget = { kind: "contributor", slug: normalized };
    if (isPublicationTarget(target)) {
      targets.push(target);
      continue;
    }
    unnamedKey = true;
    revalidatePath(getPublicRoutePath({ family: "contributor", params: { profileKey: normalized } }));
  }

  if (unnamedKey) {
    revalidatePath("/replications/artist/[key]", "page");
    targets.push({ kind: "contributor-lists" });
  }

  if (scope === "ordering" || scope === "attribution") {
    targets.push({ kind: "replication-collections" }, { kind: "report-lists" });
  } else if (galleryVisibilityChanged) {
    targets.push({ kind: "replication-collections" });
  }

  if (scope === "profile" || scope === "attribution") {
    targets.push({ kind: "about" });
  }

  if ((scope === "profile" || scope === "attribution") && profileJobSlugs.length > 0) {
    try {
      await enqueueTranslationJobs(LIVE_LOCALE_CODES, profileJobSlugs);
    } catch (error) {
      console.warn("[revalidateContributorSurfaces] translation enqueue failed", {
        slugs: profileJobSlugs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return publishPublicCache({ targets, source: "manual" });
}
