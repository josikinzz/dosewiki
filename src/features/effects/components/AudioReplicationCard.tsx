"use client";

import { ArticleSubsectionCard } from "@/components/common/ArticleSection";
import { useT } from "@/i18n/client";
import { formatMessage, msg, type Translate } from "@/i18n/messages";
import type { AudioReplicationMetadata } from "@/types/replications";
import { AudioReplicationPlayer } from "./AudioReplicationPlayer";
import { hasKnownCreator } from "./replicationCredit";

const REPLICATION_RIGHTS_LABELS: Record<string, string> = {
  "creator-retained": msg("Rights remain with the creator or rightsholder."),
  "explicit-license": msg("Reuse follows the item-specific license."),
  unknown: msg("Reuse terms are unknown; contact the creator or rightsholder before reuse."),
  "permission-granted": msg("Displayed with permission; reuse still depends on the creator or rightsholder."),
  "public-domain": msg("Marked as public domain."),
};

function getAudioCreditLine(audio: AudioReplicationMetadata, translate: Translate = formatMessage) {
  if (audio.credit_line) {
    return audio.credit_line;
  }

  return hasKnownCreator(audio.artist)
    ? translate(msg("{{title}} by {{artist}}"), { title: audio.title, artist: audio.artist! })
    : translate(msg("{{title}} (creator unknown)"), { title: audio.title });
}

function getAudioRightsLabel(audio: AudioReplicationMetadata, translate: Translate = formatMessage) {
  if (audio.license_name) {
    return translate(msg("License: {{name}}."), { name: audio.license_name });
  }

  return translate(REPLICATION_RIGHTS_LABELS[audio.rights_status ?? "creator-retained"]);
}

interface AudioReplicationCardProps {
  audio: AudioReplicationMetadata;
  /** Rendered under the title on surfaces that mix clips from several effects. */
  contextLabel?: React.ReactNode;
}

/**
 * One audio replication: title, credit, player, rights, and creator links.
 * Shared by the effect article's audio section and the audio index.
 */
export function AudioReplicationCard({ audio, contextLabel }: AudioReplicationCardProps) {
  const t = useT();
  return (
    <ArticleSubsectionCard padding="sm" variant="interactive">
      <div className="mb-3 flex flex-col gap-1">
        <span className="theme-text-primary truncate text-sm font-semibold">{audio.title}</span>
        <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-[0.22em]">
          {getAudioCreditLine(audio, t)}
        </span>
        {contextLabel}
      </div>
      <AudioReplicationPlayer src={audio.resource} label={audio.title} />
      {audio.description ? (
        <p className="theme-text-secondary mt-3 text-xs leading-5">{audio.description}</p>
      ) : null}
      <p className="theme-text-faint mt-3 text-xs leading-5">{getAudioRightsLabel(audio, t)}</p>
      {audio.artist_url || audio.source_url || audio.license_url ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {audio.artist_url ? (
            <a href={audio.artist_url} target="_blank" rel="noopener noreferrer">
              {t("Creator")}
            </a>
          ) : null}
          {audio.source_url ? (
            <a href={audio.source_url} target="_blank" rel="noopener noreferrer">
              {t("Source")}
            </a>
          ) : null}
          {audio.license_url ? (
            <a href={audio.license_url} target="_blank" rel="noopener noreferrer">
              {t("License")}
            </a>
          ) : null}
        </div>
      ) : null}
    </ArticleSubsectionCard>
  );
}
