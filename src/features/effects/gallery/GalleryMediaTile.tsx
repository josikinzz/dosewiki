"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { cn } from "@/lib/utils";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { getCreatorByline } from "../components/replicationCredit";
import { useInView, useMotionAllowed, usePlaybackSlot } from "./inViewPlayback";

/** `duration` in seconds as `m:ss`, or null when unusable. */
function formatVideoDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface GalleryMediaTileProps {
  replication: PublicGalleryReplicationPreview;
  /** Layout classes for the whole tile (flow, snap, break-inside). */
  className?: string;
  /** Sizing classes for the media frame itself (height in rails, width in masonry). */
  frameClassName?: string;
  /**
   * `natural` keeps the work's own proportions (masonry, rails). `square`
   * hands the ratio to `frameClassName` so a uniform grid stays uniform.
   */
  frameAspect?: "natural" | "square";
  /**
   * The optional click interceptor opens the in-page viewer. It decides
   * whether to `preventDefault()`; the tile stays a real anchor so every work
   * remains crawlable and modified-clickable into a new tab.
   */
  onOpen?: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  /** Omit the creator byline under the title (artist rails already name the artist once, above). */
  showByline?: boolean;
  /**
   * Hide the caption below `md` where dense phone rails and masonry use the
   * expanded viewer for complete title and credit context.
   */
  mobileCompact?: boolean;
  /** Canonical source-collection URL with this work active in the viewer. */
  viewerHref: string;
}

/**
 * A gallery tile: framed media with its title and credit *underneath*.
 *
 * Nothing is drawn over the artwork. The previous hover-gradient caption made
 * attribution unreachable on touch and put white text over unpredictable image
 * content; a real caption row is legible on every device and in both themes.
 *
 * The tile is an anchor, not a button, so each work can be linked, opened in a
 * new tab, and crawled.
 */
export function GalleryMediaTile({
  replication,
  className,
  frameClassName,
  frameAspect = "natural",
  onOpen,
  showByline = true,
  mobileCompact = false,
  viewerHref,
}: GalleryMediaTileProps) {
  const { autoplay: autoplayAllowed, hoverPreview: hoverPreviewAllowed } =
    useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLAnchorElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = replication.type === "video";
  const gifLike = replication.format.toLowerCase() === "gif";
  const gifReady =
    gifLike && Boolean(replication.motion_url && replication.motion_poster_url);
  const motionSource = isVideo
    ? replication.url
    : gifReady
      ? replication.motion_url
      : undefined;
  const moving = isVideo || gifReady;
  const thumbnailUrl = gifLike
    ? replication.motion_poster_url
    : isVideo
      ? replication.thumbnail_url
      : replication.url;
  const byline = getCreatorByline(replication);
  const ratio =
    replication.width && replication.height
      ? `${replication.width} / ${replication.height}`
      : "4 / 3";

  // Gallery preview videos use their low-resolution rendition under the shared
  // in-view budget. GIF-like works stay on their static motion poster until a
  // fine-pointer hover explicitly previews the controllable motion rendition;
  // the raw GIF never bypasses reduced-motion or playback controls.
  const previewUrl = isVideo ? replication.preview_url : undefined;
  const autoplayEligible = Boolean(previewUrl) && autoplayAllowed;
  const inView = useInView(frameRef, 0.5, autoplayEligible);
  // Hover refreshes the claim, so the tile under the pointer wins a slot back
  // even after being revoked by five fresher tiles.
  const slotGranted = usePlaybackSlot(autoplayEligible && inView, hovered);
  const showAutoplay = autoplayEligible && inView && slotGranted;

  const showHoverPreview =
    moving &&
    !previewUrl &&
    hoverPreviewAllowed &&
    hovered &&
    Boolean(motionSource);
  const showPreview = showAutoplay || showHoverPreview;

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
    if (!showPreview) setPlaying(false);
  }, [showPreview]);

  const durationLabel = isVideo
    ? formatVideoDuration(replication.duration)
    : null;

  return (
    <figure className={cn("min-w-0", className)}>
      <Link
        ref={frameRef}
        href={viewerHref}
        onClick={onOpen ? (event) => onOpen(event, replication) : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={frameAspect === "natural" ? { aspectRatio: ratio } : undefined}
        className={cn(
          // Scoped to the frame, not the whole figure, so hovering the caption
          // text below does not zoom the artwork.
          "group/frame relative block overflow-hidden rounded-xl border",
          "border-[color:var(--theme-border-subtle)] bg-[var(--theme-surface-strong)]",
          "transition duration-300 hover:border-[color:var(--theme-card-border-strong)]",
          "hover:-translate-y-0.5 hover:shadow-[var(--theme-elevation-tile-hover)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          frameClassName,
        )}
      >
        {thumbnailUrl ? (
          <AppImage
            src={thumbnailUrl}
            alt={replication.title}
            width={replication.width ?? 800}
            height={replication.height ?? 800}
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition duration-500",
              "group-hover/frame:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/frame:scale-100",
              showPreview ? "opacity-0" : "opacity-100",
            )}
          />
        ) : (
          <MediaPlaceholder
            icon={isVideo ? "lucide:play" : "lucide:image"}
            title={replication.title}
          />
        )}

        {showPreview ? (
          <video
            ref={videoRef}
            src={showAutoplay ? previewUrl : motionSource}
            poster={thumbnailUrl}
            muted
            loop
            playsInline
            preload={showAutoplay ? "metadata" : "none"}
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            // The preview covers the whole anchor and paints last, so without this
            // it swallows every click on a video tile. Browsers do not forward a
            // media element's click to an ancestor link the way they do for images.
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : null}

        {moving ? (
          // Always-visible motion marker: play glyph plus duration when known.
          // Same on-media optics as the shared viewer's controls.
          // Fades out while a preview is actually rendering frames, so it never
          // sits over moving footage.
          <span
            className={cn(
              "pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full",
              "bg-black/55 px-2 py-1 backdrop-blur-sm",
              "theme-media-tile-title text-[11px] font-medium leading-none tabular-nums",
              "transition-opacity duration-300 motion-reduce:transition-none",
              playing ? "opacity-0" : "opacity-100",
            )}
          >
            <Icon
              icon="lucide:play"
              className="h-3 w-3 fill-current"
              aria-hidden
            />
            {durationLabel ? <span>{durationLabel}</span> : null}
            <span className="sr-only">{isVideo ? "Video" : "Animation"}</span>
          </span>
        ) : null}
      </Link>

      {/* Compact phone tiles keep one concise caption row. Artist rails can
          still suppress the repeated byline with `showByline={false}`, while
          effect and mixed views retain the creator credit.

          `w-0 min-w-full`: the caption must never contribute intrinsic width.
          In rails the figure is a max-content flex item whose width comes from
          the frame's aspect-ratio × height; a long title would otherwise widen
          the figure and stretch the frame past the artwork. Zero-width plus
          min-w-full keeps the caption exactly as wide as the frame, where
          `truncate` can ellipsize it. */}
      <figcaption
        className={cn(
          "mt-2 w-0 min-w-full px-0.5",
          mobileCompact && "max-md:mt-1 max-md:px-0",
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
