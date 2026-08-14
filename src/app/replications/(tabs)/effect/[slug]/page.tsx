import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { resolveGalleryFocus, type ResolvedGalleryFocus } from "@/features/replications/galleryFocus";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { GalleryReplication } from "@/types/replications";
import {
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplications,
  type PublicEffectPreview,
} from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";

/**
 * Focused gallery view: one effect's works, addressable as
 * /replications/effect/<slug> (PRD T7 / prototype P4). The slug space derives
 * from the works the gallery shows — an effect with no visible replication is
 * a real 404 here even when its article exists (the gallery has nothing to
 * show for it). All reads sit on the shared hourly `unstable_cache` window.
 */

type EffectFocusPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

interface LoadedEffectFocus {
  replications: GalleryReplication[];
  effects: PublicEffectPreview[];
  contributorDirectory: ContributorDirectory;
  focus: ResolvedGalleryFocus | null;
}

async function loadEffectFocus(slug: string): Promise<LoadedEffectFocus> {
  const [replications, effects, contributorDirectory] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
  ]);

  return {
    replications,
    effects,
    contributorDirectory,
    focus: resolveGalleryFocus({ kind: "effect", key: slug }, replications, {
      effects,
      contributorDirectory,
    }),
  };
}

export async function generateMetadata({ params }: EffectFocusPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { focus } = await loadEffectFocus(slug);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns a bogus slug into a real
  // HTTP 404 instead of a soft 404 streamed into an already-committed 200.
  if (!focus) {
    notFound();
  }

  return buildPublicPageMetadata({
    title: `${focus.label} — Replications | ${SITE_FLAVOR_CONFIG.name}`,
    description: `${focus.group.count} replication ${focus.group.count === 1 ? "work" : "works"} depicting ${focus.label}: image and video recreations of the effect as artists experienced it.`,
    route: { family: "replicationEffect", params: { slug } },
  });
}

export default async function ReplicationEffectPage({ params, searchParams }: EffectFocusPageProps) {
  const { slug } = await params;
  // Awaited so the route renders per request and the explorer's
  // `useSearchParams` (the `?type=` filter) is already applied in the HTML.
  await searchParams;
  const { replications, effects, contributorDirectory, focus } = await loadEffectFocus(slug);

  if (!focus) {
    notFound();
  }

  return (
    <ReplicationsGalleryExplorer
      replications={replications}
      effects={effects}
      contributorDirectory={contributorDirectory}
      focus={{ kind: "effect", key: slug }}
    />
  );
}
