import "server-only";

import { cache } from "react";

import {
  countContributorReferences,
  type ContributorReferenceInput,
} from "../../src/data/contributorRoster";
import { getPublicContributorIdentities } from "./publicData.contributors";
import { getPublicEffectContributorCredits, getPublicReplications } from "./publicData.effects";
import { getPublicReports } from "./publicData.reports";
import { getReviewedArticleCredits } from "./publicData.substances";

/**
 * How many distinct public pages credit each contributor, keyed by profile key.
 *
 * Composed from reads that already happen elsewhere in the same build — the effect
 * article corpus (`/effects/*`, `/categories/*`), the replication gallery (`/effects`,
 * `/replications`), the report previews (`/reports`) — plus the review-credit aggregate,
 * which exists for this count alone. All are wrapped in `unstable_cache`, so the About
 * page adds at most one bounded corpus read of its own on a full build, and React's
 * `cache` collapses repeat calls within a single render.
 *
 * It lives in its own module rather than in `publicData.contributors` because the report
 * reads already depend on that module; importing them back would close a cycle.
 *
 * See `src/data/contributorRoster` for which attribution fields count and which are excluded.
 */
export const getPublicContributorReferenceCounts = cache(
  async (): Promise<Map<string, number>> => {
    const [profiles, effects, replications, reports, reviewedArticles] = await Promise.all([
      getPublicContributorIdentities(),
      getPublicEffectContributorCredits(),
      getPublicReplications(),
      getPublicReports(),
      getReviewedArticleCredits(),
    ]);

    const input: ContributorReferenceInput = {
      effects,
      // A replication credits its artist on the effect page it belongs to, so a
      // stored asset with no owning effect (an article figure, a page hero) has
      // no page here to credit anyone on and is dropped rather than counted
      // against an empty effect slug. Every row that predates the optional
      // `effect_slug` sets it, so this drops nothing that used to be counted.
      replications: replications.flatMap((replication) =>
        replication.effect_slug
          ? [{ effect_slug: replication.effect_slug, artist: replication.artist }]
          : [],
      ),
      reports: reports.map((report) => ({
        slug: report.slug,
        author: report.author,
        authorProfileKey: report.authorProfileKey,
      })),
      // Expert-reviewing an article is a contribution to the substance page it
      // gates. The reviewer arrives as a profile key (never an email); the
      // counting side still runs it through the key-or-alias matcher.
      reviewedArticles: reviewedArticles.map((credit) => ({
        slug: credit.slug,
        reviewerProfileKey: credit.profileKey,
      })),
    };

    return countContributorReferences(profiles, input);
  },
);
