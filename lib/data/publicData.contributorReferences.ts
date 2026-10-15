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
      reviewedArticles: reviewedArticles.map((credit) => ({
        slug: credit.slug,
        reviewerProfileKey: credit.profileKey,
      })),
    };

    return countContributorReferences(profiles, input);
  },
);
