import "server-only";

import { cache } from "react";
import {
  getPublicContributorByKey,
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationIdentityAttribution,
  getPublicReplicationBySlug,
  type PublicReplicationIdentityAttribution,
} from "@server/data/publicData";
import { getLocalizedPublicEffectBySlug, getLocalizedPublicReplicationBySlug } from "@server/translation/localizedRecords";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import {
  isPublishableReplication,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { hasKnownCreator } from "../../src/features/effects/components/replicationCredit";
import { artistPageHrefForWork } from "../../src/features/replications/galleryFocus";
import {
  resolveEffectCategories,
  type EffectCategoryLink,
} from "../../src/features/effects/pages/replicationSubject";
import { findContributorProfileByAuthorName } from "../contributorProfileIdentity";
import { getReplicationRouteAlias } from "./publicRouteAliases";
import { getPublicRoutePath } from "./publicSite";
import {
  type NotFoundRouteResult,
  type OkRouteResult,
  type RedirectRouteResult,
  toRouteMetadata,
} from "./routeLoaderResults";

interface ReplicationPageProps {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  artistProfileHref: string | null;
  identityAttribution: PublicReplicationIdentityAttribution | null;
  effectCategories: EffectCategoryLink[];
}

export type ReplicationRouteResult =
  | OkRouteResult<ReplicationPageProps>
  | RedirectRouteResult
  | NotFoundRouteResult;

/** Rows carry `effect_slug: "unknown"` when nothing real is attached. */
const hasRealEffect = (effectSlug?: string | null): effectSlug is string =>
  Boolean(effectSlug && effectSlug !== "unknown");

export const loadReplicationRoute = cache(
  async (slug: string, locale: LiveLocale | null = null): Promise<ReplicationRouteResult> => {
    const aliasTarget = getReplicationRouteAlias(slug);
    if (aliasTarget) {
      const canonicalRoute = {
        family: "replication" as const,
        params: { slug: aliasTarget },
      };
      return {
        kind: "redirect",
        target: getPublicRoutePath(canonicalRoute),
        metadata: toRouteMetadata({
          title: "Replication",
          description: "Replication permalink.",
        }),
        canonicalRoute,
      };
    }

    const replication = locale
      ? await getLocalizedPublicReplicationBySlug(slug, locale.code)
      : await getPublicReplicationBySlug(slug);
    if (
      !replication ||
      !replication.url ||
      !isPublishableReplication(replication)
    ) {
      return { kind: "not-found" };
    }

    const effectSlug = hasRealEffect(replication.effect_slug)
      ? replication.effect_slug
      : null;
    const legacyCreator = hasKnownCreator(replication.artist)
      ? replication.artist.trim()
      : null;
    const directArtistHref = artistPageHrefForWork(replication);
    const [effect, identityAttribution] = await Promise.all([
      effectSlug
        ? locale ? getLocalizedPublicEffectBySlug(effectSlug, locale.code) : getPublicEffectBySlug(effectSlug)
        : Promise.resolve(null),
      getPublicReplicationIdentityAttribution(replication._id),
    ]);
    const creator = identityAttribution?.creator.display_name.trim() || legacyCreator;
    const needsContributorFallback =
      Boolean(creator) &&
      (identityAttribution?.proven_different_creator === true || directArtistHref === null);
    const identityProfile = needsContributorFallback && identityAttribution?.creator.profile_key
      ? await getPublicContributorByKey(identityAttribution.creator.profile_key)
      : null;
    const artistProfile = identityProfile ?? (
      needsContributorFallback && creator
        ? findContributorProfileByAuthorName(await getPublicContributorProfiles(), creator)
        : null
    );
    const subject = effect?.name ?? null;

    return {
      kind: "ok",
      pageProps: {
        replication,
        effectName: subject,
        effectSlug,
        artistProfileHref:
          (identityAttribution?.proven_different_creator
            ? null
            : directArtistHref) ??
          (artistProfile
            ? getPublicRoutePath({
                family: "contributor",
                params: { profileKey: artistProfile.key },
              })
            : null),
        identityAttribution,
        effectCategories: effect ? resolveEffectCategories(effect.tags) : [],
      },
      metadata: toRouteMetadata({
        title: creator
          ? `${replication.title} by ${creator}`
          : replication.title,
        description: subject
          ? `${replication.title}${creator ? ` by ${creator}` : ""} - a replication of the subjective effect ${subject}.`
          : `${replication.title}${creator ? ` by ${creator}` : ""} - a subjective effect replication.`,
      }),
      canonicalRoute: { family: "replication", params: { slug } },
    };
  },
);
