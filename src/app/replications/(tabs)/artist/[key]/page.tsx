import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ArtistFocusIdentity } from "@/features/replications/ArtistFocusIdentity";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import {
  getRetiredArtistKeyAlias,
  resolveArtistPageProfileKey,
  resolveGalleryFocus,
  type ResolvedGalleryFocus,
} from "@/features/replications/galleryFocus";
import { UNATTRIBUTED_KEY } from "@/features/effects/gallery/galleryModel";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import {
  getPublicContributorByKey,
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplications,
  type PublicEffectPreview,
} from "@server/convex/publicData";
import { buildPublicPageMetadata, getPublicRoutePath } from "@server/next/publicSite";
import { getStaticReplicationArtistParams } from "@server/next/staticParams";

/**
 * The Artist Page: one artist's works, addressable as
 * /replications/artist/<key> — every credited artist's single public surface
 * (see the address decision record in
 * src/features/replications/galleryFocus.ts). The key space derives from the
 * works the gallery shows — slugified credit lines plus `unknown` for the
 * unattributed bucket — so an unrecognized key is a real 404, not an empty
 * page. When a Contributor Profile claims the credit line, the focus view is
 * decorated with their avatar, role, bio, and links; /contributors/<key>
 * permanently forwards here for such profiles. The Unattributed bucket gets
 * the same works view but never an identity claim. Prerendered from the same
 * gallery corpus the sitemap advertises and revalidated hourly; the `?type=`
 * filter is read on the client inside the explorer's Suspense boundary. All
 * reads sit on the shared hourly `unstable_cache` window.
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticReplicationArtistParams();
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
  const aliasTarget = getRetiredArtistKeyAlias(key);
  if (aliasTarget) {
    permanentRedirect(
      getPublicRoutePath({ family: "replicationArtist", params: { key: aliasTarget } }),
    );
  }
  notFound();
}

export async function generateMetadata({ params }: ArtistFocusPageProps): Promise<Metadata> {
  const { key } = await params;
  const { focus } = await loadArtistFocus(key);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns a bogus key into a real
  // HTTP 404 instead of a soft 404 streamed into an already-committed 200.
  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  const attributed = focus.group.key !== UNATTRIBUTED_KEY;
  return buildPublicPageMetadata({
    title: `${focus.label} — Replications | ${SITE_FLAVOR_CONFIG.name}`,
    description: attributed
      ? `${focus.group.count} replication ${focus.group.count === 1 ? "work" : "works"} by ${focus.label}: image and video recreations of subjective effects.`
      : "Replication works whose creator is unknown: image and video recreations of subjective effects awaiting attribution.",
    route: { family: "replicationArtist", params: { key } },
  });
}

export default async function ReplicationArtistPage({ params }: ArtistFocusPageProps) {
  const { key } = await params;
  const { replications, effects, contributorDirectory, focus } = await loadArtistFocus(key);

  if (!focus) {
    forwardRetiredKeyOr404(key);
  }

  // The claimed Contributor Profile decorates the page; the Unattributed
  // bucket never resolves one (resolveArtistPageProfileKey), and an unclaimed
  // credit renders the same page shape without a card.
  const profileKey = resolveArtistPageProfileKey(focus.group, contributorDirectory);
  const profile = profileKey ? await getPublicContributorByKey(profileKey) : null;

  return (
    <ReplicationsGalleryExplorer
      replications={replications}
      effects={effects}
      contributorDirectory={contributorDirectory}
      focus={{ kind: "artist", key }}
      focusIdentity={
        profile ? (
          <ArtistFocusIdentity
            profile={profile}
            bio={profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null}
          />
        ) : null
      }
    />
  );
}
