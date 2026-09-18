"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { isManagedResponsiveImage } from "@server/next/r2ImagePolicy";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { focusRingClassName } from "@/components/ui/surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { releaseVideoElement } from "@/lib/releaseVideoElement";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { useT } from "@/i18n/client";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import { useMotionAllowed } from "@/features/effects/gallery/inViewPlayback";
import { shouldLoopReplicationMotion } from "@/features/replications/viewer/qualityLadder";
import {
  resolveViewerMuted,
  VIEWER_SOUND_STORAGE_KEY,
} from "@/features/replications/viewer/viewerPreferences";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
import { LazyReplicationViewerOverlay } from "@/features/replications/components/LazyReplicationViewerOverlay";
import { publicHref } from "@/utils/publicHref";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import {
  dismissViewerDeepLinkCover,
  ViewerDeepLinkCover,
} from "@/features/replications/ViewerDeepLinkCover";
import type { ShowcaseWork } from "./showcaseWork";
import {
  useShowcaseViewerController,
  type ReplicationShowcaseController,
} from "./useShowcaseViewerController";

function ShowcasePoster({
  url,
  title,
  priority,
  motionPending,
  motionReady,
  motionFailed,
  unavailableDescription,
}: {
  url?: string;
  title: string;
  priority: boolean;
  motionPending: boolean;
  motionReady: boolean;
  motionFailed: boolean;
  unavailableDescription?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [poster, setPoster] = useState<"ready" | "pending" | "failed">(url ? "pending" : "ready");
  useEffect(() => {
    const image = ref.current?.querySelector("img");
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
  }, [url]);
  const loading = !motionReady && (
    poster === "pending" || (motionPending && (!url || poster === "failed"))
  );
  const unavailable = !motionReady && !loading && (
    unavailableDescription || poster === "failed" || (motionFailed && !url)
  );
  return (
    <div ref={ref} className="absolute inset-0" aria-busy={loading || undefined}>
      {loading ? (
        <span aria-hidden className="theme-skeleton-pulse theme-skeleton-pulse-soft absolute inset-0 animate-pulse motion-reduce:animate-none" />
      ) : null}
      {url && poster !== "failed" ? (
        <AppImage
          src={url}
          alt={title}
          width={1280}
          height={800}
          sizes="(max-width: 768px) 100vw, 680px"
          priority={priority}
          className={cn(
            "absolute inset-0 h-full w-full object-contain text-transparent transition-opacity duration-[180ms] motion-reduce:transition-none",
            poster === "pending" ? "opacity-0" : "opacity-100",
          )}
        />
      ) : unavailable ? (
        <MediaPlaceholder title={title} description={unavailableDescription} />
      ) : null}
    </div>
  );
}

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

/** The stored session sound choice, muted when storage is denied or unset. */
function readStoredViewerMuted(): boolean {
  try {
    return resolveViewerMuted(
      window.sessionStorage.getItem(VIEWER_SOUND_STORAGE_KEY),
    );
  } catch {
    return true;
  }
}

export interface ReplicationShowcaseProps {
  /** Compact works rendered in the article card. */
  works: readonly ShowcaseWork[];
  /** Complete source collection walked by the expanded viewer. */
  collectionWorks?: readonly ShowcaseWork[];
  /** The full matched-corpus size; drives the "+N" affordance. */
  totalCount?: number;
  /**
   * Where the complete collection can be lazily fetched
   * (`/api/replications/showcase`). When set, the server serializes only the
   * compact `works` strip; the expanded viewer's long tail — and `?viewer=`
   * deep links to works beyond the strip resolve against the fetched collection.
   * Read failures remain retryable instead of silently truncating the viewer.
   * Locale mirrors request their own translated collection.
   */
  collectionSource?: { kind: "substance" | "effect"; slug: string };
  /** The owning substance article's slug. */
  substanceSlug?: string;
  /** The owning effect article's slug. */
  effectSlug?: string;
  /** Persistent identity shown by the expanded viewer. */
  collectionLabel?: string;
  /**
   * Show the active work's creator line in the top scrim. The Artist Page
   * passes false: its identity header already names the artist, and a
   * per-stage byline would only link the page to itself.
   */
  showCreator?: boolean;
  /**
   * Render the collection heading (label · count) above the card. The
   * embed passes false: its host already heads the section, so the card
   * stands alone and the section carries the label as `aria-label`.
   */
  showHeading?: boolean;
  /** Only an above-the-fold opening stage should request eager poster loading. */
  priority?: boolean;
  /**
   * The heading's document level. Article embeds sit under a section `h2`, so
   * `3` is right there and is the default. A page whose only heading above
   * this is its `h1` (the Artist Page) passes `2`, because skipping straight
   * to `h3` leaves that outline with a hole in it.
   */
  headingLevel?: 2 | 3;
  /**
   * Page-level viewer ownership. A page that renders several showcases over
   * one collection (the Artist Page) resolves the `?viewer=` deep link and
   * mounts the overlay itself; a controlled showcase reports launches through
   * `onOpenWork` instead of opening its own overlay, renders no deep-link
   * cover, unavailable notice, or rights footnote, and writes its fallback
   * hrefs against the controller's `sourcePath`. Callers must keep the object
   * referentially stable.
   */
  controller?: ReplicationShowcaseController;
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
 *  - bottom scrim: the manual-selection thumbnail tablist plus the separate
 *    inline play/pause control.
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
  collectionSource,
  totalCount,
  substanceSlug,
  effectSlug,
  collectionLabel,
  showCreator = true,
  showHeading = true,
  priority = false,
  headingLevel = 3,
  controller,
}: ReplicationShowcaseProps) {
  const t = useT();
  const baseId = useId();
  const CollectionHeading = headingLevel === 2 ? "h2" : "h3";
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
  const {
    viewerSlug,
    unavailableViewerSlug,
    viewerCollection,
    resolveViewerCollection,
    launchViewer,
    handleViewerLinkClick,
    closeViewer,
  } = useShowcaseViewerController({
    works,
    collectionWorks,
    collectionSource,
    substanceSlug,
    effectSlug,
    collectionLabel,
    controller,
  });
  /**
   * The inline stage's mute state, shared with the fullscreen viewer through
   * its session sound preference. Muted until the mount effect below reads
   * storage, keeping the server and first client render identical.
   */
  const [inlineMuted, setInlineMuted] = useState(true);
  const [readyMotionSource, setReadyMotionSource] = useState<string | null>(null);
  const [failedMotionSource, setFailedMotionSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Latest effective muted value, readable from the stable attach callback. */
  const effectiveMutedRef = useRef(true);
  // Identity-stable on purpose: an inline ref callback re-runs per render,
  // and its detach pass would tear down the live element. On detach the
  // media pipeline is released immediately. A discarded video otherwise
  // holds its player (and any in-flight fetch) until GC, and browsers cap
  // live players per page before silently refusing new loads.
  const attachStageVideo = useCallback((element: HTMLVideoElement | null) => {
    if (element) {
      videoRef.current = element;
      // Applied by ref as well as prop: React has been unreliable about
      // reflecting `muted` onto the element.
      element.muted = effectiveMutedRef.current;
      return;
    }
    const previous = videoRef.current;
    videoRef.current = null;
    if (previous) releaseVideoElement(previous);
  }, []);

  useEffect(() => {
    setInlineMuted(readStoredViewerMuted());
  }, []);
  const controlledPlaybackRef = useRef(false);
  useEffect(() => {
    if (!controller) return;
    const video = videoRef.current;
    if (controller.viewerOpen) {
      controlledPlaybackRef.current = Boolean(video && !video.paused);
      video?.pause();
    } else {
      const muted = readStoredViewerMuted();
      setInlineMuted(muted);
      if (video) video.muted = muted;
      if (controlledPlaybackRef.current && video) void video.play().catch(() => undefined);
      controlledPlaybackRef.current = false;
    }
  }, [controller?.viewerOpen]);



  if (works.length === 0) return null;

  const count = works.length;
  const total = totalCount ?? count;
  const clampedIndex = Math.min(activeIndex, count - 1);
  const active = works[clampedIndex];
  const stageId = `${baseId}-stage`;
  const tabId = `${baseId}-tab`;
  const autoplayGateOpen = autoplayAllowed && inView;
  const collectionHeadingId = `${baseId}-collection-heading`;
  const activeGifLike = active.format?.toLowerCase() === "gif";
  const activeGifReady =
    activeGifLike && Boolean(active.motionUrl && active.motionPosterUrl);
  const activeIsMoving = active.type === "video" || activeGifReady;
  const activeHasAudio = active.type === "video" && active.hasAudio !== false;
  const activeEffectiveMuted = activeHasAudio ? inlineMuted : true;
  // Autoplay uses the stored compact, silent preview when available. Explicit
  // play or sound intent retains the full work; missing previews keep the
  // existing viewport-gated full-source behavior.
  const useCompactPreview =
    active.type === "video" &&
    Boolean(active.previewUrl) &&
    activeEffectiveMuted &&
    playOverride?.slug !== active.slug;
  // Render-phase mirror write: idempotent, read only from commit-phase
  // code (the attach callback) and gesture handlers.
  effectiveMutedRef.current = activeEffectiveMuted;
  const activeMotionSource = activeGifLike
    ? activeGifReady
      ? active.motionUrl
      : undefined
    : useCompactPreview ? active.previewUrl : active.url;
  const activePosterUrl = activeGifLike
    ? active.motionPosterUrl
    : activeIsMoving
      ? active.thumbnailUrl
      // Resize from the master for dense stages rather than enlarging a small
      // thumbnail. AppImage delivers a responsive rendition, not master bytes.
      : isManagedResponsiveImage(active.url)
        ? active.url
        : (active.thumbnailUrl ?? active.url);
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
      t("Replication {{index}} of {{count}}: {{title}}, demonstrates {{effect}}", {
        index: index + 1,
        count,
        title: work.title,
        effect: work.effectName,
      }),
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
        {activeHasAudio ? (
          <button
            type="button"
            aria-label={
              inlineMuted
                ? t("Unmute {{title}}", { title: active.title })
                : t("Mute {{title}}", { title: active.title })
            }
            onClick={() => {
              const nextMuted = !inlineMuted;
              // Flip the live element inside the gesture: browsers only
              // honor an unmute that happens during user activation.
              if (videoRef.current) videoRef.current.muted = nextMuted;
              setInlineMuted(nextMuted);
              setPlayOverride({ slug: active.slug, playing: true });
              try {
                window.sessionStorage.setItem(
                  VIEWER_SOUND_STORAGE_KEY,
                  nextMuted ? "off" : "on",
                );
              } catch {
                // Best effort: a blocked write only means the choice
                // lasts until this stage unmounts.
              }
              setLiveMessage(
                nextMuted
                  ? t("Muted {{title}}", { title: active.title })
                  : t("Unmuted {{title}}", { title: active.title }),
              );
            }}
            className={cn(mediaControlClassName, "size-11 sm:size-8")}
          >
            <Icon
              icon={inlineMuted ? "lucide:volume-x" : "lucide:volume-2"}
              size={15}
            />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t("Pause {{title}}", { title: active.title })}
          onClick={() => {
            setPlayOverride({ slug: active.slug, playing: false });
            setLiveMessage(t("Paused {{title}}", { title: active.title }));
          }}
          className={cn(mediaControlClassName, "size-11 sm:size-8")}
        >
          <Icon icon="lucide:pause" size={15} className="fill-current" />
        </button>
      </div>
    ) : null;

  // One key for the whole footnote; the link is spliced back in at its
  // placeholder so a translation can move it.
  const [rightsBefore, rightsAfter] = t(
    "Replication media is credited to its creator; rights remain with the rightsholder — see the {{terms}} to correct a credit or request removal.",
  ).split("{{terms}}");

  return (
    <>
      {/* Before the article card in document order: a `?viewer=` deep link's
          first paint is black, and the resolution effect above dismisses the
          cover if the slug is unknown here. A controlled showcase renders no
          cover or notice — the page-level controller owns both. */}
      {controller ? null : <ViewerDeepLinkCover />}
      <section
        aria-labelledby={showHeading ? collectionHeadingId : undefined}
        aria-label={showHeading ? undefined : `${viewerCollection.label} · ${total}`}
        className={showHeading ? "space-y-2" : "flex flex-col gap-2"}
      >
        {showHeading ? (
          <CollectionHeading
            id={collectionHeadingId}
            data-replication-collection-heading
            tabIndex={-1}
            className="theme-text-secondary inline-flex items-center gap-1.5 text-sm font-semibold"
          >
            <Icon
              icon={resolveRouteChromeIcon("replications")}
              size={16}
              className="self-center"
              aria-hidden
            />
            {viewerCollection.label}
            <span aria-hidden>·</span>
            <span>{total}</span>
          </CollectionHeading>
        ) : null}
        {!controller && unavailableViewerSlug ? (
          <Alert role="status">
            <AlertDescription>
              {t("The linked replication is no longer available in this collection.")}
            </AlertDescription>
          </Alert>
        ) : null}

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
                prefetch={false}
                onClick={handleViewerLinkClick(active.slug)}
                className={cn(
                  "theme-media-tile-title pointer-events-auto inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold leading-tight sm:text-sm",
                  "transition-opacity hover:opacity-80",
                  focusRingClassName,
                )}
              >
                <span className="truncate">{active.title}</span>
              </Link>
              {!showCreator ? null : hasKnownCreator(active.artistName) ? (
                <span className="theme-media-tile-creator min-w-0 truncate text-[11px] sm:text-xs">
                  {t("by")}{" "}
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
                        prefetch={false}
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
                  {t("Creator unknown")}
                </span>
              )}
            </div>
            <div className="flex flex-none items-center gap-2">
              <PublicNameChip
                as={Link}
                href={publicHref.effect(active.effectSlug)}
                prefetch={false}
                interactive
                icon={icons.subjectiveEffectIndex}
                aria-label={t("Demonstrates: {{effect}}", { effect: active.effectName })}
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
            <div
              key={active.slug}
              className={cn(slideFadeClassName, "opacity-100")}
            >
              <ShowcasePoster
                key={activePosterUrl}
                url={activePosterUrl}
                title={active.title}
                priority={priority && activeIndex === 0}
                motionPending={activePlaying && readyMotionSource !== activeMotionSource && failedMotionSource !== activeMotionSource}
                motionReady={activePlaying && readyMotionSource === activeMotionSource}
                motionFailed={failedMotionSource === activeMotionSource}
                unavailableDescription={activeGifLike && !activeGifReady
                  ? t("Animation unavailable until its controllable rendition is ready.")
                  : undefined}
              />

              {activePlaying ? (
                // Replications are non-verbal visual media: there is no
                // dialogue to caption, and title, artist and rights context
                // are exposed by the surrounding showcase chrome (same
                // grounds as the fullscreen viewer's stage video).
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={activeMotionSource}
                  ref={attachStageVideo}
                  autoPlay
                  muted={activeEffectiveMuted}
                  onLoadStart={() => {
                    setReadyMotionSource(null);
                    setFailedMotionSource(null);
                  }}
                  onLoadedData={() => setReadyMotionSource(activeMotionSource ?? null)}
                  onError={() => setFailedMotionSource(activeMotionSource ?? null)}
                  loop={useCompactPreview || shouldLoopReplicationMotion(
                    active.format ?? "",
                    active.duration,
                  )}
                  playsInline
                  // A non-looping work (no recorded duration, or 60s+) ends on
                  // whatever its last frame is — often black. Drop back to the
                  // poster + play state instead of sitting on the dead frame.
                  onEnded={() => {
                    setPlayOverride({ slug: active.slug, playing: false });
                  }}
                  preload="none"
                  className={cn(
                    "absolute inset-0 h-full w-full object-contain",
                    readyMotionSource !== activeMotionSource && "opacity-0",
                  )}
                />
              ) : null}

              {activeIsMoving && !activePlaying ? (
                <div className="absolute inset-0 z-[2] grid place-items-center bg-black/40">
                  <button
                    type="button"
                    aria-label={t("Play {{title}}", { title: active.title })}
                    onClick={() => {
                      setPlayOverride({ slug: active.slug, playing: true });
                      setLiveMessage(t("Playing {{title}}", { title: active.title }));
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

            <button
              type="button"
              aria-label={t("Open {{title}} in viewer", { title: active.title })}
              onClick={() => launchViewer(active.slug)}
              className={cn(
                "absolute inset-0 z-[1] cursor-zoom-in",
                focusRingClassName,
              )}
            />

            <Link
              href={buildReplicationViewerUrl(
                viewerCollection.sourcePath,
                active.slug,
              )}
              prefetch={false}
              onClick={handleViewerLinkClick(active.slug)}
              aria-label={t("Open viewer")}
              className={cn(
                mediaControlClassName,
                "absolute bottom-2 left-2 z-10 flex size-11 items-center justify-center",
                "gap-1.5 sm:h-8 sm:w-auto sm:px-3",
                // Clear the thumbnail rail where it overlays the stage.
                count > 1 ? "sm:bottom-14" : undefined,
              )}
            >
              <Icon icon="lucide:maximize-2" size={15} aria-hidden />
              <span className="hidden text-[11px] font-semibold sm:inline">
                {t("Open viewer")}
              </span>
            </Link>

            {videoControls}
          </div>

          {/* The thumbnail rail: below the media on phones, a bottom scrim
            overlay from `sm` up. */}
          {count > 1 ? (
            <div className="relative z-[3] flex items-end gap-2 px-2 pb-2 pt-1 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-black/75 sm:via-black/35 sm:to-transparent sm:pt-8">
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
                  aria-label={t("Replications")}
                  className="flex gap-1.5"
                >
                  {works.map((work, index) => {
                    const selected = index === clampedIndex;
                    const gifLike = work.format?.toLowerCase() === "gif";
                    const thumbUrl = gifLike
                      ? work.motionPosterUrl
                      : work.type === "video"
                        ? work.thumbnailUrl
                        : (work.thumbnailUrl ?? work.url);
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
                        aria-label={t("{{title}} — demonstrates {{effect}}, {{byline}}", {
                          title: work.title,
                          effect: work.effectName,
                          byline: work.artistName && hasKnownCreator(work.artistName)
                            ? t("by {{name}}", { name: work.artistName })
                            : t("Creator unknown"),
                        })}
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
                            sizes="44px"
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
                        {work.type === "video" ||
                        (gifLike &&
                          Boolean(work.motionUrl && work.motionPosterUrl)) ? (
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
                    prefetch={false}
                    onClick={handleViewerLinkClick(active.slug)}
                    aria-label={
                      substanceSlug
                        ? t("{{count}} more replications in this substance's playlist", { count: total - count })
                        : effectSlug
                          ? t("{{count}} more replications in this effect's playlist", { count: total - count })
                          : controller
                            ? t("{{count}} more replications in this collection", { count: total - count })
                            : t("{{count}} more replications in the gallery", { count: total - count })
                    }
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
        {/* A controlled page carries one page-level footnote instead of one
            per stage. */}
        {controller ? null : (
          <p className="theme-text-muted px-1 text-xs leading-5">
            {rightsBefore}
            <Link
              href="/docs/license#replication-media-terms"
              prefetch={false}
              className={proseLinkClassName}
            >
              {t("licensing terms")}
            </Link>
            {rightsAfter}
          </p>
        )}

        <div aria-live="polite" role="status" className="sr-only">
          {liveMessage}
        </div>
      </section>
      {!controller && viewerSlug ? (
        <LazyReplicationViewerOverlay
          collection={viewerCollection}
          resolveCollection={resolveViewerCollection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeViewer();
              // The viewer may have flipped the session sound choice.
              setInlineMuted(readStoredViewerMuted());
              dismissViewerDeepLinkCover();
            }
          }}
        />
      ) : null}
    </>
  );
}
