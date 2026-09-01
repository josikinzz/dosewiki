import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ArtistIdentityHeader } from "@/features/replications/artist/ArtistIdentityHeader";
import { ArtistShowcase } from "@/features/replications/artist/ArtistShowcase";
import {
  buildArtistShowcaseGroup,
  mergeArtistLinks,
  showcaseWorkFromPreview,
} from "@/features/replications/artist/artistPageModel";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import {
  resolveArtistPageProfileKey,
  resolveGalleryFocus,
  type ResolvedGalleryFocus,
} from "@/features/replications/galleryFocus";
import { getReplicationArtistRouteAlias } from "@server/next/publicRouteAliases";
import { buildGalleryBrowseUrl } from "@/features/replications/galleryUrlState";
import {
  viewerCollectionFromGalleryGroups,
  type ReplicationViewerCollection,
} from "@/features/replications/viewer/viewerModel";
import {
  effectNameLookup,
  UNATTRIBUTED_KEY,
} from "@/features/effects/gallery/galleryModel";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import {
  getPublicContributorByKey,
  getPublicContributorIdentity,
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplications,
  type PublicEffectPreview,
} from "@server/convex/publicData";
import {
  buildPublicPageMetadata,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";

/**
 * The Artist Page: one artist's works, addressable as
 * /replications/artist/<key> — every credited artist's single public surface
 * (see the address decision record in
 * src/features/replications/galleryFocus.ts). The key space derives from the
 * works the gallery shows — slugified credit lines plus `unknown` for the
 * unattributed bucket — so an unrecognized key is a real 404, not an empty
 * page. When a Contributor Profile claims the credit line, the identity
 * header is decorated with their avatar, role, bio, and links;
 * /contributors/<key> permanently forwards here for such profiles. The
 * Unattributed bucket gets the same works view but never an identity claim.
 * Advertised in the sitemap from the same gallery corpus, but detail pages
 * scale with reader demand rather than roster size: a real key renders on
 * first request and then enters the hourly ISR cache; all reads sit on the
 * shared hourly `unstable_cache`
 * window. The `?viewer=` deep link is resolved on the client inside
 * ArtistShowcase against the artist's whole collection.
 *
 * Like the playlist pages, this sits outside the `(tabs)` group on purpose: a
 * profile is not a section view, so it gets no "Replications" masthead or tab
 * bar and brings its own `<main>`. The works render as one showcase stage
 * over the whole body of work rather than the browse gallery's masonry: a
 * profile presents a body of work, it is not a querying surface.
 */

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // ~2,000+ credited artists would otherwise prerender on every clean deploy.
  // The sitemap still advertises the full roster from the route plan.
  return [];
}

type ArtistFocusPageProps = {
  params: Promise<{ key: string }>;
};

interface LoadedArtistFocus {
  replications: PublicGalleryReplicationPreview[];
  effects: PublicEffectPreview[];
  contributorDirectory: ContributorDirectory;
  focus: ResolvedGalleryFocus | null;
}

async function loadArtistFocus(key: string): Promise<LoadedArtistFocus> {
  const [replications, effects, contributorDirectory] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
  ]);

  return {
    replications,
    effects,
    contributorDirectory,
    focus: resolveGalleryFocus({ kind: "artist", key }, replications, {
      effects,
      contributorDirectory,
    }),
  };
}

/**
 * A key that resolves to no group is a 404 — unless it is a retired alias
 * (the folded "Anonymous" marker section), whose old address forwards to the
 * page that now holds its works.
 */
function forwardRetiredKeyOr404(key: string): never {
  const aliasTarget = getReplicationArtistRouteAlias(key);
  if (aliasTarget) {
    permanentRedirect(
      getPublicRoutePath({
        family: "replicationArtist",
        params: { key: aliasTarget },
      }),
    );
  }
  notFound();
}

export async function generateMetadata({
  params,
}: ArtistFocusPageProps): Promise<Metadata> {
  const { key } = await params;
  const { focus, contributorDirectory } = await loadArtistFocus(key);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns a bogus key into a real
  // HTTP 404 instead of a soft 404 streamed into an already-committed 200.
  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  const attributed = focus.group.key !== UNATTRIBUTED_KEY;
  const profileKey = resolveArtistPageProfileKey(
    focus.group,
    contributorDirectory,
  );
  return buildPublicPageMetadata({
    title: `${focus.label} Replications`,
    description: attributed
      ? `${focus.group.count} replication ${focus.group.count === 1 ? "work" : "works"} by ${focus.label}: image and video recreations of subjective effects.`
      : "Replication works whose creator is unknown: image and video recreations of subjective effects awaiting attribution.",
    route: { family: "replicationArtist", params: { key } },
    socialImage: profileKey
      ? entitySocialCardImage(
          "contributors",
          profileKey,
          `${focus.label} contributor profile card`,
        )
      : undefined,
  });
}

export default async function ReplicationArtistPage({
  params,
}: ArtistFocusPageProps) {
  const { key } = await params;
  const { effects, contributorDirectory, focus } = await loadArtistFocus(key);

  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  // The claimed Contributor Profile decorates the page; the Unattributed
  // bucket never resolves one (resolveArtistPageProfileKey), and an unclaimed
  // credit renders the same page shape without avatar image, role, or links.
  const profileKey = resolveArtistPageProfileKey(
    focus.group,
    contributorDirectory,
  );
  const profile = profileKey
    ? await getPublicContributorByKey(profileKey)
    : null;
  const identity = profile
    ? await getPublicContributorIdentity(profile.key)
    : null;

  const attributed = focus.group.key !== UNATTRIBUTED_KEY;
  const effectName = effectNameLookup(effects);
  const avatarUrl = identity?.avatar_url ?? profile?.avatarUrl ?? null;
  const sourcePath = getPublicRoutePath({
    family: "replicationArtist",
    params: { key },
  });

  // The whole body of work as one showcase carousel — and one viewer
  // collection over all of it, so every `?viewer=` deep link resolves even
  // when the work sits beyond the filmstrip's cap.
  const group = buildArtistShowcaseGroup(focus.group.items);
  const collectionLabel = attributed
    ? `Works by ${focus.label}`
    : "Unattributed works";
  const collection: ReplicationViewerCollection = {
    ...viewerCollectionFromGalleryGroups(
      [group],
      "effect",
      sourcePath,
      effectName,
      () => avatarUrl,
    ),
    label: collectionLabel,
    kind: "artist",
    grouping: "none",
    editorTarget: attributed
      ? {
          kind: "artist",
          key: profile?.key ?? key,
          label: collectionLabel,
        }
      : undefined,
  };
  const works = group.items
    .slice(0, SHOWCASE_WORK_CAP)
    .map((item) =>
      showcaseWorkFromPreview(item, effectName(item.effect_slug), avatarUrl),
    );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full px-4 pb-20 pt-4 focus:outline-none 2xl:px-8"
    >
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ArtistIdentityHeader
          name={focus.label}
          browseAllHref={buildGalleryBrowseUrl({ view: "artist" })}
          attributed={attributed}
          avatarUrl={avatarUrl}
          verifiedReplicator={identity?.verified_replicator === true}
          role={profile?.role}
          bio={
            profile?.hasCustomBio ? (
              <ProfileBioMarkdown content={profile.bio} />
            ) : attributed ? null : (
              <p>
                Image and video recreations of subjective effects whose creator
                is unknown, awaiting attribution.
              </p>
            )
          }
          links={mergeArtistLinks(
            profile?.links ?? [],
            focus.group.externalUrl,
          )}
          counts={{
            count: focus.group.count,
            imageCount: focus.group.imageCount,
            videoCount: focus.group.videoCount,
          }}
        />
        <ArtistShowcase
          label={collectionLabel}
          works={works}
          totalCount={group.count}
          collection={collection}
          sourcePath={sourcePath}
        />
      </div>
    </main>
  );
}
