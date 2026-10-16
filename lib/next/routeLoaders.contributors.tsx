import "server-only";

import { cache, type ReactNode } from "react";
import {
  getEffectArticlesByContributor,
  getPublicContributorIdentity,
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicArtistCreditRows,
  getPublicProfileHistory,
  getReportsByContributor,
  getReviewedArticlesByContributor,
} from "@server/data/publicData";
import { ProfileBioMarkdown } from "../../src/components/pages/ProfileBioMarkdown";
import type { UserProfileEditorNote } from "../../src/components/pages/UserProfilePage";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";
import type { ReplicationWithUrl } from "../../src/types/replications";
import { orderContributorReplications } from "../../src/features/effects/gallery/replicationDetailModel";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import type { ContributorReviewedArticle } from "../../src/types/reviewedArticles";
import { applyCuratedOrder } from "../curatedOrder";
import type { PublicProfileHistoryEntry } from "../data/publicData.changelog";
import type { PublicContributorIdentity } from "../data/publicData.shared";
import { buildMetadataDescription } from "./publicRouteViewModels";
import { getPublicRoutePath, type PublicRouteIdentity } from "./publicSite";
import type { OkRouteResult, RouteMetadataSource } from "./routeLoaderResults";
import { mapArtistPageKeysByProfile } from "../../src/features/replications/galleryFocus";
import { readContributorReplications } from "./routeLoaders.contributorReplications";
import type { LiveLocale } from "./localeHostPolicy";
import {
  getLocalizedEffectArticlesByContributor,
  getLocalizedPublicContributorByKey,
  getLocalizedReportsByContributor,
  localizeContributorReplications,
} from "../translation/localizedRecords";

const REPORT_HREF_PREFIX = "/reports/";


interface ContributorRoutePageProps { profile: NormalizedUserProfile;
history: PublicProfileHistoryEntry[];
bioContent: ReactNode;
reportHrefPrefix: string;
tripReports: ReportCardModel[];
replications: ReplicationWithUrl[];
effectArticles: ContributorEffectCredit[];
reviewedArticles: ContributorReviewedArticle[];
editorNote: UserProfileEditorNote | null;
verifiedReplicator: boolean; }

export type ContributorRouteResult =
  | (OkRouteResult<ContributorRoutePageProps> & {
      socialCardProfileKey: string;
    })
  | {
      kind: "redirect";
      target: string;
      metadata: RouteMetadataSource;
      canonicalRoute: PublicRouteIdentity;
      socialCardProfileKey: string;
    }
  | { kind: "not-found"; normalizedKey: string };

type ContributorIdentityRouteResult =
  | Exclude<ContributorRouteResult, OkRouteResult<ContributorRoutePageProps>>
  | { kind: "ok"; profile: NormalizedUserProfile; artistPageKeys: Map<string, string>;
      deliveredIdentity: PublicContributorIdentity | null;
      metadata: RouteMetadataSource; canonicalRoute: PublicRouteIdentity; socialCardProfileKey: string };

export const loadContributorIdentityRoute = cache(
  async (
    profileKey: string,
    locale: LiveLocale | null = null,
  ): Promise<ContributorIdentityRouteResult> => {
    const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();
    const profile = locale
      ? await getLocalizedPublicContributorByKey(normalizedKey, locale.code)
      : await getPublicContributorByKey(normalizedKey);

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

    const [galleryReplications, contributorDirectory, deliveredIdentity] = await Promise.all([
      getPublicArtistCreditRows(),
      getPublicContributorDirectory(),
      getPublicContributorIdentity(profile.key),
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
    return {
      kind: "ok",
      profile,
      artistPageKeys,
      deliveredIdentity,
      metadata,
      canonicalRoute,
      socialCardProfileKey: profile.key,
    };
  },
);

export const loadContributorRoute = cache(async (
  profileKey: string, locale: LiveLocale | null = null,
): Promise<ContributorRouteResult> => {
    const resolved = await loadContributorIdentityRoute(profileKey, locale);
    if (resolved.kind !== "ok") return resolved;
    const { profile, artistPageKeys, deliveredIdentity, metadata, canonicalRoute } = resolved;

    const staffNote = profile.staffNote?.markdown.trim() ? profile.staffNote : null;

    const [reports, canonicalReplications, effectArticles, reviewedArticles, history, staffNoteSigner] =
      await Promise.all([
        locale
          ? getLocalizedReportsByContributor(profile, locale.code)
          : getReportsByContributor(profile),
        readContributorReplications(profile),
        locale
          ? getLocalizedEffectArticlesByContributor(profile, locale.code)
          : getEffectArticlesByContributor(profile),
        getReviewedArticlesByContributor(profile.key),
        getPublicProfileHistory(profile),
        staffNote ? getPublicContributorByKey("JOSIE") : Promise.resolve(null),
      ]);
    const replications = locale
      ? await localizeContributorReplications(canonicalReplications, locale.code)
      : canonicalReplications;

    const signerArtistKey = staffNoteSigner
      ? artistPageKeys.get(staffNoteSigner.key.trim().toUpperCase()) ?? null
      : null;

    return {
      kind: "ok",
      socialCardProfileKey: profile.key,
      pageProps: {
        profile: {
          ...profile,
          avatarUrl: deliveredIdentity?.avatar_url ?? profile.avatarUrl,
        },
        history,
        bioContent: profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null,
        reportHrefPrefix: REPORT_HREF_PREFIX,
        tripReports: applyCuratedOrder(
          reports.map(toReportCardModel),
          profile.reportOrder,
          (report) => report.slug,
        ),
        replications: orderContributorReplications(replications),
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
                ? getPublicRoutePath(
                    signerArtistKey
                      ? { family: "replicationArtist", params: { key: signerArtistKey } }
                      : { family: "contributor", params: { profileKey: staffNoteSigner.key } },
                  )
                : null,
            }
          : null,
        verifiedReplicator: deliveredIdentity?.verified_replicator === true,
      },
      metadata,
      canonicalRoute,
    };
  },
);
