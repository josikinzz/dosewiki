import "server-only";

import { cache } from "react";

import {
  countContributorReferences,
  type ContributorReferenceInput,
} from "../../src/data/contributorRoster";
import { getPublicContributorProfiles } from "./publicData.contributors";
import { getPublicEffectArticles, getPublicReplications } from "./publicData.effects";
import { getPublicReports } from "./publicData.reports";

/**
 * How many distinct public pages credit each contributor, keyed by profile key.
 *
 * Composed entirely from reads that already happen elsewhere in the same build — the effect
 * article corpus (`/effects/*`, `/categories/*`), the replication gallery (`/effects`,
 * `/replications`) and the report previews (`/reports`) — all of which are wrapped in
 * `unstable_cache`. So the About page adds no Convex round-trips of its own on a full build,
 * and React's `cache` collapses repeat calls within a single render.
 *
 * It lives in its own module rather than in `publicData.contributors` because the report
 * reads already depend on that module; importing them back would close a cycle.
 *
 * See `src/data/contributorRoster` for which attribution fields count and which are excluded.
 */
export const getPublicContributorReferenceCounts = cache(
  async (): Promise<Map<string, number>> => {
    const [profiles, effects, replications, reports] = await Promise.all([
      getPublicContributorProfiles(),
      getPublicEffectArticles(),
      getPublicReplications(),
      getPublicReports(),
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
    };

    return countContributorReferences(profiles, input);
  },
);
