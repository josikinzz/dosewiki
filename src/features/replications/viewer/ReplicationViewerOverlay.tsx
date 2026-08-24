"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { focusRingClassName } from "@/components/ui/surface";
import { toAppPath } from "@/utils/previewPath";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "@/features/replications/galleryUrlState";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { ReplicationMediaStage } from "./ReplicationMediaStage";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import {
  findViewerPosition,
  moveViewerGroup,
  moveViewerWork,
  type ReplicationViewerCollection,
  type ReplicationViewerPosition,
} from "./viewerModel";

const SWIPE_THRESHOLD_PX = 48;
const SCREEN_EDGE_GUARD_PX = 24;

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};
interface PublicReplicationDetails {
  slug: string;
  format: string;
  created_at?: string;
  date_info?: {
    value?: string;
    kind: string;
    event_type?: string;
    confidence: string;
  };
  duration?: number;
  width?: number;
  height?: number;
  rights?: {
    status?: string;
    license_name?: string;
    license_url?: string;
    credit_line?: string;
    source_url?: string;
    rightsholder?: string;
  };
}

export interface ReplicationViewerOverlayProps {
  collection: ReplicationViewerCollection;
  initialSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReplicationViewerOverlay({
  collection,
  initialSlug,
  open,
  onOpenChange,
}: ReplicationViewerOverlayProps) {
  const initialPosition = useMemo(
    () => findViewerPosition(collection, initialSlug),
    [collection, initialSlug],
  );
  const [position, setPosition] = useState<ReplicationViewerPosition | null>(
    initialPosition,
  );
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [fullFrame, setFullFrame] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [details, setDetails] = useState<PublicReplicationDetails | null>(null);
  const [immersiveFallback, setImmersiveFallback] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const rememberedSlugByGroupRef = useRef<Record<string, string>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pausedBackgroundVideosRef = useRef<HTMLVideoElement[]>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const sourceFocusTargetRef = useRef<HTMLElement | null>(null);
  const infoOpenerRef = useRef<HTMLElement | null>(null);
  const infoCloseRef = useRef<HTMLButtonElement | null>(null);
  const infoPanelId = useId();
  const infoHeadingId = useId();

  const group = position ? collection.groups[position.groupIndex] : null;
  const active = group && position ? group.items[position.itemIndex] : null;

  useEffect(() => {
    const next = findViewerPosition(collection, initialSlug);
    setPosition(next);
    setInfoOpen(false);
    setDetails(null);
  }, [collection, initialSlug]);

  useEffect(() => {
    if (!open || !active) return;
    rememberedSlugByGroupRef.current[group!.key] = active.replication.slug;
  }, [active, group, open]);

  useEffect(() => {
    if (!open) {
      setMuted(true);
      setVolume(1);
      setFullFrame(false);
      setInfoOpen(false);
      setImmersiveFallback(false);
      rememberedSlugByGroupRef.current = {};
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const pauseBackgroundVideo = (video: HTMLVideoElement) => {
      const dialog = contentRef.current;
      if (!dialog || dialog.contains(video) || video.paused) return;
      if (!pausedBackgroundVideosRef.current.includes(video)) {
        pausedBackgroundVideosRef.current.push(video);
      }
      video.pause();
    };
    const stopBackgroundPlayback = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) {
        pauseBackgroundVideo(event.target);
      }
    };
    document.addEventListener("play", stopBackgroundPlayback, true);

    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll("video").forEach(pauseBackgroundVideo);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("play", stopBackgroundPlayback, true);
      const videos = pausedBackgroundVideosRef.current;
      pausedBackgroundVideosRef.current = [];
      videos.forEach((video) => {
        if (video.isConnected) {
          void video.play().catch(() => undefined);
        }
      });
    };
  }, [open]);

  const navigate = useCallback(
    (next: ReplicationViewerPosition | null) => {
      if (!next) return;
      const nextItem =
        collection.groups[next.groupIndex]?.items[next.itemIndex];
      if (!nextItem) return;
      setPosition(next);
      setInfoOpen(false);
      setDetails(null);
      const source = `${toAppPath(window.location.pathname)}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        buildReplicationViewerUrl(source, nextItem.replication.slug),
      );
    },
    [collection],
  );

  const openInfo = useCallback(() => {
    const activeElement = document.activeElement;
    infoOpenerRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    setInfoOpen(true);
  }, []);

  const closeInfo = useCallback(() => {
    setInfoOpen(false);
    const opener = infoOpenerRef.current;
    infoOpenerRef.current = null;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!infoOpen) return;
    const frame = window.requestAnimationFrame(() => {
      infoCloseRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [infoOpen]);

  const previousWork = position
    ? moveViewerWork(collection, position, -1)
    : null;
  const nextWork = position ? moveViewerWork(collection, position, 1) : null;
  const previousGroup = position
    ? moveViewerGroup(
        collection,
        position,
        -1,
        rememberedSlugByGroupRef.current,
      )
    : null;
  const nextGroup = position
    ? moveViewerGroup(collection, position, 1, rememberedSlugByGroupRef.current)
    : null;

  useEffect(() => {
    if (!open) return;
    if (infoOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }
      const next =
        event.key === "ArrowLeft"
          ? previousWork
          : event.key === "ArrowRight"
            ? nextWork
            : event.key === "ArrowUp"
              ? previousGroup
              : event.key === "ArrowDown"
                ? nextGroup
                : null;
      if (!next) return;
      event.preventDefault();
      navigate(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    infoOpen,
    navigate,
    nextGroup,
    nextWork,
    open,
    previousGroup,
    previousWork,
  ]);

  useEffect(() => {
    if (!open) return;
    const onPopState = () => {
      const slug = parseReplicationViewerSlug(
        new URLSearchParams(window.location.search),
      );
      if (!slug) {
        onOpenChange(false);
        return;
      }
      const restored = findViewerPosition(collection, slug);
      if (restored) setPosition(restored);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [collection, onOpenChange, open]);

  useEffect(() => {
    if (!infoOpen || !active) return;
    const controller = new AbortController();
    void fetch(`/api/v1/replications/${active.replication.slug}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.slug === active.replication.slug) {
          setDetails(body.data as PublicReplicationDetails);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active, infoOpen]);

  const close = useCallback(() => {
    const finish = () => {
      if (window.history.state?.replicationViewer === true) {
        window.history.back();
      } else {
        const source = `${toAppPath(window.location.pathname)}${window.location.search}${window.location.hash}`;
        window.history.replaceState(
          window.history.state,
          "",
          closeReplicationViewerUrl(source),
        );
        onOpenChange(false);
      }
    };

    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().finally(finish);
    } else {
      finish();
    }
  }, [onOpenChange]);

  const documentFullscreenSupported =
    typeof document !== "undefined" &&
    Boolean(document.documentElement.requestFullscreen);
  const requestFullscreen = useCallback(() => {
    const content = contentRef.current;
    const tryWebkitFullscreen = () => {
      const video =
        content?.querySelector<WebkitFullscreenVideo>("video") ?? null;
      if (!video?.webkitEnterFullscreen) return false;
      try {
        video.webkitEnterFullscreen();
        return true;
      } catch {
        return false;
      }
    };
    const useImmersiveFallback = (fullscreenRejected: boolean) => {
      if (fullscreenRejected) setFullscreenUnavailable(true);
      setImmersiveFallback(true);
      setFullscreenMessage(
        fullscreenRejected
          ? "Fullscreen is unavailable. Immersive view is active."
          : "Immersive view is active.",
      );
    };

    if (content?.requestFullscreen && !fullscreenUnavailable) {
      void content.requestFullscreen().catch(() => {
        if (!tryWebkitFullscreen()) useImmersiveFallback(true);
      });
      return;
    }
    if (!tryWebkitFullscreen()) useImmersiveFallback(false);
  }, [fullscreenUnavailable]);

  if (!active || !position || !group) return null;
  const artistLabel = hasKnownCreator(active.replication.artist)
    ? active.replication.artist.trim()
    : "Unattributed";
  const activeGifReady = Boolean(
    active.replication.motion_url && active.replication.motion_poster_url,
  );
  const movingMedia =
    active.replication.type === "video" ||
    (active.replication.format.toLowerCase() === "gif" && activeGifReady);
  const webkitFullscreenSupported =
    movingMedia &&
    typeof HTMLVideoElement !== "undefined" &&
    "webkitEnterFullscreen" in HTMLVideoElement.prototype;
  const fullscreenSupported =
    (documentFullscreenSupported && !fullscreenUnavailable) ||
    webkitFullscreenSupported;

  const groupUnit =
    collection.grouping === "artist"
      ? "Artist"
      : collection.grouping === "effect" || collection.kind === "substance"
        ? "Effect"
        : "Group";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        ref={contentRef}
        aria-modal="true"
        showClose={false}
        onOpenAutoFocus={(event) => {
          sourceFocusTargetRef.current =
            document.querySelector<HTMLElement>(
              "[data-replication-collection-heading]",
            ) ??
            document.querySelector<HTMLElement>(
              "#replications h2, #replications h3, main h1",
            );
          const activeElement = document.activeElement;
          openerRef.current =
            activeElement instanceof HTMLElement &&
            activeElement !== document.body &&
            !contentRef.current?.contains(activeElement)
              ? activeElement
              : null;
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (infoOpen) {
            event.preventDefault();
            closeInfo();
            return;
          }
          // Exit native fullscreen first without dismissing the collection.
          if (document.fullscreenElement) {
            event.preventDefault();
            void document.exitFullscreen();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            opener.focus({ preventScroll: true });
            return;
          }
          const rememberedTarget = sourceFocusTargetRef.current;
          sourceFocusTargetRef.current = null;
          const heading = rememberedTarget?.isConnected
            ? rememberedTarget
            : (document.querySelector<HTMLElement>(
                "[data-replication-collection-heading]",
              ) ??
              document.querySelector<HTMLElement>(
                "#replications h2, #replications h3, main h1",
              ));
          if (!heading) return;
          if (!heading.hasAttribute("tabindex")) {
            heading.setAttribute("tabindex", "-1");
          }
          heading.focus({ preventScroll: true });
        }}
        onTouchStart={(event) => {
          const target = event.target;
          const interactiveTarget =
            target instanceof Element
              ? target.closest("button, a, input, select, textarea")
              : null;
          if (
            !(target instanceof Element) ||
            !target.closest("[data-replication-media-stage]") ||
            (interactiveTarget &&
              !target.closest("[data-replication-media-surface]"))
          ) {
            touchStartRef.current = null;
            return;
          }
          const touch = event.changedTouches[0];
          if (
            touch.clientX <= SCREEN_EDGE_GUARD_PX ||
            touch.clientX >= window.innerWidth - SCREEN_EDGE_GUARD_PX
          ) {
            touchStartRef.current = null;
            return;
          }
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
          event.preventDefault();
          if (Math.abs(dx) >= Math.abs(dy)) {
            navigate(dx > 0 ? previousWork : nextWork);
          } else {
            navigate(dy > 0 ? previousGroup : nextGroup);
          }
        }}
        tabIndex={-1}
        aria-describedby="replication-viewer-description"
        className={cn(
          "theme-media-tile-title theme-elevation-none left-0 top-0 z-[70] h-[100svh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-0 bg-black p-0 duration-150 sm:rounded-none",
          immersiveFallback && "fixed inset-0",
        )}
      >
        <header
          inert={infoOpen || undefined}
          aria-hidden={infoOpen || undefined}
          className="theme-media-thumbnail-border relative z-10 flex min-h-16 items-center gap-3 border-b bg-black px-4 py-2 pr-20 sm:px-6 sm:pr-20"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <DialogTitle className="theme-media-tile-title flex min-w-0 items-baseline gap-1.5 font-display text-sm font-semibold sm:flex-1 sm:text-base">
              <span className="min-w-0 truncate">
                {active.replication.title}
              </span>
              <span aria-hidden className="theme-media-tile-creator">
                ·
              </span>
              <span className="theme-media-tile-creator max-w-[12rem] shrink-0 truncate">
                {artistLabel}
              </span>
            </DialogTitle>
            <DialogDescription
              id="replication-viewer-description"
              className="theme-media-tile-creator flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums sm:text-xs"
            >
              <span className="max-w-[9rem] truncate sm:max-w-[16rem]">
                {collection.label}
              </span>
              <span aria-hidden>·</span>
              <span className="shrink-0">
                Work {position.itemIndex + 1}/{group.items.length}
              </span>
              {collection.groups.length > 1 ? (
                <>
                  {collection.grouping === "effect" ? (
                    <>
                      <span aria-hidden>·</span>
                      <span
                        className="max-w-[8rem] truncate sm:max-w-[12rem]"
                        title={group.label}
                      >
                        {group.label}
                      </span>
                    </>
                  ) : null}
                  <span aria-hidden>·</span>
                  <span className="shrink-0">
                    {groupUnit} {position.groupIndex + 1}/
                    {collection.groups.length}
                  </span>
                </>
              ) : null}
            </DialogDescription>
            {collection.groups.length > 1 ? (
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  aria-label={
                    previousGroup
                      ? `Previous ${groupUnit.toLowerCase()}: ${collection.groups[previousGroup.groupIndex].label}`
                      : `First ${groupUnit.toLowerCase()}`
                  }
                  disabled={!previousGroup}
                  onClick={() => navigate(previousGroup)}
                  className={cn(
                    "theme-media-control-soft grid size-11 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-30 sm:size-8",
                    focusRingClassName,
                  )}
                >
                  <Icon icon="lucide:chevron-up" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={
                    nextGroup
                      ? `Next ${groupUnit.toLowerCase()}: ${collection.groups[nextGroup.groupIndex].label}`
                      : `Final ${groupUnit.toLowerCase()}`
                  }
                  disabled={!nextGroup}
                  onClick={() => navigate(nextGroup)}
                  className={cn(
                    "theme-media-control-soft grid size-11 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-30 sm:size-8",
                    focusRingClassName,
                  )}
                >
                  <Icon icon="lucide:chevron-down" className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close replication viewer"
            className={cn(
              "theme-media-tile-title theme-media-control-soft absolute right-4 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full",
              focusRingClassName,
            )}
          >
            <Icon icon="lucide:x" className="size-5" />
          </button>
        </header>
        {fullscreenMessage ? (
          <p role="status" className="sr-only">
            {fullscreenMessage}
          </p>
        ) : null}

        <div
          inert={infoOpen || undefined}
          aria-hidden={infoOpen || undefined}
          className="grid min-h-0 min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] overflow-hidden"
        >
          <ReplicationMediaStage
            item={active}
            muted={muted}
            volume={volume}
            fullFrame={fullFrame}
            onMutedChange={setMuted}
            onVolumeChange={setVolume}
            onFullFrameChange={setFullFrame}
            onPrevious={previousWork ? () => navigate(previousWork) : undefined}
            onNext={nextWork ? () => navigate(nextWork) : undefined}
            onInfo={openInfo}
            infoOpen={infoOpen}
            infoControls={infoPanelId}
            onFullscreen={requestFullscreen}
            fullscreenLabel={
              fullscreenSupported ? "Fullscreen" : "Immersive view"
            }
            previousLabel={
              previousWork
                ? `Previous: ${group.items[previousWork.itemIndex].replication.title}`
                : "First work"
            }
            nextLabel={
              nextWork
                ? `Next: ${group.items[nextWork.itemIndex].replication.title}`
                : "Final work"
            }
            className="min-h-0"
          />

          {group.items.length > 1 ? (
            <nav
              aria-label={`${group.label} works`}
              className="theme-media-thumbnail-border border-t bg-black px-3 py-2 sm:px-5"
            >
              <ul className="flex snap-x gap-2 overflow-x-auto">
                {group.items.map((item, itemIndex) => {
                  const selected = itemIndex === position.itemIndex;
                  const gifLike =
                    item.replication.format.toLowerCase() === "gif";
                  const thumb = gifLike
                    ? item.replication.motion_poster_url
                    : (item.replication.motion_poster_url ??
                      item.replication.thumbnail_url ??
                      item.replication.url);
                  return (
                    <li key={item.replication.slug} className="snap-start">
                      <button
                        type="button"
                        aria-label={`Show ${item.replication.title}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={() =>
                          navigate({
                            groupIndex: position.groupIndex,
                            itemIndex,
                          })
                        }
                        className={cn(
                          "relative block size-14 overflow-hidden rounded-md border transition-opacity motion-reduce:transition-none",
                          selected
                            ? "theme-media-thumbnail-selected opacity-100"
                            : "theme-media-thumbnail-border opacity-65 hover:opacity-100",
                          focusRingClassName,
                        )}
                      >
                        {thumb ? (
                          <AppImage
                            src={thumb}
                            alt=""
                            width={80}
                            height={80}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="theme-media-tile-creator grid h-full w-full place-items-center">
                            <Icon
                              icon="lucide:image-off"
                              size={16}
                              aria-hidden
                            />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>

        {infoOpen ? (
          <aside
            id={infoPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={infoHeadingId}
            className="theme-media-tile-title theme-media-thumbnail-border theme-media-overlay-shadow absolute bottom-0 right-0 top-20 z-20 w-full max-w-md overflow-y-auto border-l bg-black/95 p-5 text-sm sm:w-[26rem]"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id={infoHeadingId}
                className="theme-media-tile-title font-display text-lg font-semibold"
              >
                Information
              </h2>
              <button
                type="button"
                ref={infoCloseRef}
                aria-label="Close information"
                onClick={closeInfo}
                className={cn(
                  "theme-media-control-soft grid size-11 place-items-center rounded-full",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:x" className="size-5" />
              </button>
            </div>
            <dl className="theme-media-tile-creator mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <dt>Format</dt>
              <dd className="theme-media-tile-title">
                {details?.format ?? active.replication.format}
              </dd>
              {(details?.width ?? active.replication.width) &&
              (details?.height ?? active.replication.height) ? (
                <>
                  <dt>Dimensions</dt>
                  <dd className="theme-media-tile-title">
                    {details?.width ?? active.replication.width} ×{" "}
                    {details?.height ?? active.replication.height}
                  </dd>
                </>
              ) : null}
              {details?.date_info?.value || details?.created_at ? (
                <>
                  <dt>{details.date_info?.value ? "Work date" : "Added"}</dt>
                  <dd className="theme-media-tile-title">
                    <time
                      dateTime={details.date_info?.value ?? details.created_at}
                    >
                      {details.date_info?.value ?? details.created_at}
                    </time>
                  </dd>
                </>
              ) : null}
              {active.effectName ? (
                <>
                  <dt>Represents</dt>
                  <dd className="theme-media-tile-title">
                    {active.effectSlug ? (
                      <a
                        href={publicHref.effect(active.effectSlug)}
                        className="underline underline-offset-2"
                      >
                        {active.effectName}
                      </a>
                    ) : (
                      active.effectName
                    )}
                  </dd>
                </>
              ) : null}
              {details?.rights?.status ? (
                <>
                  <dt>Rights status</dt>
                  <dd className="theme-media-tile-title capitalize">
                    {details.rights.status.replace(/[_-]/g, " ")}
                  </dd>
                </>
              ) : null}
              {details?.rights?.license_name ? (
                <>
                  <dt>Licence</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.license_url ? (
                      <a
                        href={details.rights.license_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {details.rights.license_name}
                      </a>
                    ) : (
                      details.rights.license_name
                    )}
                  </dd>
                </>
              ) : null}
              {details?.rights?.rightsholder ? (
                <>
                  <dt>Rights holder</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.rightsholder}
                  </dd>
                </>
              ) : null}
              {details?.rights?.source_url ? (
                <>
                  <dt>Source</dt>
                  <dd className="theme-media-tile-title min-w-0">
                    <a
                      href={details.rights.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate underline underline-offset-2"
                    >
                      Original source
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
            <a
              href={publicHref.replication(active.replication.slug)}
              className={cn(
                "theme-media-action mt-6 inline-flex min-h-11 items-center rounded-full px-4 font-semibold",
                focusRingClassName,
              )}
            >
              Open full details
            </a>
          </aside>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
