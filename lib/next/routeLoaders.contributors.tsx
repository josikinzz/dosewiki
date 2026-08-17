import "server-only";

import { cache, type ReactNode } from "react";
import {
  getEffectArticlesByContributor,
  getPublicContributorByKey,
  getPublicProfileHistory,
  getReportsByContributor,
  getReviewedArticlesByContributor,
} from "@server/convex/publicData";
import { ProfileBioMarkdown } from "../../src/components/pages/ProfileBioMarkdown";
import type { UserProfileEditorNote } from "../../src/components/pages/UserProfilePage";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";
import type { ReplicationWithUrl } from "../../src/types/replications";
import {
  orderContributorReplications,
  orderContributorWorksFeaturedFirst,
} from "../../src/features/effects/gallery/replicationDetailModel";
import { EFFECT_INDEX_FEATURED_REPLICATION_SLUGS } from "./effectIndexHome";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import type { ContributorReviewedArticle } from "../../src/types/reviewedArticles";
import { applyCuratedOrder } from "../curatedOrder";
import type { ChangeLogEntry } from "../../src/data/changelog/changeLog";
import { buildMetadataDescription } from "./publicRouteViewModels";
import { getPublicRoutePath, type PublicRouteIdentity } from "./publicSite";
import type { OkRouteResult, RouteMetadataSource } from "./routeLoaderResults";
import { readContributorReplications } from "./routeLoaders.contributorReplications";

const REPORT_HREF_PREFIX = "/reports/";


export interface ContributorRoutePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  bioContent: ReactNode;
  reportHrefPrefix: string;
  tripReports: ReportCardModel[];
  /** Replications credited to this contributor: curated works first, then newest. */
  replications: ReplicationWithUrl[];
  /** Effect articles crediting this contributor, alphabetically. */
  effectArticles: ContributorEffectCredit[];
  /** Substance articles this contributor expert-reviewed, alphabetically. */
  reviewedArticles: ContributorReviewedArticle[];
  /** Staff "Editor's note" under the bio; null renders nothing. */
  editorNote: UserProfileEditorNote | null;
}

export type ContributorRouteResult =
  | OkRouteResult<ContributorRoutePageProps>
  | {
      kind: "redirect";
      target: string;
      metadata: RouteMetadataSource;
      canonicalRoute: PublicRouteIdentity;
    }
  | { kind: "not-found"; normalizedKey: string };

export const loadContributorRoute = cache(
  async (profileKey: string): Promise<ContributorRouteResult> => {
    const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();
    const profile = await getPublicContributorByKey(normalizedKey);

    if (!profile) {
      return { kind: "not-found", normalizedKey };
    }

    const canonicalRoute: PublicRouteIdentity = {
      family: "contributor",
      params: { profileKey: profile.key },
    };
    const metadata: RouteMetadataSource = {
      title: profile.displayName || "Contributor",
      description: buildMetadataDescription(
        profile.bio || `Browse contributor profile ${normalizedKey}.`,
      ),
    };

    if (profile.key !== normalizedKey) {
      return {
        kind: "redirect",
        target: getPublicRoutePath(canonicalRoute),
        metadata,
        canonicalRoute,
      };
    }

    // The staff note is signed by the site rather than the profile owner, so
    // the chip under the bubble carries Josie's avatar and, when the note has
    // no explicit attribution, her public name and role.
    const staffNote = profile.staffNote?.markdown.trim() ? profile.staffNote : null;

    // All four joins run off the same profile and the same name set, so a
    // contributor's reports, works and article credits can never disagree about
    // which credits are theirs. The reviewed-articles read is key-only: the
    // reviewer-email matching stays inside Convex.
    const [reports, replications, effectArticles, reviewedArticles, history, staffNoteSigner] =
      await Promise.all([
        getReportsByContributor(profile),
        readContributorReplications(profile),
        getEffectArticlesByContributor(profile),
        getReviewedArticlesByContributor(profile.key),
        getPublicProfileHistory(profile),
        staffNote ? getPublicContributorByKey("JOSIE") : Promise.resolve(null),
      ]);

    return {
      kind: "ok",
      pageProps: {
        profile,
        history,
        bioContent: profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null,
        reportHrefPrefix: REPORT_HREF_PREFIX,
        // The contributor's own curation outranks the editorial list: it is
        // this person's page and they pinned these reports, so `reportOrder`
        // leads and everything unlisted keeps the default report order.
        tripReports: applyCuratedOrder(
          reports.map(toReportCardModel),
          profile.reportOrder,
          (report) => report.slug,
        ),
        // Curated works lead the rail. The contributor's own `replicationOrder`
        // comes first; beneath it, Effect Index editorial curation (a checked-in
        // list — the replication corpus *is* the Effect Index archive on either
        // flavor, so there is nothing flavor-specific about which pieces it
        // names) still floats its picks ahead of the default newest-first sort.
        replications: applyCuratedOrder(
          orderContributorWorksFeaturedFirst(
            orderContributorReplications(replications),
            EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
          ),
          profile.replicationOrder,
          (replication) => replication.slug,
        ),
        effectArticles,
        reviewedArticles,
        editorNote: staffNote
          ? {
              content: <ProfileBioMarkdown content={staffNote.markdown} />,
              attribution:
                staffNote.attribution?.trim() ||
                (staffNoteSigner
                  ? [staffNoteSigner.displayName, staffNoteSigner.role?.trim()]
                      .filter(Boolean)
                      .join(" · ")
                  : "Josie Kins"),
              avatarUrl: staffNoteSigner?.avatarUrl ?? null,
              avatarHref: staffNoteSigner
                ? getPublicRoutePath({
                    family: "contributor",
                    params: { profileKey: staffNoteSigner.key },
                  })
                : null,
            }
          : null,
      },
      metadata,
      canonicalRoute,
    };
  },
);
