import "server-only";

import { cache } from "react";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationBySlug,
  getPublicReplicationsByEffect,
} from "@server/convex/publicData";
import {
  isPublishableReplication,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { hasKnownCreator } from "../../src/features/effects/components/replicationCredit";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { orderContributorWorksFeaturedFirst } from "../../src/features/effects/gallery/replicationDetailModel";
import {
  selectReplicationViewerSet,
  type ReplicationViewerItem,
  type ReplicationViewerSet,
} from "../../src/features/replications/viewer/viewerModel";
import { EFFECT_INDEX_FEATURED_REPLICATION_SLUGS } from "./effectIndexHome";
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
import { readContributorReplications } from "./routeLoaders.contributorReplications";

export interface ReplicationPageProps {
  replication: ReplicationWithUrl;
  /** Display name of the owning effect, absent when the row has no real effect. */
  effectName: string | null;
  effectSlug: string | null;
  /** Profile page of the credited artist, absent when no profile claims them. */
  artistProfileHref: string | null;
  effectCategories: EffectCategoryLink[];
  viewerSet: ReplicationViewerSet;
}

export type ReplicationRouteResult =
  | OkRouteResult<ReplicationPageProps>
  | RedirectRouteResult
  | NotFoundRouteResult;

/** Rows carry `effect_slug: "unknown"` when nothing real is attached. */
const hasRealEffect = (effectSlug?: string | null): effectSlug is string =>
  Boolean(effectSlug && effectSlug !== "unknown");


export const loadReplicationRoute = cache(async (slug: string): Promise<ReplicationRouteResult> => {
  // Slug normalisation rewrote a chunk of filename-derived URLs. Anything already
  // shared under the old slug has to keep resolving, so redirect before reading.
  const aliasTarget = getReplicationRouteAlias(slug);
  if (aliasTarget) {
    const canonicalRoute = { family: "replication" as const, params: { slug: aliasTarget } };
    return {
      kind: "redirect",
      target: getPublicRoutePath(canonicalRoute),
      metadata: toRouteMetadata({ title: "Replication", description: "Replication permalink." }),
      canonicalRoute,
    };
  }

  const replication = await getPublicReplicationBySlug(slug);

  // Three ways a stored row has no page here, all answered where the route plan
  // already omits it so a direct hit 404s rather than rendering:
  //
  //  - no resolvable asset: the permalink would be a broken image.
  //  - a figure: this page asserts what the row *is*, in prose ("a replication
  //    of the subjective effect X"), in its `<title>`, and in JSON-LD naming it
  //    an ImageObject that replicates that effect. Those are claims published to
  //    crawlers and aggregators, and none of them is true of a diagram.
  //  - a media kind nothing here can draw: the page would hand an audio file to
  //    `<AppImage>` under a pill reading "Image".
  //
  // `isPublishableReplication` is the same predicate the list reads use, so the
  // permalink and the gallery can never disagree about what is published.
  if (!replication || !replication.url || !isPublishableReplication(replication)) {
    return { kind: "not-found" };
  }

  const effectSlug = hasRealEffect(replication.effect_slug) ? replication.effect_slug : null;
  const creator = hasKnownCreator(replication.artist) ? replication.artist.trim() : null;

  const [effect, siblings, profilesForCreator] = await Promise.all([
    effectSlug ? getPublicEffectBySlug(effectSlug) : Promise.resolve(null),
    effectSlug ? getPublicReplicationsByEffect(effectSlug) : Promise.resolve([]),
    // Only a credit that names a person can resolve to a profile; the
    // unattributed markers never match one, so an unattributed row skips the
    // read rather than paying for a lookup that cannot succeed.
    creator ? getPublicContributorProfiles() : Promise.resolve(null),
  ]);

  // The viewer credits every member of the walk, not just the active row: an
  // unattributed piece still sits between attributed siblings whose tiles
  // should link to their makers. So profiles are also read when anyone in the
  // fallback effect walk is a named person. The read is react-cached, so this
  // costs nothing when the active creator already triggered it above.
  const contributorProfiles: NormalizedUserProfile[] =
    profilesForCreator ??
    (siblings.some((sibling) => hasKnownCreator(sibling.artist))
      ? await getPublicContributorProfiles()
      : []);

  const artistProfile = creator
    ? findContributorProfileByAuthorName(contributorProfiles, creator)
    : null;
  // A profile is what turns a credit line into a body of work — it carries the
  // aliases the join matches on. A named credit nobody has claimed therefore has
  // no "other works" set to offer, and keeps the effect walk below.
  // Ordered the same way the profile rail orders them. Someone arrives here by
  // clicking a tile in that rail, so if "next" did not land on the tile that sat
  // beside the one they clicked, the two surfaces would disagree about what
  // comes after what — which is the kind of thing that reads as a bug rather
  // than as a different ordering policy.
  // The artist's own curation is handed to the walk rather than applied here,
  // because the walk re-sorts the set it is given; passing it through
  // `artistOrder` is what keeps the pinned run identical on both surfaces.
  const artistWorks = artistProfile
    ? orderContributorWorksFeaturedFirst(
        await readContributorReplications(artistProfile),
        EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
      )
    : [];

  const subject = effect?.name ?? null;

  // The viewer names each member's own effect, and an artist walk spans
  // effects. Every distinct slug that could appear in the chosen walk is read
  // once up front — `getPublicEffectBySlug` is react-cached and the union is at
  // most the artist's few distinct effects plus the active one — so the walk
  // selector stays synchronous. Siblings all belong to the active effect, so
  // the active slug alone covers the effect walk.
  const walkEffectSlugs = new Set<string>();
  if (effectSlug) walkEffectSlugs.add(effectSlug);
  for (const work of artistWorks) {
    if (hasRealEffect(work.effect_slug)) walkEffectSlugs.add(work.effect_slug);
  }
  const walkEffects = new Map(
    await Promise.all(
      [...walkEffectSlugs].map(
        async (walkSlug) => [walkSlug, await getPublicEffectBySlug(walkSlug)] as const,
      ),
    ),
  );

  const toItem = (row: ReplicationWithUrl): ReplicationViewerItem => {
    const rowEffectSlug = hasRealEffect(row.effect_slug) ? row.effect_slug : null;
    const rowEffect = rowEffectSlug ? (walkEffects.get(rowEffectSlug) ?? null) : null;
    const rowCreator = hasKnownCreator(row.artist) ? row.artist.trim() : null;
    const rowProfile = rowCreator
      ? findContributorProfileByAuthorName(contributorProfiles, rowCreator)
      : null;

    return {
      replication: row,
      effectName: rowEffect?.name ?? null,
      effectSlug: rowEffectSlug,
      effectCategories: rowEffect ? resolveEffectCategories(rowEffect.tags) : [],
      artistProfileHref: rowProfile
        ? getPublicRoutePath({ family: "contributor", params: { profileKey: rowProfile.key } })
        : null,
    };
  };

  const viewerSet = selectReplicationViewerSet({
    slug,
    artistWorks,
    artistName: artistProfile?.displayName ?? null,
    artistOrder: artistProfile?.replicationOrder,
    effectWorks: siblings,
    effectName: subject,
    galleryOrder: effect?.gallery_order,
    toItem,
  });

  return {
    kind: "ok",
    pageProps: {
      replication,
      effectName: subject,
      effectSlug,
      artistProfileHref: artistProfile
        ? getPublicRoutePath({ family: "contributor", params: { profileKey: artistProfile.key } })
        : null,
      effectCategories: effect ? resolveEffectCategories(effect.tags) : [],
      viewerSet,
    },
    metadata: toRouteMetadata({
      title: creator ? `${replication.title} by ${creator}` : replication.title,
      description: subject
        ? `${replication.title}${creator ? ` by ${creator}` : ""} — a replication of the subjective effect ${subject}.`
        : `${replication.title}${creator ? ` by ${creator}` : ""} — a subjective effect replication.`,
    }),
    canonicalRoute: { family: "replication", params: { slug } },
  };
});
