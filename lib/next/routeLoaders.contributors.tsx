import "server-only";

import { cache, type ReactNode } from "react";
import {
  getEffectArticlesByContributor,
  getPublicContributorIdentity,
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicGalleryReplications,
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
import { mapArtistPageKeysByProfile } from "../../src/features/replications/galleryFocus";
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
  verifiedReplicator: boolean;
}

export type ContributorRouteResult =
  | (OkRouteResult<ContributorRoutePageProps> & {
      /** Canonical key used by build-generated contributor assets. */
      socialCardProfileKey: string;
    })
  | {
      kind: "redirect";
      target: string;
      metadata: RouteMetadataSource;
      canonicalRoute: PublicRouteIdentity;
      /** Canonical key used by build-generated contributor assets. */
      socialCardProfileKey: string;
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

    // The Artist Page merge (Replication Surfaces T-4): a profile that claims
    // a credited artist with displayable works is no longer a destination —
    // its one public surface is /replications/artist/<key>, which carries the
    // profile's avatar, bio, and links as decoration. This branch precedes the
    // casing redirect so an alias or badly-cased profile link forwards in one
    // hop. A profile with no such works (a reviewer, an article author, an
    // artist whose every work artist views withhold) has no rival surface and
    // keeps rendering here. See the decision record in
    // src/features/replications/galleryFocus.ts.
    const [galleryReplications, contributorDirectory] = await Promise.all([
      getPublicGalleryReplications(),
      getPublicContributorDirectory(),
    ]);
    const artistPageKeys = mapArtistPageKeysByProfile(galleryReplications, contributorDirectory);
    const artistPageKey = artistPageKeys.get(profile.key.trim().toUpperCase());
    if (artistPageKey) {
      const artistRoute: PublicRouteIdentity = {
        family: "replicationArtist",
        params: { key: artistPageKey },
      };
      return {
        kind: "redirect",
        target: getPublicRoutePath(artistRoute),
        metadata,
        canonicalRoute: artistRoute,
        socialCardProfileKey: profile.key,
      };
    }

    if (profile.key !== normalizedKey) {
      return {
        kind: "redirect",
        target: getPublicRoutePath(canonicalRoute),
        metadata,
        canonicalRoute,
        socialCardProfileKey: profile.key,
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
    const [reports, replications, effectArticles, reviewedArticles, history, staffNoteSigner, identity] =
      await Promise.all([
        getReportsByContributor(profile),
        readContributorReplications(profile),
        getEffectArticlesByContributor(profile),
        getReviewedArticlesByContributor(profile.key),
        getPublicProfileHistory(profile),
        staffNote ? getPublicContributorByKey("JOSIE") : Promise.resolve(null),
        getPublicContributorIdentity(profile.key),
      ]);

    const signerArtistKey = staffNoteSigner
      ? artistPageKeys.get(staffNoteSigner.key.trim().toUpperCase()) ?? null
      : null;

    return {
      kind: "ok",
      socialCardProfileKey: profile.key,
      pageProps: {
        profile: {
          ...profile,
          // A verified delivered campaign avatar takes precedence. The
          // established contributor profile avatar remains the fallback.
          avatarUrl: identity?.avatar_url ?? profile.avatarUrl,
        },
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
        // The contributor's own `replicationOrder` is the exact leading prefix.
        // Effect Index editorial picks lead only within the unlisted tail; the
        // remaining works keep the shared automatic order.
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
              // The signer's one public surface: her Artist Page when her
              // profile forwards there (the T-4 merge), else her profile.
              avatarHref: staffNoteSigner
                ? getPublicRoutePath(
                    signerArtistKey
                      ? { family: "replicationArtist", params: { key: signerArtistKey } }
                      : { family: "contributor", params: { profileKey: staffNoteSigner.key } },
                  )
                : null,
            }
          : null,
        verifiedReplicator: identity?.verified_replicator === true,
      },
      metadata,
      canonicalRoute,
    };
  },
);
