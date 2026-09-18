"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { releaseVideoElement } from "@/lib/releaseVideoElement";
import { cn } from "@/lib/utils";
import {
  createPlaybackSlotPool,
  useInView,
  useMotionAllowed,
  usePlaybackSlot,
} from "@/features/effects/gallery/inViewPlayback";
import { audioWaveformBars } from "@/features/replications/audioWaveform";

import { formatDuration, type StudioMediaType } from "./replicationStudioModel";

type ThumbSubject = {
  slug: string;
  title: string;
  type: StudioMediaType;
  thumbnail_url: string | null;
  /**
   * The asset itself. Stills are their own thumbnail, so an image row with no
   * generated derivative still draws a frame instead of a glyph; video and
   * audio urls are never used as an <img> source.
   */
  url?: string | null;
  duration?: number | null;
};

const TYPE_ICON: Record<StudioMediaType, string> = {
  image: "lucide:image",
  video: "lucide:play",
  audio: "lucide:audio-lines",
};

/** Playlist previews share a four-decoder budget, independent of public galleries. */
const PLAYLIST_PREVIEW_SLOTS = createPlaybackSlotPool(4);
type PreviewState =
  | { status: "idle" | "loading" | "error"; url: null }
  | { status: "ready"; url: string };

function Placeholder({ type }: { type: StudioMediaType }) {
  return (
    <div className="theme-text-faint flex h-full w-full flex-col items-center justify-center theme-replication-media-well gap-1">
      <Icon icon={TYPE_ICON[type]} size={20} />
      <span className="text-[11px] uppercase tracking-[0.24em]">{type}</span>
    </div>
  );
}

export function ReplicationThumb({
  row,
  className,
  showGlyph = true,
  enableVideoPreview = false,
}: {
  row: ThumbSubject;
  className?: string;
  showGlyph?: boolean;
  /** Play the compressed preview rendition on hover or while at least half visible. */
  enableVideoPreview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle", url: null });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Identity-stable on purpose: previews unmount whenever the slot or hover
  // is lost, and a leaked element counts against the browser's media-player
  // budget until GC. An inline callback would re-run per render and tear
  // down a still-mounted preview.
  const attachPreview = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      videoRef.current = node;
      return;
    }
    const previous = videoRef.current;
    videoRef.current = null;
    if (previous) releaseVideoElement(previous);
  }, []);
  const { autoplay: autoplayAllowed, hoverPreview: hoverPreviewAllowed } = useMotionAllowed();
  const durationLabel = formatDuration(row.duration ?? null);
  const source = row.thumbnail_url ?? (row.type === "image" ? row.url ?? null : null);
  const previewEligible = enableVideoPreview && row.type === "video";
  const inView = useInView(frameRef, 0.5, previewEligible && autoplayAllowed);
  const wantsPreview =
    previewEligible &&
    ((autoplayAllowed && inView) || (hoverPreviewAllowed && hovered));
  useEffect(() => {
    if (!wantsPreview) return;
    const controller = new AbortController();
    setPreview({ status: "loading", url: null });
    void fetch(`/api/dev/replications/${encodeURIComponent(row.slug)}/preview`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable.");
        const payload = await response.json() as { previewUrl?: unknown };
        if (typeof payload.previewUrl !== "string" || payload.previewUrl.length === 0) {
          throw new Error("Preview unavailable.");
        }
        setPreview({ status: "ready", url: payload.previewUrl });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreview({ status: "error", url: null });
      });
    return () => controller.abort();
  }, [row.slug, wantsPreview]);
  const previewGranted = usePlaybackSlot(
    wantsPreview,
    hovered,
    PLAYLIST_PREVIEW_SLOTS,
  );
  const showPreview = wantsPreview && preview.status === "ready" && previewGranted;

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
      return;
    }
    setPlaying(false);
  }, [showPreview]);

  return (
    <div
      ref={frameRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        "relative w-full overflow-hidden theme-replication-media-well rounded-lg",
        className,
      )}
    >
      {row.type === "audio" ? (
        <div className="flex h-full w-full items-end justify-center gap-[3px] px-3 py-4">
          {audioWaveformBars(row.slug || row.title).map((height, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="w-[3px] theme-replication-waveform-bar rounded-full opacity-70"
              style={{ height: `${height.toFixed(0)}%` }}
            />
          ))}
        </div>
      ) : source && !failed ? (
        // A raw <img> rather than AppImage: the studio needs the error event to
        // swap in a placeholder, and these Postgres storage URLs have no known
        // intrinsic size to hand next/image.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- `error` is a load event, not an interaction; it is the only way to catch a dead storage URL.
        <img
          src={source}
          alt={row.title || row.slug}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Placeholder type={row.type} />
      )}

      {showPreview ? (
        <video
          ref={attachPreview}
          src={preview.status === "ready" ? preview.url : undefined}
          poster={row.thumbnail_url ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setPlaying(false)}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none",
            playing ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}

      {showGlyph && row.type !== "image" ? (
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 theme-replication-media-badge rounded-full px-2 py-0.5 text-[11px] transition-opacity motion-reduce:transition-none",
            playing ? "opacity-0" : "opacity-100",
          )}
        >
          <Icon icon={TYPE_ICON[row.type]} size={11} />
          {durationLabel ?? row.type}
        </span>
      ) : null}
    </div>
  );
}
