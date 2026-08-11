import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { contributorMatchNames, profileMatchesName } from "../contributorProfileIdentity";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import { isPublishableReplication, type GalleryReplication, type ReplicationWithUrl } from "../../src/types/replications";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import {
  type PublicEffectArticle,
  type PublicEffectPreview,
  type SubjectiveEffectDetailRecord,
} from "./publicData.shared";

export const getPublicEffects = cache(unstable_cache(async (): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffects();
}, ["convex-public-effect-previews"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(unstable_cache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicEffectBySlug(slug);
}, ["convex-public-effect-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getPublicEffectArticles = cache(unstable_cache(async (): Promise<PublicEffectArticle[]> => {
  return await getPublicDataReadAdapter().getPublicEffectArticles();
}, ["convex-public-effect-articles"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getEffectsByCategory = cache(unstable_cache(async (category: string): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffectsByCategory(category);
}, ["convex-public-effects-by-category"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

/**
 * Every effect article credited to one contributor, alphabetically.
 *
 * `subjectiveEffects.contributors[]` is the only contributor field the public
 * corpus has: substance articles carry none, and `effectIndexArticles.authors[]`
 * holds one opaque Mongo ObjectId repeated across every row, which names nobody
 * (see `src/data/contributorRoster` for the same exclusion). So effect articles
 * are the whole of a contributor's article credits.
 *
 * Unlike `getReplicationsByContributor`, the join runs here rather than inside
 * Convex. Resolving it server-side would need a new query and a production
 * deploy, and the failure mode of an additive query that is not deployed yet is
 * exactly what `readContributorReplications` has to catch. The effect corpus
 * read is already performed by this build — effect pages, category pages and the
 * About roster all call it, and it is `unstable_cache`d — so filtering it here
 * adds no round trip and nothing new can be missing.
 *
 * `profileMatchesName` is the app's single definition of "this name is that
 * contributor", shared with the replication and trip-report joins, so a
 * profile's articles, works and reports can never disagree about which credits
 * are theirs. It is exact on normalized whole names, which is why `Josie` and
 * `josie` both land on JOSIE (alias `josie`) and `Kaylee` lands on KAYTWO
 * (alias `kaylee`), while a credit with no profile at all — `liv`, `Nicole`,
 * `Kat`, `chemi`, `Brack` — simply appears on no profile page.
 */
export const getEffectArticlesByContributor = cache(unstable_cache(async (
  profile: NormalizedUserProfile,
): Promise<ContributorEffectCredit[]> => {
  // A profile with no matchable name can credit nothing, so it skips the corpus
  // read entirely rather than filtering 233 articles down to none.
  if (contributorMatchNames(profile).length === 0) {
    return [];
  }

  const effects = await getPublicEffectArticles();

  return effects
    .filter((effect) =>
      (effect.contributors ?? []).some((contributor) => profileMatchesName(profile, contributor)),
    )
    .map((effect) => ({ slug: effect.slug, name: effect.name }))
    // Alphabetical, because the reader scans this list for a name rather than
    // reading it in order; a 225-entry list sorted by anything else is a haystack.
    .sort((left, right) => left.name.localeCompare(right.name));
}, ["convex-public-effect-articles-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.effects,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));

/**
 * WHERE THE FIGURE / UNRENDERABLE-MEDIA GATE LIVES, AND WHY IT IS HERE
 * --------------------------------------------------------------------
 * `isPublishableReplication` is applied to these two list reads and to
 * `getReplicationsByContributor` in `publicData.replications`. Between them
 * those three are the whole of the public replication call graph:
 *
 *   getPublicReplications        → the /effects gallery explorer (and its
 *                                  spotlight, rails, tiles and "N works ·
 *                                  N artists · N effects" counts), the Effect
 *                                  Index homepage panel, the public route plan
 *                                  (so `generateStaticParams` *and* the
 *                                  sitemap), `/api/v1/replications` and
 *                                  `/api/v1/replications/[slug]`, and the About
 *                                  page's contributor reference counts.
 *   getPublicReplicationsByEffect → the effect article's Replications section,
 *                                  `/api/v1/effects/[slug]/replications`, and
 *                                  the permalink's effect walk.
 *   getReplicationsByContributor → the contributor profile's works rail and the
 *                                  permalink's artist walk.
 *
 * Filtering inside `convex/replications.ts` instead would be one edit rather
 * than three, and it was rejected for two reasons. It would hide figures from
 * the maintenance scripts that read those same Convex queries directly
 * (`scripts/replications/audit-provenance.mjs`, `archive-replication-masters`,
 * `repoint-renditions`) — a rights-tracked asset invisible to the rights audit
 * is the wrong failure — and it would only take effect on a Convex deploy,
 * leaving the site publishing figures until that deploy happened, whereas this
 * ships with the build that introduces it.
 *
 * `getPublicReplicationBySlug` below is deliberately *not* filtered: it is a
 * plain single-row read, and its only caller — `loadReplicationRoute` — already
 * owns the "does this row have a page?" decision for `url` and now answers it
 * for `role` and `type` in the same place.
 */
export const getPublicReplicationsByEffect = cache(unstable_cache(async (effectSlug: string): Promise<ReplicationWithUrl[]> => {
  return (await getPublicDataReadAdapter().getPublicReplicationsByEffect(effectSlug)).filter(
    isPublishableReplication,
  );
}, ["convex-public-replications-by-effect"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

export const getPublicReplications = cache(unstable_cache(async (): Promise<GalleryReplication[]> => {
  return (await getPublicDataReadAdapter().getPublicReplications()).filter(isPublishableReplication);
}, ["convex-public-replications"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

export const getPublicReplicationBySlug = cache(unstable_cache(async (slug: string): Promise<ReplicationWithUrl | null> => {
  return await getPublicDataReadAdapter().getPublicReplicationBySlug(slug);
}, ["convex-public-replication-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));
