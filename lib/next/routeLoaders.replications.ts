import "server-only";

import { cache } from "react";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationIdentityAttribution,
  getPublicReplicationBySlug,
  type PublicReplicationIdentityAttribution,
} from "@server/convex/publicData";
import { getLocalizedEffectNames, getLocalizedPublicReplicationBySlug } from "@server/translation/localizedRecords";
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

export interface ReplicationPageProps {
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
    const [effect, contributorProfiles, identityAttribution] = await Promise.all([
      effectSlug ? getPublicEffectBySlug(effectSlug) : Promise.resolve(null),
      legacyCreator ? getPublicContributorProfiles() : Promise.resolve([]),
      getPublicReplicationIdentityAttribution(replication._id),
    ]);
    const creator = identityAttribution?.creator.display_name.trim() || legacyCreator;
    const identityProfile = identityAttribution?.creator.profile_key
      ? contributorProfiles.find(
          (profile) => profile.key === identityAttribution.creator.profile_key,
        ) ?? null
      : null;
    const artistProfile =
      identityProfile ??
      (creator
        ? findContributorProfileByAuthorName(contributorProfiles, creator)
        : null);
    // The mirror's "Represents" line reads the effect's stored title segment,
    // so it names the effect exactly as its article heading does.
    const subject = effect && locale
      ? (await getLocalizedEffectNames([effect.name], locale.code)).get(effect.name) ?? effect.name
      : effect?.name ?? null;

    return {
      kind: "ok",
      pageProps: {
        replication,
        effectName: subject,
        effectSlug,
        artistProfileHref:
          (identityAttribution?.proven_different_creator
            ? null
            : artistPageHrefForWork(replication)) ??
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
          ? `${replication.title}${creator ? ` by ${creator}` : ""} — a replication of the subjective effect ${subject}.`
          : `${replication.title}${creator ? ` by ${creator}` : ""} — a subjective effect replication.`,
      }),
      canonicalRoute: { family: "replication", params: { slug } },
    };
  },
);
