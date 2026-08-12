/**
 * Cache invalidation shared by the three Contributors-tab write routes.
 *
 * A contributor edit lands on more than the contributor page: the ordering
 * panels decide the sequence of the works and reports rendered *inside* that
 * page, and a merge or a byline retarget rewrites the author shown on the
 * report pages themselves. So the replication and report tags go with the
 * contributor tag rather than being invalidated only where the row lives.
 *
 * `expire: 0` is what makes the edit visible on the next request instead of at
 * the end of the 15-minute public-data window, matching the Copy Studio route.
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { getPublicRoutePath } from "@server/next/publicSite";

export type ContributorRevalidationScope = "profile" | "ordering" | "attribution";

export function revalidateContributorSurfaces({
  contributorKeys,
  scope,
}: {
  contributorKeys: readonly string[];
  scope: ContributorRevalidationScope;
}): void {
  for (const key of contributorKeys) {
    const normalized = key.trim();
    if (!normalized) {
      continue;
    }
    revalidatePath(
      getPublicRoutePath({ family: "contributor", params: { profileKey: normalized } }),
    );
  }

  revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.contributors, { expire: 0 });

  if (scope === "ordering" || scope === "attribution") {
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.replications, { expire: 0 });
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.reports, { expire: 0 });
  }

  if (scope === "profile" || scope === "attribution") {
    // The About page renders founder profiles inline, so a display name, role
    // or avatar change is visible there too.
    revalidatePath("/about");
  }
}
