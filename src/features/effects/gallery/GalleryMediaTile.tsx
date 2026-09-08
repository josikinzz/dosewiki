"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { releaseVideoElement } from "@/lib/releaseVideoElement";
import { cn } from "@/lib/utils";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { getCreatorByline } from "../components/replicationCredit";
import { useMotionAllowed } from "./inViewPlayback";
import { workDateMs } from "./galleryModel";

/** `duration` in seconds as `m:ss`, or null when unusable. */
function formatVideoDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The work's own date as a bare year, or null when the record cannot defend
 * one.
 *
 * `created_at` is the ingest timestamp, not a work date, so it never appears
 * here: dating a 1998 painting to the day it was scraped would be a factual
 * claim the archive cannot make. `inferred` and `unknown` kinds assert a
 * precision the row does not have, and an `upper_bound` value is a ceiling
 * rather than a date, so it renders as one.
 */
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
   * Tighten the caption below `md`, where the phone masonry runs three thin
   * columns and the expanded viewer owns complete title and credit context.
   * The caption itself stays: a title that only exists on hover is a title
   * touch readers never get.
   */
  mobileCompact?: boolean;
  /** Canonical source-collection URL with this work active in the viewer. */
  viewerHref: string;
  /**
   * Responsive `sizes` hint for the poster image. The default fits the rail
   * tiles (height-locked frames whose width tops out around 16:9 × h-52).
   * The masonry passes its own column-width hint.
   */
  sizes?: string;
}

/**
 * A gallery tile: framed media with its title and credit *underneath*, and one
 * corner chip naming what the work is.
 *
 * The title is never drawn over the artwork. The previous hover-gradient
 * caption made attribution unreachable on touch and put white text over
 * unpredictable image content; these thumbnails are high-chroma, high-detail
 * replications, so no scrim carries body text across them without eating the
 * work. A real caption row is legible on every device and in both themes.
 *
 * The chip is the one thing that sits on the media, in the quietest corner:
 * a medium marker for every work (an absent chip used to be the only signal
 * for "still image", which is a rule readers had to learn), the duration for
 * video, and the researched work year when the record can defend one.
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
  sizes = "(max-width: 640px) 60vw, 400px",
}: GalleryMediaTileProps) {
  const { hoverPreview: hoverPreviewAllowed } = useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLAnchorElement | null>(null);
  // While bytes are in flight a visible <img> paints its alt text (the title)
  // inside a broken-image outline, which reads as a grid of errors. The alt
  // text is always kept transparent so server markup and no-JS readers see a
  // plain surface; after hydration an in-flight poster additionally hides
  // behind a shimmer and fades in on load. "ready" is the server default so
  // hydration never blanks art the browser has already painted. A poster that
  // fails to fetch falls back to the same placeholder as a missing one.
  const [poster, setPoster] = useState<"ready" | "pending" | "failed">(
    "ready",
  );
  // Identity-stable on purpose: hover previews unmount on every mouse-out,
  // and a released-then-leaked element would count against the browser's
  // media-player budget until GC. An inline callback would re-run per
  // render and tear down a still-mounted preview.
  const attachPreview = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      videoRef.current = node;
      return;
    }
    const previous = videoRef.current;
    videoRef.current = null;
    if (previous) releaseVideoElement(previous);
  }, []);

  const isVideo = replication.type === "video";
  const gifLike = replication.format.toLowerCase() === "gif";
  const gifReady =
    gifLike && Boolean(replication.motion_url && replication.motion_poster_url);
  const motionSource = isVideo
    ? replication.url
    : gifReady
      ? replication.motion_url
      : undefined;
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

  // Playback is strictly hover-gated: a hover-capable fine pointer starts the
  // low-resolution preview rendition (or the full source for legacy rows with
  // no rendition; the controllable motion rendition for GIF-like works), and
  // mouse-out stops it. Touch devices and reduced-motion readers get fully
  // static tiles — the poster plus the motion chip — so nothing decodes at
  // rest. The raw GIF never bypasses reduced-motion or playback controls.
  const previewSource = isVideo
    ? (replication.preview_url ?? motionSource)
    : motionSource;
  const showPreview = hoverPreviewAllowed && hovered && Boolean(previewSource);

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
  }, [showPreview]);

  // Reads the element's own state instead of React's onLoad: cached posters
  // finish before hydration attaches synthetic listeners and would never fire.
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

  const durationLabel = isVideo
    ? formatVideoDuration(replication.duration)
    : null;
  const workYear = formatWorkYear(replication);

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
        {thumbnailUrl && poster !== "failed" ? (
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
                "absolute inset-0 h-full w-full object-cover text-transparent transition duration-500",
                "group-hover/frame:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/frame:scale-100",
                poster === "ready" && !showPreview ? "opacity-100" : "opacity-0",
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
            // The preview covers the whole anchor and paints last, so without
            // this it swallows every click on a video tile. Browsers do not
            // forward a media element's click to an ancestor link the way they
            // do for images. Playback state itself is not tracked: the corner
            // chip stays put whether or not frames are moving.
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* Medium, length and date, in the top-right corner: away from the
            caption below the frame, and deliberately not faded out during a
            hover preview, since the duration matters most at the moment a
            reader is deciding whether to commit to watching. */}
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
          {/* Every visible part of the chip is aria-hidden and spoken here
              instead, so the tile's accessible name reads "Title, video, 0:24,
              2019" rather than running the glyphs and figures together. The
              leading comma is the separator: the name computation concatenates
              its parts without one, and a leading space would be trimmed. */}
          <span className="sr-only">
            {`, ${isVideo ? "Video" : gifLike ? "Animation" : "Image"}`}
            {durationLabel ? `, ${durationLabel}` : ""}
            {workYear ? `, ${workYear}` : ""}
          </span>
        </span>
      </SmartLink>

      {/* Artist rails suppress the repeated byline with `showByline={false}`,
          while effect and mixed views retain the creator credit.

          `w-0 min-w-full`: the caption must never contribute intrinsic width.
          In rails the figure is a max-content flex item whose width comes from
          the frame's aspect-ratio × height; a long title would otherwise widen
          the figure and stretch the frame past the artwork. Zero-width plus
          min-w-full keeps the caption exactly as wide as the frame, where
          `truncate` can ellipsize it. */}
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
