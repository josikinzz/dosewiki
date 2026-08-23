"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { useMotionAllowed } from "@/features/effects/gallery/inViewPlayback";
import { shouldLoopReplicationMotion } from "@/features/replications/viewer/viewerLogic";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "@/features/replications/galleryUrlState";
import { ReplicationViewerOverlay } from "@/features/replications/viewer/ReplicationViewerOverlay";
import type { ReplicationViewerCollection } from "@/features/replications/viewer/viewerModel";
import { publicHref } from "@/utils/publicHref";
import { toAppPath } from "@/utils/previewPath";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import type { ShowcaseWork } from "./showcaseModel";

/**
 * The autoplay gate's viewport half. Where IntersectionObserver does not
 * exist the gate stays closed, which degrades to poster + play rather than
 * to a video looping off-screen.
 */
function useStageInView() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

/**
 * The crossfade: 240ms ease-out-quart between works. Reduced motion collapses
 * it to a short linear fade — an opacity-only change with no eased flourish —
 * and the gate above separately kills autoplay.
 */
const slideFadeClassName =
  "absolute inset-0 transition-opacity duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-100 motion-reduce:ease-linear";

/**
 * The round on-media control chip shared by arrows, pause, mute, and the +N
 * tile. Literal black + `--theme-text-on-media`, not surface tokens: the stage
 * below is a theme-invariant dark media well, so its chrome must not follow
 * the page theme either — the same reasoning as MediaTile's black scrim.
 */
const mediaControlClassName = cn(
  "theme-media-tile-title grid flex-none place-items-center rounded-full bg-black/60",
  "opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100",
  "motion-reduce:transition-none",
  focusRingClassName,
);

export interface ReplicationShowcaseProps {
  /** Compact works rendered in the article card. */
  works: readonly ShowcaseWork[];
  /** Complete source collection walked by the expanded viewer. */
  collectionWorks?: readonly ShowcaseWork[];
  /** The full matched-corpus size; drives the "+N" affordance. */
  totalCount?: number;
  /** The owning substance article's slug. */
  substanceSlug?: string;
  /** The owning effect article's slug. */
  effectSlug?: string;
  /** Persistent identity shown by the expanded viewer. */
  collectionLabel?: string;
}

/**
 * The Replication Showcase: a height-capped 16:9 stage carrying every control
 * as a compact on-media overlay, rendered as the last child of the Subjective
 * Effects visual group. Figure scale, not hero scale: callers cap `works`
 * (SHOWCASE_WORK_CAP) and the rail closes with a "+N" gallery link.
 *
 * Overlay anatomy — none of it changes the stage's shape or size:
 *  - top scrim: title (→ permalink), artist (→ profile / own site), the
 *    demonstrated effect chip, and the rights glyph;
 *  - mid rails: wrap-around previous/next arrows, far left and right;
 *  - bottom scrim: the manual-activation thumbnail tablist plus the video
 *    controls (pause and mute/unmute) on the right.
 *
 * Selection is static — no auto-advance timer; the only motion loop is the
 * active motion itself, under the autoplay gate (in viewport ∧ fine pointer ∧
 * motion-ok) unless the reader's own play/pause verdict overrides it. Inline
 * motion is always muted and letterboxed with `object-contain`, never cropped:
 * a replication's composition is the content.
 */
export function ReplicationShowcase({
  works,
  collectionWorks = works,
  totalCount,
  substanceSlug,
  effectSlug,
  collectionLabel,
}: ReplicationShowcaseProps) {
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * The reader's explicit play/pause verdict for one work; it outranks the
   * autoplay gate in both directions until the selection changes.
   */
  const [playOverride, setPlayOverride] = useState<{
    slug: string;
    playing: boolean;
  } | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const playbackAllowances = useMotionAllowed();
  const autoplayAllowed =
    playbackAllowances.autoplay && playbackAllowances.hoverPreview;
  const { ref: stageRef, inView } = useStageInView();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);
  const viewerCollection = useMemo<ReplicationViewerCollection>(() => {
    const label =
      collectionLabel ??
      (substanceSlug
        ? "Substance replications"
        : effectSlug
          ? `${works[0]?.effectName ?? "Effect"} replications`
          : "Replications");
    return {
      label,
      sourcePath: substanceSlug
        ? publicHref.substance(substanceSlug)
        : effectSlug
          ? publicHref.effect(effectSlug)
          : publicHref.replications(),
      kind: substanceSlug ? "substance" : effectSlug ? "effect" : "gallery",
      grouping: "none",
      groups: [
        {
          key: substanceSlug ?? effectSlug ?? "replications",
          label,
          items: collectionWorks.map((work) => ({
            replication: {
              slug: work.slug,
              title: work.title,
              artist: work.artistName ?? "Unknown",
              type: work.type,
              format: work.format ?? (work.type === "video" ? "mp4" : "image"),
              url: work.url,
              thumbnail_url: work.thumbnailUrl,
              preview_url: work.previewUrl,
              motion_url: work.motionUrl,
              motion_poster_url: work.motionPosterUrl,
              width: work.width,
              height: work.height,
              duration: work.duration,
            },
            effectName: work.effectName,
            effectSlug: work.effectSlug,
            effectCategories: [],
            artistProfileHref: work.artistHrefExternal ? null : work.artistHref,
            avatarUrl: null,
          })),
        },
      ],
    };
  }, [collectionLabel, collectionWorks, effectSlug, substanceSlug]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = parseReplicationViewerSlug(params);
    const belongsToCollection =
      slug && collectionWorks.some((work) => work.slug === slug);
    setViewerSlug(belongsToCollection ? slug : null);
    if (params.has("viewer") && !belongsToCollection) {
      const source = `${toAppPath(window.location.pathname)}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        closeReplicationViewerUrl(source),
      );
    }
  }, [collectionWorks]);

  const launchViewer = (slug: string) => {
    const source = `${toAppPath(window.location.pathname)}${window.location.search}${window.location.hash}`;
    window.history.pushState(
      { ...window.history.state, replicationViewer: true },
      "",
      buildReplicationViewerUrl(source, slug),
    );
    setViewerSlug(slug);
  };

  if (works.length === 0) return null;

  const count = works.length;
  const total = totalCount ?? count;
  const clampedIndex = Math.min(activeIndex, count - 1);
  const active = works[clampedIndex];
  const stageId = `${baseId}-stage`;
  const tabId = `${baseId}-tab`;
  const autoplayGateOpen = autoplayAllowed && inView;
  const activeGifLike = active.format?.toLowerCase() === "gif";
  const activeIsMoving =
    active.type === "video" || (activeGifLike && Boolean(active.motionUrl));
  const activePlaying =
    activeIsMoving &&
    (playOverride?.slug === active.slug
      ? playOverride.playing
      : autoplayGateOpen);

  const activate = (index: number) => {
    setActiveIndex(index);
    setPlayOverride(null);
    const work = works[index];
    setLiveMessage(
      `Replication ${index + 1} of ${count}: ${work.title}, demonstrates ${work.effectName}`,
    );
    tabRefs.current[index]?.scrollIntoView?.({
      inline: "nearest",
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  /** Manual-activation tablist: arrows/Home/End move focus, Enter/Space activates. */
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target: number | null = null;
    if (event.key === "ArrowRight") target = (index + 1) % count;
    else if (event.key === "ArrowLeft") target = (index - 1 + count) % count;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = count - 1;

    if (target !== null) {
      event.preventDefault();
      tabRefs.current[target]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(index);
    }
  };

  /** Pause remains separate from the preview tap, which always opens the viewer. */
  const videoControls =
    activeIsMoving && activePlaying ? (
      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Pause ${active.title}`}
          onClick={() => {
            setPlayOverride({ slug: active.slug, playing: false });
            setLiveMessage(`Paused ${active.title}`);
          }}
          className={cn(mediaControlClassName, "size-8")}
        >
          <Icon icon="lucide:pause" size={15} className="fill-current" />
        </button>
      </div>
    ) : null;

  return (
    <>
      <section aria-label={viewerCollection.label} className="space-y-2">
        <span className="theme-text-secondary inline-flex items-center gap-1.5 text-sm font-semibold">
          <Icon
            icon={resolveRouteChromeIcon("replications")}
            size={16}
            className="self-center"
            aria-hidden
          />
          {viewerCollection.label}
          <span aria-hidden>·</span>
          <span>{total}</span>
        </span>

        {/* One dark media card. On phones the on-media chrome leaves the
          artwork entirely: the info row sits above the media and the thumb
          band below it, as compact card rows. From `sm` up both float over
          the stage as scrim overlays (absolute positioning ignores the DOM
          order, which is kept caption-first for readers). */}
        <div className="border-dose-border relative overflow-hidden rounded-2xl border bg-[oklch(0.14_0.024_318)]">
          {/* Title, artist, demonstrated effect, rights — compact, spread
            across the card's width, never resizing the media. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5 sm:gap-y-1 sm:px-3 sm:pb-7 sm:pt-2 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:top-0 sm:z-10 sm:bg-gradient-to-b sm:from-black/75 sm:via-black/35 sm:to-transparent">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <Link
                href={buildReplicationViewerUrl(
                  viewerCollection.sourcePath,
                  active.slug,
                )}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  launchViewer(active.slug);
                }}
                className={cn(
                  "theme-media-tile-title pointer-events-auto inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold leading-tight sm:text-sm",
                  "transition-opacity hover:opacity-80",
                  focusRingClassName,
                )}
              >
                <span className="truncate">{active.title}</span>
                <span className="theme-media-tile-creator text-[10px] font-medium uppercase tracking-wide">
                  Open viewer
                </span>
                <Icon
                  icon="lucide:maximize-2"
                  size={12}
                  className="theme-media-tile-creator shrink-0"
                  aria-hidden
                />
              </Link>
              {active.artistName ? (
                <span className="theme-media-tile-creator min-w-0 truncate text-[11px] sm:text-xs">
                  by{" "}
                  {active.artistHref ? (
                    active.artistHrefExternal ? (
                      <a
                        href={active.artistHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "pointer-events-auto underline decoration-current/40 underline-offset-2",
                          "transition-opacity hover:opacity-80",
                          focusRingClassName,
                        )}
                      >
                        {active.artistName}
                      </a>
                    ) : (
                      <Link
                        href={active.artistHref}
                        className={cn(
                          "pointer-events-auto underline decoration-current/40 underline-offset-2",
                          "transition-opacity hover:opacity-80",
                          focusRingClassName,
                        )}
                      >
                        {active.artistName}
                      </Link>
                    )
                  ) : (
                    active.artistName
                  )}
                </span>
              ) : (
                <span className="theme-media-tile-creator text-[11px] sm:text-xs">
                  {active.byline}
                </span>
              )}
            </div>
            <div className="flex flex-none items-center gap-2">
              <PublicNameChip
                as={Link}
                href={publicHref.effect(active.effectSlug)}
                interactive
                icon={icons.subjectiveEffectIndex}
                aria-label={`Demonstrates: ${active.effectName}`}
                className="pointer-events-auto max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px] sm:px-2.5 sm:py-1"
              >
                {active.effectName}
              </PublicNameChip>
            </div>
          </div>
          <div
            ref={stageRef}
            role="tabpanel"
            id={stageId}
            aria-labelledby={count > 1 ? `${tabId}-${clampedIndex}` : undefined}
            aria-label={count > 1 ? undefined : active.title}
            className="relative aspect-video max-h-[380px] w-full"
          >
            {works.map((work, index) => {
              const isActive = index === clampedIndex;
              const gifLike = work.format?.toLowerCase() === "gif";
              const motionSource = gifLike ? work.motionUrl : work.url;
              const isMoving =
                work.type === "video" || (gifLike && Boolean(motionSource));
              const posterUrl = isMoving
                ? gifLike
                  ? (work.motionPosterUrl ?? work.thumbnailUrl)
                  : work.thumbnailUrl
                : gifLike
                  ? (work.motionPosterUrl ?? work.thumbnailUrl)
                  : work.url;
              const playing = isMoving && isActive && activePlaying;

              return (
                <div
                  key={work.slug}
                  aria-hidden={!isActive}
                  className={cn(
                    slideFadeClassName,
                    isActive ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  {posterUrl ? (
                    <AppImage
                      src={posterUrl}
                      alt={work.title}
                      width={1280}
                      height={800}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <MediaPlaceholder
                      icon={isMoving ? "lucide:play" : "lucide:image"}
                      title={work.title}
                    />
                  )}

                  {playing ? (
                    <video
                      src={motionSource}
                      poster={posterUrl}
                      ref={(element) => {
                        if (element) element.muted = true;
                      }}
                      autoPlay
                      muted
                      loop={shouldLoopReplicationMotion(
                        work.format ?? "",
                        work.duration,
                      )}
                      playsInline
                      preload="none"
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : null}

                  {isMoving && isActive && !playing ? (
                    <div className="absolute inset-0 z-[2] grid place-items-center bg-black/40">
                      <button
                        type="button"
                        aria-label={`Play ${work.title}`}
                        onClick={() => {
                          setPlayOverride({ slug: work.slug, playing: true });
                          setLiveMessage(`Playing ${work.title}`);
                        }}
                        className={cn(
                          "theme-media-tile-title grid size-14 place-items-center rounded-full bg-black/60",
                          "backdrop-blur-sm transition-opacity hover:opacity-85",
                          "motion-reduce:transition-none",
                          focusRingClassName,
                        )}
                      >
                        <Icon
                          icon="lucide:play"
                          size={24}
                          className="fill-current"
                        />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              aria-label={`Open ${active.title} in viewer`}
              onClick={() => launchViewer(active.slug)}
              className={cn(
                "absolute inset-0 z-[1] cursor-zoom-in",
                focusRingClassName,
              )}
            />

            {videoControls}
          </div>

          {/* The thumbnail rail: below the media on phones, a bottom scrim
            overlay from `sm` up. */}
          {count > 1 ? (
            <div className="flex items-end gap-2 px-2 pb-2 pt-1 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-black/75 sm:via-black/35 sm:to-transparent sm:pt-8">
              <div
                className={cn(
                  "pointer-events-auto flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-0.5 py-0.5",
                  // Keep scrolled thumbs from sliding under the overlaid video
                  // controls where the band and the stage corner coincide.
                  videoControls ? "sm:pr-20" : undefined,
                )}
              >
                <div
                  role="tablist"
                  aria-label="Replications"
                  className="flex gap-1.5"
                >
                  {works.map((work, index) => {
                    const selected = index === clampedIndex;
                    const gifLike = work.format?.toLowerCase() === "gif";
                    const thumbUrl =
                      work.type === "video" || gifLike
                        ? (work.motionPosterUrl ?? work.thumbnailUrl)
                        : work.url;
                    return (
                      <button
                        key={work.slug}
                        ref={(element) => {
                          tabRefs.current[index] = element;
                        }}
                        type="button"
                        role="tab"
                        id={`${tabId}-${index}`}
                        aria-selected={selected}
                        aria-controls={stageId}
                        aria-label={`${work.title} — demonstrates ${work.effectName}, ${work.byline}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => activate(index)}
                        onKeyDown={(event) => handleTabKeyDown(event, index)}
                        className={cn(
                          "relative size-9 flex-none snap-start overflow-hidden rounded-md border pointer-coarse:size-11",
                          "transition-opacity duration-150 motion-reduce:transition-none",
                          focusRingClassName,
                          selected
                            ? "border-dose-accent-strong ring-dose-accent-strong opacity-100 ring-1"
                            : "theme-media-thumbnail-border opacity-70 hover:opacity-100 focus-visible:opacity-100",
                        )}
                      >
                        {thumbUrl ? (
                          <AppImage
                            src={thumbUrl}
                            alt=""
                            width={128}
                            height={128}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <span className="theme-media-tile-creator absolute inset-0 grid place-items-center">
                            <Icon
                              icon={
                                work.type === "video"
                                  ? "lucide:play"
                                  : "lucide:image"
                              }
                              size={14}
                            />
                          </span>
                        )}
                        {work.type === "video" ? (
                          <span className="theme-media-tile-title absolute bottom-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-black/60">
                            <Icon
                              icon="lucide:play"
                              size={8}
                              className="fill-current"
                            />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {total > count ? (
                  <Link
                    href={buildReplicationViewerUrl(
                      viewerCollection.sourcePath,
                      active.slug,
                    )}
                    onClick={(event) => {
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return;
                      }
                      event.preventDefault();
                      launchViewer(active.slug);
                    }}
                    aria-label={`${total - count} more replications in ${
                      substanceSlug
                        ? "this substance's playlist"
                        : effectSlug
                          ? "this effect's playlist"
                          : "the gallery"
                    }`}
                    className={cn(
                      "grid size-9 flex-none snap-start place-items-center rounded-md pointer-coarse:size-11",
                      "theme-media-tile-title bg-black/60 text-[11px] font-semibold tabular-nums",
                      "opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100",
                      focusRingClassName,
                    )}
                  >
                    +{total - count}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <p className="theme-text-muted px-1 text-xs leading-5">
          Replication media is credited to its creator; rights remain with the
          rightsholder — see the{" "}
          <Link
            href="/docs/license#replication-media-terms"
            className={proseLinkClassName}
          >
            licensing terms
          </Link>{" "}
          to correct a credit or request removal.
        </p>

        <div aria-live="polite" role="status" className="sr-only">
          {liveMessage}
        </div>
      </section>
      {viewerSlug ? (
        <ReplicationViewerOverlay
          collection={viewerCollection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setViewerSlug(null);
          }}
        />
      ) : null}
    </>
  );
}
