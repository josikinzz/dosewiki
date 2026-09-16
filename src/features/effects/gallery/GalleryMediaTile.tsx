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

/** `duration` in seconds as `m:ss`, or null when unusable. */
function formatMediaDuration(seconds: number | undefined): string | null {
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
  const t = useT();
  const { hoverPreview: hoverPreviewAllowed } = useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
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
    setPreviewReady(false);
    if (previous) releaseVideoElement(previous);
  }, []);

  const isVideo = replication.type === "video";
  const isAudio = replication.type === "audio";
  const gifLike = replication.format.toLowerCase() === "gif";
  const gifReady =
    gifLike && Boolean(replication.motion_url && replication.motion_poster_url);
  const motionSource = gifReady ? replication.motion_url : undefined;
  // An audio row has no poster and no still of its own: its `url` is the clip.
  // Handing that to <AppImage> would wait forever on bytes that never decode,
  // so audio never reaches the image path and draws its own frame below.
  //
  // A still's own `thumbnail_url` comes first, and `url` is only the fallback
  // for the rows that have no derivative. The corpus stores 640px webp
  // renditions beside 1280px (and occasionally 30 MB) masters, so serving the
  // master into a grid column ~190px wide downloaded and decoded roughly
  // three times the bytes of the picture the reader can actually see. The
  // full-fidelity master stays where its detail is legible: the viewer stage
  // (`slidePosterSource`) and the permalink.
  const thumbnailUrl = isAudio
    ? undefined
    : gifLike
      ? replication.motion_poster_url
      : isVideo
        ? replication.thumbnail_url
        : (replication.thumbnail_url ?? replication.url);
  const byline = getCreatorByline(replication, t);
  // Audio carries no intrinsic frame; a shallower block keeps the bars from
  // becoming a wall of empty tile beside real artwork.
  const fallbackRatio = isAudio ? "3 / 2" : "4 / 3";
  const ratio =
    replication.width && replication.height
      ? `${replication.width} / ${replication.height}`
      : fallbackRatio;

  // Playback is strictly hover-gated: a hover-capable fine pointer starts the
  // low-resolution preview rendition, or the controllable motion rendition
  // for GIF-like works. Missing previews stay static. Mouse-out stops playback;
  // touch, Save-Data and reduced-motion readers receive static tiles.
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
          // Scoped to the frame, not the whole figure, so hovering the caption
          // text below does not zoom the artwork.
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
          // The clip's own frame: a stable bar pattern, never sampled from the
          // file, so the tile reads as audio at a glance instead of as a
          // broken picture. The caption below and the corner chip carry every
          // word of it, so the strip itself stays out of the accessible name.
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
            // The preview covers the whole anchor and paints last, so without
            // this it swallows every click on a video tile. Browsers do not
            // forward a media element's click to an ancestor link the way they
            // do for images. The metadata chip stays put during the crossfade.
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-[180ms] motion-reduce:transition-none",
              previewReady ? "opacity-100" : "opacity-0",
            )}
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
          {/* Every visible part of the chip is aria-hidden and spoken here
              instead, so the tile's accessible name reads "Title, video, 0:24,
              2019" rather than running the glyphs and figures together. The
              leading comma is the separator: the name computation concatenates
              its parts without one, and a leading space would be trimmed. */}
          <span className="sr-only">
            {`, ${mediumLabel}`}
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
