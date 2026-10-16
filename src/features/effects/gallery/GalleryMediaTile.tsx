"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { releaseVideoElement } from "@/lib/releaseVideoElement";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { audioWaveformBars } from "@/features/replications/audioWaveform";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { getCreatorByline } from "../components/replicationCredit";
import { useMotionAllowed } from "./inViewPlayback";
import { workDateMs } from "./galleryOrdering";

function formatMediaDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatWorkYear(
  row: Pick<PublicGalleryReplicationPreview, "date_info">,
): string | null {
  const kind = row.date_info?.kind;
  if (!kind || kind === "unknown" || kind === "inferred") return null;
  const ms = workDateMs(row);
  if (ms === null) return null;
  const year = String(new Date(ms).getUTCFullYear());
  return kind === "upper_bound" ? `\u2264${year}` : year;
}

interface GalleryMediaTileProps {
  replication: PublicGalleryReplicationPreview;
  className?: string;
  frameClassName?: string;
  frameAspect?: "natural" | "square";
  onOpen?: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  showByline?: boolean;
  mobileCompact?: boolean;
  viewerHref: string;
  sizes?: string;
}

export function GalleryMediaTile({
  replication,
  className,
  frameClassName,
  frameAspect = "natural",
  onOpen,
  showByline = true,
  mobileCompact = false,
  viewerHref,
  sizes = "(max-width: 640px) 60vw, 400px",
}: GalleryMediaTileProps) {
  const t = useT();
  const { hoverPreview: hoverPreviewAllowed } = useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLAnchorElement | null>(null);
  const [poster, setPoster] = useState<"ready" | "pending" | "failed">(
    "ready",
  );
  const attachPreview = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      videoRef.current = node;
      return;
    }
    const previous = videoRef.current;
    videoRef.current = null;
    setPreviewReady(false);
    if (previous) releaseVideoElement(previous);
  }, []);

  const isVideo = replication.type === "video";
  const isAudio = replication.type === "audio";
  const gifLike = replication.format.toLowerCase() === "gif";
  const gifReady =
    gifLike && Boolean(replication.motion_url && replication.motion_poster_url);
  const motionSource = gifReady ? replication.motion_url : undefined;
  const thumbnailUrl = isAudio
    ? undefined
    : gifLike
      ? replication.motion_poster_url
      : isVideo
        ? replication.thumbnail_url
        : (replication.thumbnail_url ?? replication.url);
  const byline = getCreatorByline(replication, t);
  const fallbackRatio = isAudio ? "3 / 2" : "4 / 3";
  const ratio =
    replication.width && replication.height
      ? `${replication.width} / ${replication.height}`
      : fallbackRatio;

  const previewSource = isVideo
    ? replication.preview_url
    : motionSource;
  const showPreview = hoverPreviewAllowed && hovered && Boolean(previewSource);

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
  }, [showPreview]);

  useEffect(() => {
    if (!thumbnailUrl) return;
    const image = frameRef.current?.querySelector("img");
    if (!image) return;
    if (image.complete) {
      setPoster(image.naturalWidth > 0 ? "ready" : "failed");
      return;
    }
    setPoster("pending");
    const onLoad = () => setPoster("ready");
    const onError = () => setPoster("failed");
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    return () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
  }, [thumbnailUrl]);

  const durationLabel =
    isVideo || isAudio ? formatMediaDuration(replication.duration) : null;
  const workYear = formatWorkYear(replication);
  const mediumLabel = isVideo
    ? t("Video")
    : isAudio
      ? t("Audio")
      : gifLike
        ? t("Animation")
        : t("Image");

  return (
    <figure className={cn("min-w-0", className)}>
      <SmartLink
        ref={frameRef}
        href={viewerHref}
        onClick={onOpen ? (event) => onOpen(event, replication) : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={frameAspect === "natural" ? { aspectRatio: ratio } : undefined}
        className={cn(
          "group/frame relative block overflow-hidden rounded-xl border",
          "border-[color:var(--theme-border-subtle)] bg-[var(--theme-surface-strong)]",
          "transition duration-300 hover:border-[color:var(--theme-card-border-strong)]",
          "hover:-translate-y-0.5 hover:shadow-[var(--theme-elevation-tile-hover)]",
          "theme-focus-ring",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          frameClassName,
        )}
      >
        {isAudio ? (
          <span
            aria-hidden
            className="theme-replication-media-well absolute inset-0 flex items-end justify-center gap-[3px] px-4 py-6"
          >
            {audioWaveformBars(replication.slug || replication.title).map(
              (height, index) => (
                <span
                  key={index}
                  className="theme-replication-waveform-bar w-[3px] flex-none rounded-full opacity-70"
                  style={{ height: `${height.toFixed(0)}%` }}
                />
              ),
            )}
          </span>
        ) : thumbnailUrl && poster !== "failed" ? (
          <>
            {poster === "pending" ? (
              <span
                aria-hidden
                className="theme-skeleton-pulse theme-skeleton-pulse-soft absolute inset-0 animate-pulse motion-reduce:animate-none"
              />
            ) : null}
            <AppImage
              src={thumbnailUrl}
              alt={replication.title}
              width={replication.width ?? 800}
              height={replication.height ?? 800}
              sizes={sizes}
              className={cn(
                "absolute inset-0 h-full w-full object-cover text-transparent transition duration-[180ms]",
                "group-hover/frame:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/frame:scale-100",
                poster === "ready" && !(showPreview && previewReady) ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : (
          <MediaPlaceholder
            icon={isVideo ? "lucide:play" : "lucide:image"}
            title={replication.title}
          />
        )}

        {showPreview ? (
          <video
            ref={attachPreview}
            src={previewSource}
            poster={thumbnailUrl}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={(event) => {
              if (event.currentTarget.readyState >= 2) setPreviewReady(true);
            }}
            onError={() => setPreviewReady(false)}
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-[180ms] motion-reduce:transition-none",
              previewReady ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}

        <span
          className={cn(
            "pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full",
            "bg-black/55 px-2 py-1 backdrop-blur-sm",
            "theme-media-tile-title text-[11px] font-medium leading-none tabular-nums",
          )}
        >
          {isVideo ? (
            <Icon
              icon="lucide:play"
              className="h-3 w-3 fill-current"
              aria-hidden
            />
          ) : isAudio ? (
            <Icon icon="lucide:audio-lines" className="h-3 w-3" aria-hidden />
          ) : gifLike ? (
            <span aria-hidden className="text-[10px] font-semibold tracking-wide">
              GIF
            </span>
          ) : (
            <Icon icon="lucide:image" className="h-3 w-3" aria-hidden />
          )}
          {durationLabel ? <span aria-hidden>{durationLabel}</span> : null}
          {durationLabel && workYear ? <span aria-hidden>·</span> : null}
          {workYear ? <span aria-hidden>{workYear}</span> : null}
          <span className="sr-only">
            {`, ${mediumLabel}`}
            {durationLabel ? `, ${durationLabel}` : ""}
            {workYear ? `, ${workYear}` : ""}
          </span>
        </span>
      </SmartLink>

      <figcaption
        className={cn(
          "mt-1 w-0 min-w-full px-0.5",
          mobileCompact && "max-md:px-0",
        )}
      >
        <p className="theme-text-secondary truncate text-sm font-medium">
          {replication.title}
        </p>
        {showByline ? (
          <p className="theme-text-faint truncate text-xs">{byline}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}
