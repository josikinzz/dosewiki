/**
 * Cache publication shared by the three Contributors-tab write routes.
 *
 * A contributor edit lands on more than the contributor page: the ordering
 * panels decide the sequence of the works and reports rendered *inside* that
 * page, and a merge or a byline retarget rewrites the author shown on the
 * report pages themselves. So the replication and report identities go with
 * the contributor identity rather than being published only where the row
 * lives.
 *
 * Publishing rather than revalidating locally is what makes the edit visible
 * on dose.wiki and effectindex.com, whose caches this project cannot reach:
 * the seam expires this deployment's entries immediately and delivers the same
 * identities to the public deployments.
 */
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
  /**
   * A profile save that touched `exclude_from_gallery`. The /replications
   * gallery corpus is composed from the replications AND contributors caches,
   * so the replications identity goes too - without dragging the reports
   * identity along the way a full "ordering" scope would.
   */
  galleryVisibilityChanged?: boolean;
}): Promise<PublicationReceipt[]> {
  const targets: PublicationTarget[] = [];
  let unnamedKey = false;
  const profileJobSlugs: string[] = [];

  // The contributor identity carries the profile page and the contributor's
  // Artist Page route segment (T-4: the profile's one public surface when they
  // claim credited works), which renders the same avatar, bio and links.
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
    // A profile key the publication contract cannot carry (an email address,
    // say) has no transmittable identity, and one target the receiver refuses
    // costs the whole signal. Expire this deployment's copy of the page
    // directly instead.
    unnamedKey = true;
    revalidatePath(getPublicRoutePath({ family: "contributor", params: { profileKey: normalized } }));
  }

  if (unnamedKey) {
    revalidatePath("/replications/artist/[key]", "page");
    // The contributors data cache still moved, and the index identity carries
    // exactly that cache without having to name the key, so the public
    // deployments are not left reading a stale profile payload.
    targets.push({ kind: "contributor-lists" });
  }

  if (scope === "ordering" || scope === "attribution") {
    targets.push({ kind: "replication-collections" }, { kind: "report-lists" });
  } else if (galleryVisibilityChanged) {
    targets.push({ kind: "replication-collections" });
  }

  if (scope === "profile" || scope === "attribution") {
    // The About page renders founder profiles inline, so a display name, role
    // or avatar change is visible there too.
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
