import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { getPublicEffectArticles } from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
import { AudioReplicationCard } from "@/features/effects/components/AudioReplicationCard";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  collectAudioReplications,
  countAudioReplicationArtists,
} from "@/features/effects/audioReplicationIndex";

export async function generateMetadata() {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "Audio Replications",
    description:
      copy.text("seo-replications-audio-description") ||
      "Audio recreations of subjective effects, credited to the artists who made them and preserved from the Effect Index archive.",
    route: { family: "replicationAudio" },
  });
}

export default async function ReplicationAudioPage() {
  const effects = await getPublicEffectArticles();
  const entries = collectAudioReplications(effects);
  const artistCount = countAudioReplicationArtists(entries);

  return (
    <>
      <ReplicationsTabNav />
      <div className="mx-auto mt-8 w-full max-w-3xl">
        <h2 className="sr-only">Audio</h2>

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
            <p className="theme-text-secondary text-[1.0625rem] leading-7">
              Audio recreations of what a subjective effect sounds like, made by
              the artists credited on each clip.
            </p>

            <p className="theme-text-faint mt-4 text-xs tabular-nums">
              {entries.length} {entries.length === 1 ? "clip" : "clips"}
              {artistCount > 0
                ? ` · ${artistCount} ${artistCount === 1 ? "artist" : "artists"}`
                : ""}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {entries.map((entry) => (
                <AudioReplicationCard
                  key={`${entry.effectSlug}-${entry.audio.title}`}
                  audio={entry.audio}
                  contextLabel={
                    <Link
                      href={`/effects/${entry.effectSlug}`}
                      prefetch={false}
                      className="theme-accent-heading theme-focus-ring text-xs font-medium transition hover:opacity-90"
                    >
                      {entry.effectName}
                    </Link>
                  }
                />
              ))}
            </div>

            <p className="theme-text-muted mt-8 text-xs leading-5">
              Audio replications are credited to their creator when known.
              Rights remain with the original creator or rightsholder unless an
              individual clip states another license. See the{" "}
              <Link
                href="/docs/license#replication-media-terms"
                className={proseLinkClassName}
              >
                licensing terms
              </Link>{" "}
              to correct a credit or request removal.
            </p>
          </SectionCard>
        )}
      </div>
    </>
  );
}
