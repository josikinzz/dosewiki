import { ArticleSubsectionCard } from "@/components/common/ArticleSection";
import type { AudioReplicationMetadata } from "@/types/replications";
import { AudioReplicationPlayer } from "./AudioReplicationPlayer";
import { hasKnownCreator } from "./replicationCredit";

const REPLICATION_RIGHTS_LABELS: Record<string, string> = {
  "creator-retained": "Rights remain with the creator or rightsholder.",
  "explicit-license": "Reuse follows the item-specific license.",
  unknown: "Reuse terms are unknown; contact the creator or rightsholder before reuse.",
  "permission-granted": "Displayed with permission; reuse still depends on the creator or rightsholder.",
  "public-domain": "Marked as public domain.",
};

export function getAudioCreditLine(audio: AudioReplicationMetadata) {
  if (audio.credit_line) {
    return audio.credit_line;
  }

  return hasKnownCreator(audio.artist)
    ? `${audio.title} by ${audio.artist}`
    : `${audio.title} (creator unknown)`;
}

export function getAudioRightsLabel(audio: AudioReplicationMetadata) {
  if (audio.license_name) {
    return `License: ${audio.license_name}.`;
  }

  return REPLICATION_RIGHTS_LABELS[audio.rights_status ?? "creator-retained"];
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
  return (
    <ArticleSubsectionCard padding="sm" variant="interactive">
      <div className="mb-3 flex flex-col gap-1">
        <span className="theme-text-primary truncate text-sm font-semibold">{audio.title}</span>
        <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-[0.22em]">
          {getAudioCreditLine(audio)}
        </span>
        {contextLabel}
      </div>
      <AudioReplicationPlayer src={audio.resource} label={audio.title} />
      {audio.description ? (
        <p className="theme-text-secondary mt-3 text-xs leading-5">{audio.description}</p>
      ) : null}
      <p className="theme-text-faint mt-3 text-xs leading-5">{getAudioRightsLabel(audio)}</p>
      {audio.artist_url || audio.source_url || audio.license_url ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {audio.artist_url ? (
            <a href={audio.artist_url} target="_blank" rel="noopener noreferrer">
              Creator
            </a>
          ) : null}
          {audio.source_url ? (
            <a href={audio.source_url} target="_blank" rel="noopener noreferrer">
              Source
            </a>
          ) : null}
          {audio.license_url ? (
            <a href={audio.license_url} target="_blank" rel="noopener noreferrer">
              License
            </a>
          ) : null}
        </div>
      ) : null}
    </ArticleSubsectionCard>
  );
}
