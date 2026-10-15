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

const slideFadeClassName =
  "absolute inset-0 transition-opacity duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-100 motion-reduce:ease-linear";

const mediaControlClassName = cn(
  "theme-media-tile-title grid flex-none place-items-center rounded-full bg-black/60",
  "opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100",
  "motion-reduce:transition-none",
  focusRingClassName,
);

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
  works: readonly ShowcaseWork[];
  collectionWorks?: readonly ShowcaseWork[];
  totalCount?: number;
  collectionSource?: { kind: "substance" | "effect"; slug: string };
  substanceSlug?: string;
  effectSlug?: string;
  collectionLabel?: string;
  showCreator?: boolean;
  showHeading?: boolean;
  priority?: boolean;
  headingLevel?: 2 | 3;
  controller?: ReplicationShowcaseController;
}

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
  const [inlineMuted, setInlineMuted] = useState(true);
  const [readyMotionSource, setReadyMotionSource] = useState<string | null>(null);
  const [failedMotionSource, setFailedMotionSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const effectiveMutedRef = useRef(true);
  const attachStageVideo = useCallback((element: HTMLVideoElement | null) => {
    if (element) {
      videoRef.current = element;
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
  const useCompactPreview =
    active.type === "video" &&
    Boolean(active.previewUrl) &&
    activeEffectiveMuted &&
    playOverride?.slug !== active.slug;
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
              if (videoRef.current) videoRef.current.muted = nextMuted;
              setInlineMuted(nextMuted);
              setPlayOverride({ slug: active.slug, playing: true });
              try {
                window.sessionStorage.setItem(
                  VIEWER_SOUND_STORAGE_KEY,
                  nextMuted ? "off" : "on",
                );
              } catch {
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

  const [rightsBefore, rightsAfter] = t(
    "Replication media is credited to its creator; rights remain with the rightsholder. See the {{terms}} to correct a credit or request removal.",
  ).split("{{terms}}");

  return (
    <>
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

        <div className="border-dose-border relative overflow-hidden rounded-2xl border bg-[oklch(0.14_0.024_318)]">
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

          {count > 1 ? (
            <div className="relative z-[3] flex items-end gap-2 px-2 pb-2 pt-1 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-black/75 sm:via-black/35 sm:to-transparent sm:pt-8">
              <div
                className={cn(
                  "pointer-events-auto flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-0.5 py-0.5",
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
                        aria-label={t("{{title}}, demonstrating {{effect}}, {{byline}}", {
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
              setInlineMuted(readStoredViewerMuted());
              dismissViewerDeepLinkCover();
            }
          }}
        />
      ) : null}
    </>
  );
}
