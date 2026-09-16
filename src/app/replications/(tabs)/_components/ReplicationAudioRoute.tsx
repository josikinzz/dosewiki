import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { getPublicEffectAudioIndex, getPublicReplications } from "@server/data/publicData";
import { getLocalizedEffectNames } from "@server/translation/localizedRecords";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { AudioReplicationCard } from "@/features/effects/components/AudioReplicationCard";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  collectAudioReplications,
  countAudioReplicationArtists,
} from "@/features/effects/audioReplicationIndex";
import { t } from "@/i18n/server";

export async function getReplicationAudioMetadata(locale: LiveLocale | null = null) {
  const copy = await getCopyByKeys(["seo-replications-audio-description"]);

  return buildPublicPageMetadata({
    title: "Audio Replications",
    description:
      copy.text("seo-replications-audio-description") ||
      "Audio recreations of subjective effects, credited to the artists who made them and preserved from the Effect Index archive.",
    route: { family: "replicationAudio" },
    noIndex: locale !== null,
  });
}

/**
 * The Audio tab, shared by the English route and every locale mirror. Audio
 * clips live on the effect records as an excluded corpus group, so their
 * titles and credits stay as the artists wrote them; on a mirror the effect
 * name each clip is filed under comes from the stored effect-name translation.
 */
export async function ReplicationAudioRoute({ locale = null }: { locale?: LiveLocale | null }) {
  const [audioIndex, replications] = await Promise.all([
    getPublicEffectAudioIndex(),
    getPublicReplications(),
  ]);
  let effects = audioIndex;
  if (locale) {
    const names = await getLocalizedEffectNames(effects.map((effect) => effect.name), locale.code);
    effects = effects.map((effect) => ({
      ...effect,
      name: names.get(effect.name) ?? effect.name,
    }));
  }
  // Stored `type: "audio"` rows are published beside the inline clips; the
  // index dedupes a stored row against an inline clip of the same title.
  const entries = collectAudioReplications(
    effects,
    replications.filter((row) => row.type === "audio"),
  );
  const artistCount = countAudioReplicationArtists(entries);
  const [termsBefore, termsAfter] = t(
    "Audio replications are credited to their creator when known. Rights remain with the original creator or rightsholder unless an individual clip states another license. See the {{terms}} to correct a credit or request removal.",
  ).split("{{terms}}");

  return (
    <>
      <ReplicationsTabNav />
      <div className="mx-auto mt-8 w-full max-w-3xl">
        <h2 className="sr-only">{t("Audio")}</h2>

        {entries.length === 0 ? (
          <SectionCard>
            <SearchEmptyState
              icon="lucide:volume-off"
              title={t("No audio replications yet")}
              description={t("Audio replications have not been published yet. Check back soon.")}
            />
          </SectionCard>
        ) : (
          <SectionCard>
            <p className="theme-text-secondary text-[1.0625rem] leading-7">
              {t("Audio recreations of what a subjective effect sounds like, made by the artists credited on each clip.")}
            </p>

            <p className="theme-text-faint mt-4 text-xs tabular-nums">
              {entries.length === 1 ? t("{{count}} clip", { count: entries.length }) : t("{{count}} clips", { count: entries.length })}
              {artistCount > 0
                ? ` · ${artistCount === 1 ? t("{{count}} artist", { count: artistCount }) : t("{{count}} artists", { count: artistCount })}`
                : ""}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {entries.map((entry) => (
                <AudioReplicationCard
                  key={`${entry.effectSlug}-${entry.audio.title}`}
                  audio={entry.audio}
                  contextLabel={
                    <SmartLink
                      href={`/effects/${entry.effectSlug}`}
                      className="theme-accent-heading theme-focus-ring text-xs font-medium transition hover:opacity-90"
                    >
                      {entry.effectName}
                    </SmartLink>
                  }
                />
              ))}
            </div>

            <p className="theme-text-muted mt-8 text-xs leading-5">
              {termsBefore}
              <Link
                href="/docs/license#replication-media-terms"
                className={proseLinkClassName}
              >
                {t("licensing terms")}
              </Link>
              {termsAfter}
            </p>
          </SectionCard>
        )}
      </div>
    </>
  );
}
