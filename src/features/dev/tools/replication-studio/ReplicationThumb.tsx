"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

import { formatDuration, type StudioMediaType } from "./replicationStudioModel";

type ThumbSubject = {
  slug: string;
  title: string;
  type: StudioMediaType;
  thumbnail_url: string | null;
  duration?: number | null;
};

const TYPE_ICON: Record<StudioMediaType, string> = {
  image: "lucide:image",
  video: "lucide:play",
  audio: "lucide:audio-lines",
};

/**
 * A deterministic bar pattern for audio rows.
 *
 * Audio has no frame to show, and a blank tile in a grid of pictures reads as a
 * broken image. The bars are derived from the slug so the same asset always
 * draws the same shape — it is a placeholder that is stable, not a waveform
 * that is true, and it never pretends to be sampled from the file.
 */
function waveformBars(seedSource: string): number[] {
  const seed = seedSource.length;
  return Array.from({ length: 28 }, (_, index) => 14 + Math.abs(Math.sin((index + seed) * 1.7)) * 72);
}

function Placeholder({ type }: { type: StudioMediaType }) {
  return (
    <div className="theme-text-faint flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--theme-surface-deep)]">
      <Icon icon={TYPE_ICON[type]} size={20} />
      <span className="text-[11px] uppercase tracking-[0.24em]">{type}</span>
    </div>
  );
}

export function ReplicationThumb({
  row,
  className,
  showGlyph = true,
}: {
  row: ThumbSubject;
  className?: string;
  showGlyph?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const durationLabel = formatDuration(row.duration ?? null);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-[var(--theme-surface-deep)]",
        className,
      )}
    >
      {row.type === "audio" ? (
        <div className="flex h-full w-full items-end justify-center gap-[3px] px-3 py-4">
          {waveformBars(row.slug || row.title).map((height, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="w-[3px] rounded-full bg-[var(--theme-accent-muted)] opacity-70"
              style={{ height: `${height.toFixed(0)}%` }}
            />
          ))}
        </div>
      ) : row.thumbnail_url && !failed ? (
        // A raw <img> rather than AppImage: the studio needs the error event to
        // swap in a placeholder, and these Convex storage URLs have no known
        // intrinsic size to hand next/image.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- `error` is a load event, not an interaction; it is the only way to catch a dead storage URL.
        <img
          src={row.thumbnail_url}
          alt={row.title || row.slug}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Placeholder type={row.type} />
      )}

      {showGlyph && row.type !== "image" ? (
        <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--theme-shadow-strong)] px-2 py-0.5 text-[11px] text-[var(--theme-text-on-media)]">
          <Icon icon={TYPE_ICON[row.type]} size={11} />
          {durationLabel ?? row.type}
        </span>
      ) : null}
    </div>
  );
}
