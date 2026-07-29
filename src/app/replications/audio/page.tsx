import type { Metadata } from "next";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { getPublicEffectArticles } from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { AudioReplicationCard } from "@/features/effects/components/AudioReplicationCard";
import {
  collectAudioReplications,
  countAudioReplicationArtists,
} from "@/features/effects/audioReplicationIndex";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Audio Replications | ${SITE_FLAVOR_CONFIG.name}`,
  description:
    "Audio recreations of subjective effects, credited to the artists who made them and preserved from the Effect Index archive.",
  route: { family: "replicationAudio" },
});

export default async function ReplicationAudioPage() {
  const effects = await getPublicEffectArticles();
  const entries = collectAudioReplications(effects);
  const artistCount = countAudioReplicationArtists(entries);

  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader
        title="Audio"
        description="Audio recreations of what a subjective effect sounds like, made by the artists credited on each clip."
        icon="lucide:audio-lines"
        prominentMobileIcon
      />

      {entries.length === 0 ? (
        <SectionCard>
          <SearchEmptyState
            icon="lucide:volume-off"
            title="No audio replications yet"
            description="Audio replications have not been published yet. Check back soon."
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <p className="theme-text-faint text-xs tabular-nums">
            {entries.length} {entries.length === 1 ? "clip" : "clips"}
            {artistCount > 0 ? ` · ${artistCount} ${artistCount === 1 ? "artist" : "artists"}` : ""}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {entries.map((entry) => (
              <AudioReplicationCard
                key={`${entry.effectSlug}-${entry.audio.title}`}
                audio={entry.audio}
                contextLabel={
                  <Link
                    href={`/effects/${entry.effectSlug}`}
                    className="theme-accent-heading text-xs font-medium transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  >
                    {entry.effectName}
                  </Link>
                }
              />
            ))}
          </div>

          <p className="theme-text-ghost mt-8 text-xs leading-5">
            Audio replications are credited to their creator when known. Rights remain with the
            original creator or rightsholder unless an individual clip states another license. See
            the{" "}
            <Link href="/docs/license#replication-media-terms" className={proseLinkClassName}>
              licensing terms
            </Link>{" "}
            to correct a credit or request removal.
          </p>
        </SectionCard>
      )}
    </PublicContentShell>
  );
}
