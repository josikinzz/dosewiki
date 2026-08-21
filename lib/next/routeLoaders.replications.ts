import "server-only";

import { cache } from "react";
import {
  getPublicContributorDirectory,
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationBySlug,
  getPublicReplications,
  getPublicReplicationsByEffect,
  getPublicReplicationsForSubstance,
  getPublicSubstanceBySlug,
  getPublicSubstances,
} from "@server/convex/publicData";
import {
  isPublishableReplication,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { hasKnownCreator } from "../../src/features/effects/components/replicationCredit";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  selectReplicationViewerSet,
  type ReplicationViewerItem,
  type ReplicationViewerSet,
} from "../../src/features/replications/viewer/viewerModel";
import { artistPageHrefForWork } from "../../src/features/replications/galleryFocus";
import {
  UNATTRIBUTED_KEY,
  artistIdentity,
  artistUrlKey,
  isWithheldFromArtistViews,
} from "../../src/features/effects/gallery/galleryModel";
import {
  orderContributorReplications,
  orderEffectReplications,
} from "../../src/features/effects/gallery/replicationDetailModel";
import {
  resolveEffectCategories,
  type EffectCategoryLink,
} from "../../src/features/effects/pages/replicationSubject";
import { findContributorProfileByAuthorName } from "../contributorProfileIdentity";
import { resolveContributorReplicationOrder } from "../contributorDirectory";
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
  /** Display name of the owning effect, absent when the row has no real effect. */
  effectName: string | null;
  effectSlug: string | null;
  /**
   * The credited artist's Artist Page; their contributor profile only for a
   * work withheld from artist views (whose artist may hold no page), null when
   * the credit names nobody.
   */
  artistProfileHref: string | null;
  /** The claiming profile's avatar for the compact byline; null when unclaimed or avatar-less. */
  avatarUrl: string | null;
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

  // A named credit still resolves to a profile — that is what links the
  // byline and every walk member's tile to its maker — but it no longer picks
  // the walk. The bare permalink walks the work's own effect: a pasted link
  // carries no browsing context, and the artist walk is opted into through
  // the URL (`?set=artist:<key>`) by the surfaces that actually browse an
  // artist.
  const artistProfile = creator
    ? findContributorProfileByAuthorName(contributorProfiles, creator)
    : null;

  const subject = effect?.name ?? null;

  // The viewer names each member's own effect. The walk is the active work's
  // effect gallery, so every member shares the one effect already read above;
  // `toItem` only has to guard against a sibling row carrying a different (or
  // no real) effect slug, which names nothing rather than lying.
  const toItem = (row: ReplicationWithUrl): ReplicationViewerItem => {
    const rowEffectSlug = hasRealEffect(row.effect_slug) ? row.effect_slug : null;
    const rowEffect = rowEffectSlug === effectSlug ? effect : null;
    const rowCreator = hasKnownCreator(row.artist) ? row.artist.trim() : null;
    const rowProfile = rowCreator
      ? findContributorProfileByAuthorName(contributorProfiles, rowCreator)
      : null;

    return {
      replication: row,
      effectName: rowEffect?.name ?? null,
      effectSlug: rowEffectSlug,
      effectCategories: rowEffect ? resolveEffectCategories(rowEffect.tags) : [],
      // The byline's destination is the Artist Page (T-4: every credited
      // artist's one public surface). A withheld work cannot prove that page
      // exists, so it keeps the claimed-profile link — live for exactly those
      // artists, because the profile only forwards when a page exists.
      artistProfileHref:
        artistPageHrefForWork(row) ??
        (rowProfile
          ? getPublicRoutePath({ family: "contributor", params: { profileKey: rowProfile.key } })
          : null),
      avatarUrl: rowProfile?.avatarUrl ?? null,
    };
  };

  const viewerSet = selectReplicationViewerSet({
    slug,
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
      artistProfileHref:
        artistPageHrefForWork(replication) ??
        (artistProfile
          ? getPublicRoutePath({ family: "contributor", params: { profileKey: artistProfile.key } })
          : null),
      avatarUrl: artistProfile?.avatarUrl ?? null,
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

/**
 * A scoped walk shared by the playlist pages and the viewer's re-scope APIs
 * (`/api/v1/substances|artists/.../replications`). Both surfaces read the same
 * builder, so the set a playlist page server-renders and the set the viewer
 * fetches after hydration can never disagree — which is what makes a shared
 * playlist URL reproduce the same walk for every reader.
 */
export interface ReplicationViewerWalk {
  scopeLabel: string | null;
  items: ReplicationViewerItem[];
}

/**
 * Project ordered walk rows into viewer items. Each slide's caption names the
 * work's own effect (`effectSlugOf` decides which slug that is — substance
 * walks fall back to the matched provenance slug), so every distinct effect in
 * the set is read once; profiles are read only when someone in the walk is a
 * named person, because an unattributed credit can never resolve to one.
 */
async function projectViewerItems(
  rows: readonly ReplicationWithUrl[],
  effectSlugOf: (row: ReplicationWithUrl) => string | null,
): Promise<ReplicationViewerItem[]> {
  const distinctEffectSlugs = [
    ...new Set(rows.map(effectSlugOf).filter((slug): slug is string => Boolean(slug))),
  ];
  const anyKnownCreator = rows.some((row) => hasKnownCreator(row.artist));
  const [effectEntries, contributorProfiles] = await Promise.all([
    Promise.all(
      distinctEffectSlugs.map(async (effectSlug) =>
        [effectSlug, await getPublicEffectBySlug(effectSlug)] as const,
      ),
    ),
    anyKnownCreator ? getPublicContributorProfiles() : Promise.resolve([]),
  ]);
  const effectBySlug = new Map(effectEntries);

  return rows.map((row) => {
    const effectSlug = effectSlugOf(row);
    const effect = effectSlug ? (effectBySlug.get(effectSlug) ?? null) : null;
    const creator = hasKnownCreator(row.artist) ? row.artist.trim() : null;
    const profile = creator
      ? findContributorProfileByAuthorName(contributorProfiles, creator)
      : null;
    return {
      replication: row,
      effectName: effect?.name ?? null,
      effectSlug,
      effectCategories: effect ? resolveEffectCategories(effect.tags) : [],
      // Artist Page first; claimed-profile fallback for withheld works — see
      // the permalink loader's byline note.
      artistProfileHref:
        artistPageHrefForWork(row) ??
        (profile
          ? getPublicRoutePath({ family: "contributor", params: { profileKey: profile.key } })
          : null),
      avatarUrl: profile?.avatarUrl ?? null,
    };
  });
}

/** The permalink loader's defence against a storage id that resolved to nothing. */
const isRenderable = (row: ReplicationWithUrl): boolean =>
  Boolean(row.url) && isPublishableReplication(row);

/**
 * The substance walk: the same ordered gallery the article's Replication
 * Showcase renders, reshaped into viewer items. `null` is one answer for
 * "there is no substance walk here" — unknown substance and a substance whose
 * curated gallery is empty look identical, which is exactly the honest 404 the
 * playlist page wants.
 */
export const loadSubstanceReplicationWalk = cache(
  async (slug: string): Promise<ReplicationViewerWalk | null> => {
    const [gallery, substance] = await Promise.all([
      getPublicReplicationsForSubstance(slug),
      // Read the article only for its display name: the scope label should say
      // "LSD", not "lsd".
      getPublicSubstanceBySlug(slug),
    ]);

    const rows = gallery.items.filter((item) => isRenderable(item.replication));
    if (rows.length === 0) {
      return null;
    }

    // A row with no real effect of its own falls back to the substance-derived
    // effect that matched it here, which is at least true of the work rather
    // than blank.
    const captionEffectSlug = new Map(
      rows.map((item) => [
        item.replication.slug,
        hasRealEffect(item.replication.effect_slug)
          ? item.replication.effect_slug
          : item.provenance.effectSlug,
      ]),
    );

    return {
      scopeLabel: substance?.title ?? slug,
      items: await projectViewerItems(
        rows.map((item) => item.replication),
        (row) => captionEffectSlug.get(row.slug) ?? null,
      ),
    };
  },
);

/**
 * The artist walk: the same set, in the same order, as the gallery's artist
 * grouping — the shared newest/title sort with the claimed contributor's
 * curated `replicationOrder` leading it. The key space is `artistUrlKey`,
 * exactly the keys the Artist Page answers to. Works withheld from artist
 * views stay out, as they stay out of every artist surface.
 */
export const loadArtistReplicationWalk = cache(
  async (key: string): Promise<ReplicationViewerWalk | null> => {
    const [replications, contributorDirectory] = await Promise.all([
      getPublicReplications(),
      getPublicContributorDirectory(),
    ]);

    const rows = replications.filter(
      (row) =>
        isRenderable(row) &&
        !isWithheldFromArtistViews(row) &&
        artistUrlKey(row.artist) === key,
    );
    if (rows.length === 0) {
      return null;
    }

    const identity = artistIdentity(rows[0].artist);
    // The Unattributed bucket is a sentinel, not a credit line, so it never
    // looks up a curation.
    const curatedOrder =
      identity.key === UNATTRIBUTED_KEY
        ? undefined
        : resolveContributorReplicationOrder(identity.label, contributorDirectory);

    return {
      scopeLabel: identity.label,
      items: await projectViewerItems(
        orderContributorReplications(rows, curatedOrder),
        (row) => (hasRealEffect(row.effect_slug) ? row.effect_slug : null),
      ),
    };
  },
);

export interface ReplicationPlaylistPageProps {
  /** The playlist's full ordered walk; the page opens the viewer at `items[0]`. */
  viewerSet: ReplicationViewerSet;
  /** Display name of the playlist's subject (effect or substance). */
  scopeLabel: string;
}

export type ReplicationPlaylistRouteResult =
  | OkRouteResult<ReplicationPlaylistPageProps>
  | NotFoundRouteResult;

const playlistMetadata = (scopeLabel: string, count: number, subjectClause: string) =>
  toRouteMetadata({
    title: `${scopeLabel} — Replications`,
    description: `Watch ${count} replication ${count === 1 ? "work" : "works"} ${subjectClause} in the immersive viewer: image and video recreations of subjective effects as artists experienced them.`,
  });

/**
 * The effect playlist page (`/replications/effect/<slug>`): that effect's
 * whole gallery, in its curated order, opening the viewer at the first work.
 * The slug space derives from the works themselves — an effect with no
 * renderable replication is a real 404 here even when its article exists.
 */
export const loadEffectPlaylistRoute = cache(
  async (slug: string): Promise<ReplicationPlaylistRouteResult> => {
    const [effect, works] = await Promise.all([
      getPublicEffectBySlug(slug),
      getPublicReplicationsByEffect(slug),
    ]);

    const rows = works.filter(isRenderable);
    if (rows.length === 0) {
      return { kind: "not-found" };
    }

    // Humanise the slug when no effect article backs it — same fallback the
    // gallery's effect grouping uses (`effectNameLookup`).
    const scopeLabel = effect?.name ?? slug.replace(/-/g, " ");
    const items = await projectViewerItems(
      orderEffectReplications(rows, effect?.gallery_order),
      (row) => (hasRealEffect(row.effect_slug) ? row.effect_slug : null),
    );

    return {
      kind: "ok",
      pageProps: {
        viewerSet: { scope: "effect", scopeLabel, items },
        scopeLabel,
      },
      metadata: playlistMetadata(scopeLabel, items.length, `depicting ${scopeLabel}`),
      canonicalRoute: { family: "replicationEffect", params: { slug } },
    };
  },
);

/**
 * The substance playlist page (`/replications/substance/<slug>`): the curated
 * showcase gallery as a walk, opening the viewer at the first work. An
 * uncurated or unknown substance has no walk and 404s honestly.
 */
export const loadSubstancePlaylistRoute = cache(
  async (slug: string): Promise<ReplicationPlaylistRouteResult> => {
    const walk = await loadSubstanceReplicationWalk(slug);
    if (!walk) {
      return { kind: "not-found" };
    }

    const scopeLabel = walk.scopeLabel ?? slug;
    return {
      kind: "ok",
      pageProps: {
        viewerSet: { scope: "substance", scopeLabel, items: walk.items },
        scopeLabel,
      },
      metadata: playlistMetadata(scopeLabel, walk.items.length, `matched to ${scopeLabel}`),
      canonicalRoute: { family: "replicationSubstance", params: { slug } },
    };
  },
);

/** Reads per prerender pass kept polite: the per-substance gallery reads run in small batches. */
const SUBSTANCE_PARAM_BATCH = 8;

/**
 * The substance playlist's prerender space: every substance whose curated
 * gallery holds at least one renderable work. The per-slug reads are the same
 * `unstable_cache` windows the substance articles' showcase sections already
 * warm during a build, so this enumeration costs the build almost nothing new.
 */
export const loadSubstancePlaylistStaticParams = cache(
  async (): Promise<{ slug: string }[]> => {
    const substances = await getPublicSubstances();
    const slugs = substances.map(({ slug }) => slug).filter(Boolean);

    const params: { slug: string }[] = [];
    for (let start = 0; start < slugs.length; start += SUBSTANCE_PARAM_BATCH) {
      const batch = slugs.slice(start, start + SUBSTANCE_PARAM_BATCH);
      const galleries = await Promise.all(
        batch.map(async (slug) => {
          const gallery = await getPublicReplicationsForSubstance(slug);
          return gallery.items.some((item) => isRenderable(item.replication)) ? slug : null;
        }),
      );
      for (const slug of galleries) {
        if (slug) params.push({ slug });
      }
    }
    return params;
  },
);
