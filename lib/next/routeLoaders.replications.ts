import "server-only";

import { cache } from "react";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationBySlug,
} from "@server/convex/publicData";
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
  avatarUrl: string | null;
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
  async (slug: string): Promise<ReplicationRouteResult> => {
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

    const replication = await getPublicReplicationBySlug(slug);
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
    const creator = hasKnownCreator(replication.artist)
      ? replication.artist.trim()
      : null;
    const [effect, contributorProfiles] = await Promise.all([
      effectSlug ? getPublicEffectBySlug(effectSlug) : Promise.resolve(null),
      creator ? getPublicContributorProfiles() : Promise.resolve([]),
    ]);
    const artistProfile = creator
      ? findContributorProfileByAuthorName(contributorProfiles, creator)
      : null;
    const subject = effect?.name ?? null;

    return {
      kind: "ok",
      pageProps: {
        replication,
        effectName: subject,
        effectSlug,
        artistProfileHref:
          artistPageHrefForWork(replication) ??
          (artistProfile
            ? getPublicRoutePath({
                family: "contributor",
                params: { profileKey: artistProfile.key },
              })
            : null),
        avatarUrl: artistProfile?.avatarUrl ?? null,
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
