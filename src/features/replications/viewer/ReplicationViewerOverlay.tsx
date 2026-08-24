"use client";

import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type ReplicationViewerMediaItem,
  type ReplicationViewerPosition,
} from "./viewerModel";
import {
  GESTURE_HINT_STORAGE_KEY,
  shouldShowGestureHint,
  standbyPosterSource,
} from "./viewerLogic";

const SWIPE_THRESHOLD_PX = 48;
/** A fast flick commits a work change well before the full swipe distance. */
const SWIPE_FLICK_MIN_PX = 20;
const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.45;
/** Movement below this keeps the gesture axis undecided (still a tap). */
const DRAG_AXIS_LOCK_PX = 8;
const SCREEN_EDGE_GUARD_PX = 24;

/** The side the incoming work enters from after a navigation. */
type EntryMotion = "left" | "right" | "top" | "bottom" | "fade";

const ENTRY_MOTION_CLASS: Record<EntryMotion, string> = {
  left: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-8 motion-safe:duration-200",
  right:
    "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-200",
  top: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-6 motion-safe:duration-200",
  bottom:
    "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-200",
  fade: "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A poster-only pane parked one viewport beside the stage. During a drag the
 * track carries it under the finger, so the incoming work is visible before
 * its real stage mounts — and its poster is warm in cache when it does.
 */
function StandbyPane({
  item,
  side,
}: {
  item: ReplicationViewerMediaItem;
  side: "left" | "right";
}) {
  const poster = standbyPosterSource(item.replication);
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        side === "left" ? "-translate-x-full" : "translate-x-full",
      )}
    >
      {poster ? (
        <AppImage
          src={poster}
          alt=""
          width={item.replication.width ?? 1600}
          height={item.replication.height ?? 900}
          priority
          unoptimized
          className="h-full w-full object-contain"
        />
      ) : null}
    </div>
  );
}

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
  /**
   * Regroup the walked collection around the work the reader is looking at.
   * Provided only by hosts whose collection supports both groupings (the
   * Gallery); named collections have exactly one order and no menu.
   */
  onRegroup?: (grouping: "artist" | "effect", currentSlug: string) => void;
}

export function ReplicationViewerOverlay({
  collection,
  initialSlug,
  open,
  onOpenChange,
  onRegroup,
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
  const [entryMotion, setEntryMotion] = useState<EntryMotion | null>(null);
  const [gestureHint, setGestureHint] = useState(false);
  const rememberedSlugByGroupRef = useRef<Record<string, string>>({});
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const pendingCommitRef = useRef<(() => void) | null>(null);
  const dragAxisRef = useRef<"x" | "y" | null>(null);
  const mediaPaneRef = useRef<HTMLDivElement>(null);
  const thumbnailRailRef = useRef<HTMLUListElement>(null);
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
    (
      next: ReplicationViewerPosition | null,
      entry: EntryMotion | null = null,
    ) => {
      if (!next) return;
      const nextItem =
        collection.groups[next.groupIndex]?.items[next.itemIndex];
      if (!nextItem) return;
      setPosition(next);
      setEntryMotion(entry);
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
      const move =
        event.key === "ArrowLeft"
          ? ([previousWork, "left"] as const)
          : event.key === "ArrowRight"
            ? ([nextWork, "right"] as const)
            : event.key === "ArrowUp"
              ? ([previousGroup, "top"] as const)
              : event.key === "ArrowDown"
                ? ([nextGroup, "bottom"] as const)
                : null;
      if (!move || !move[0]) return;
      event.preventDefault();
      navigate(move[0], move[1]);
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

  // Keep the active work visible in the thumbnail rail as navigation moves.
  useEffect(() => {
    if (!open || !position) return;
    const selected = thumbnailRailRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    selected?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [open, position]);

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

  // First-open gesture onboarding: coarse-pointer readers learn the swipe
  // grammar once, then the chip never returns on this device.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(GESTURE_HINT_STORAGE_KEY);
    } catch {
      return; // Storage denied: skip rather than nag on every open.
    }
    if (!shouldShowGestureHint(stored, coarse)) return;
    try {
      window.localStorage.setItem(GESTURE_HINT_STORAGE_KEY, "seen");
    } catch {
      // Best effort: a blocked write only means the hint may show again.
    }
    setGestureHint(true);
    const timer = window.setTimeout(() => setGestureHint(false), 9000);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!active || !position || !group) return null;
  const artistLabel = hasKnownCreator(active.replication.artist)
    ? active.replication.artist.trim()
    : "Unattributed";
  const artistProfileHref = hasKnownCreator(active.replication.artist)
    ? active.artistProfileHref
    : null;
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
          setGestureHint(false);
          pendingCommitRef.current?.();
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
          dragAxisRef.current = null;
          touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            t: event.timeStamp,
          };
        }}
        onTouchMove={(event) => {
          const start = touchStartRef.current;
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (!dragAxisRef.current) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_AXIS_LOCK_PX)
              return;
            dragAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          }
          if (dragAxisRef.current !== "x") return;
          const pane = mediaPaneRef.current;
          if (!pane) return;
          // The stage follows the finger; endpoints resist instead of moving.
          const bounded =
            (dx > 0 && !previousWork) || (dx < 0 && !nextWork) ? dx / 3 : dx;
          pane.style.transition = "none";
          pane.style.transform = `translateX(${bounded}px)`;
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          const axis = dragAxisRef.current;
          dragAxisRef.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          const snapBack = () => {
            const pane = mediaPaneRef.current;
            if (!pane?.style.transform) return;
            pane.style.transition = prefersReducedMotion()
              ? "none"
              : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
            pane.style.transform = "";
          };
          const horizontal =
            axis === "x" || (axis === null && Math.abs(dx) >= Math.abs(dy));
          if (horizontal) {
            const elapsed = Math.max(1, event.timeStamp - start.t);
            const flick =
              Math.abs(dx) >= SWIPE_FLICK_MIN_PX &&
              Math.abs(dx) / elapsed >= SWIPE_FLICK_VELOCITY_PX_PER_MS;
            const target = dx > 0 ? previousWork : nextWork;
            if ((Math.abs(dx) >= SWIPE_THRESHOLD_PX || flick) && target) {
              event.preventDefault();
              const pane = mediaPaneRef.current;
              const width = pane?.clientWidth ?? 0;
              if (!pane || width === 0 || prefersReducedMotion()) {
                if (pane) {
                  pane.style.transition = "none";
                  pane.style.transform = "";
                }
                navigate(target, null);
                return;
              }
              // Carry the drag through: the standby pane rides to center,
              // then the state swap lands on the identical frame.
              const finish = () => {
                pendingCommitRef.current = null;
                pane.style.transition = "none";
                pane.style.transform = "";
                navigate(target, null);
              };
              pendingCommitRef.current = finish;
              pane.style.transition =
                "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
              pane.style.transform = `translateX(${dx > 0 ? width : -width}px)`;
              window.setTimeout(() => {
                if (pendingCommitRef.current === finish) finish();
              }, 210);
              return;
            }
            snapBack();
            return;
          }
          if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return;
          event.preventDefault();
          navigate(
            dy > 0 ? previousGroup : nextGroup,
            dy > 0 ? "top" : "bottom",
          );
        }}
        onTouchCancel={() => {
          touchStartRef.current = null;
          dragAxisRef.current = null;
          const pane = mediaPaneRef.current;
          if (pane?.style.transform) {
            pane.style.transition = prefersReducedMotion()
              ? "none"
              : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
            pane.style.transform = "";
          }
        }}
        tabIndex={-1}
        aria-describedby="replication-viewer-description"
        className={cn(
          "theme-media-tile-title theme-elevation-none left-0 top-0 z-[70] h-[100svh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-0 bg-black p-0 duration-150 sm:rounded-none",
          immersiveFallback && "fixed inset-0",
        )}
      >
        <header
          inert={infoOpen || undefined}
          aria-hidden={infoOpen || undefined}
          className="theme-media-thumbnail-border relative z-10 flex min-w-0 items-center gap-2 border-b bg-black py-1.5 pl-3 pr-2 pt-[max(0.375rem,env(safe-area-inset-top))] sm:min-h-16 sm:gap-3 sm:px-6 sm:py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <DialogTitle className="theme-media-tile-title flex min-w-0 items-baseline gap-1.5 font-display text-sm font-semibold sm:flex-1 sm:text-base">
              {/* The group identity leads: the artist when walking artists,
                  the subjective effect when walking effects — the byline chip
                  on the stage always carries the artist either way. The work
                  title is the quieter second element. */}
              {collection.grouping === "effect" ? (
                <span className="max-w-[11rem] shrink-0 truncate sm:max-w-[16rem]">
                  {group.label}
                </span>
              ) : artistProfileHref ? (
                <Link
                  href={artistProfileHref}
                  className={cn(
                    "max-w-[11rem] shrink-0 truncate underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80 sm:max-w-[16rem]",
                    focusRingClassName,
                  )}
                >
                  {artistLabel}
                </Link>
              ) : (
                <span className="max-w-[11rem] shrink-0 truncate">
                  {artistLabel}
                </span>
              )}
              <span aria-hidden className="theme-media-tile-creator">
                ·
              </span>
              <span className="theme-media-tile-creator min-w-0 truncate text-xs font-normal sm:text-sm">
                {active.replication.title}
              </span>
            </DialogTitle>
            <DialogDescription
              id="replication-viewer-description"
              className="theme-media-tile-creator flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] tabular-nums sm:text-xs"
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
                  <span aria-hidden>·</span>
                  <span className="shrink-0">
                    {groupUnit} {position.groupIndex + 1}/
                    {collection.groups.length}
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </div>
          {collection.groups.length > 1 ? (
            <div className="flex flex-none items-center gap-1 [@media(pointer:coarse)]:hidden">
              <button
                type="button"
                aria-label={
                  previousGroup
                    ? `Previous ${groupUnit.toLowerCase()}: ${collection.groups[previousGroup.groupIndex].label}`
                    : `First ${groupUnit.toLowerCase()}`
                }
                disabled={!previousGroup}
                onClick={() => navigate(previousGroup, "top")}
                className={cn(
                  "theme-media-control-raised grid size-11 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-30 sm:size-8 sm:rounded-md",
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
                onClick={() => navigate(nextGroup, "bottom")}
                className={cn(
                  "theme-media-control-raised grid size-11 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-30 sm:size-8 sm:rounded-md",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:chevron-down" className="size-4" />
              </button>
            </div>
          ) : null}
          {onRegroup && collection.kind === "gallery" ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Viewer settings"
                  className={cn(
                    "theme-media-tile-title theme-media-control-raised grid size-11 flex-none place-items-center rounded-lg",
                    focusRingClassName,
                  )}
                >
                  <Icon icon="lucide:sliders-horizontal" className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80]">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={collection.grouping}
                  onValueChange={(value) => {
                    if (value === collection.grouping) return;
                    onRegroup(
                      value as "artist" | "effect",
                      active.replication.slug,
                    );
                  }}
                >
                  <DropdownMenuRadioItem value="artist">
                    Artist
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="effect">
                    Effect
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <button
            type="button"
            onClick={close}
            aria-label="Close replication viewer"
            className={cn(
              "theme-media-tile-title theme-media-control-raised grid size-11 flex-none place-items-center rounded-lg",
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
          <div className="relative min-h-0 min-w-0 overflow-hidden">
            <div
              ref={mediaPaneRef}
              data-replication-media-track
              className="relative h-full w-full"
            >
              {previousWork ? (
                <StandbyPane
                  key={`standby-${group.items[previousWork.itemIndex].replication.slug}`}
                  item={group.items[previousWork.itemIndex]}
                  side="left"
                />
              ) : null}
              <div
                key={active.replication.slug}
                className={cn(
                  "h-full w-full",
                  entryMotion && ENTRY_MOTION_CLASS[entryMotion],
                )}
              >
                <ReplicationMediaStage
                  item={active}
                  muted={muted}
                  volume={volume}
                  fullFrame={fullFrame}
                  onMutedChange={setMuted}
                  onVolumeChange={setVolume}
                  onFullFrameChange={setFullFrame}
                  onPrevious={
                    previousWork
                      ? () => navigate(previousWork, "left")
                      : undefined
                  }
                  onNext={
                    nextWork ? () => navigate(nextWork, "right") : undefined
                  }
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
              </div>
              {nextWork ? (
                <StandbyPane
                  key={`standby-${group.items[nextWork.itemIndex].replication.slug}`}
                  item={group.items[nextWork.itemIndex]}
                  side="right"
                />
              ) : null}
            </div>
            {gestureHint ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                <div className="theme-media-tile-title pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-black/65 px-6 py-4 backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none">
                  <div aria-hidden className="flex items-end gap-8">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon="lucide:chevron-left"
                          className="size-4 opacity-60"
                        />
                        <span className="theme-media-hint-track relative h-7 w-14">
                          <span className="theme-media-hint-dot">
                            <Icon icon="lucide:pointer" className="size-5" />
                          </span>
                        </span>
                        <Icon
                          icon="lucide:chevron-right"
                          className="size-4 opacity-60"
                        />
                      </div>
                      <p className="text-xs font-semibold">Browse works</p>
                    </div>
                    {collection.groups.length > 1 ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-col items-center gap-1">
                          <Icon
                            icon="lucide:chevron-up"
                            className="size-4 opacity-60"
                          />
                          <span className="theme-media-hint-track-y relative h-10 w-7">
                            <span className="theme-media-hint-dot-y">
                              <Icon icon="lucide:pointer" className="size-5" />
                            </span>
                          </span>
                          <Icon
                            icon="lucide:chevron-down"
                            className="size-4 opacity-60"
                          />
                        </div>
                        <p className="text-xs font-semibold">
                          Switch {groupUnit.toLowerCase()}s
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGestureHint(false)}
                    className={cn(
                      "theme-media-control-raised w-full rounded-full px-4 py-2 text-xs font-semibold",
                      focusRingClassName,
                    )}
                  >
                    Got it
                  </button>
                </div>
              </div>
            ) : null}
            <div className="absolute bottom-2 right-2 z-10 flex justify-end">
              {/* The byline rides the artwork like a broadcast bug: whatever
                  the walk is sorted by, the creator stays one tap away. */}
              {artistProfileHref ? (
                <Link
                  href={artistProfileHref}
                  className={cn(
                    "theme-media-tile-title pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/65 text-xs font-semibold backdrop-blur-sm transition-opacity hover:opacity-85",
                    active.avatarUrl ? "py-1 pl-1 pr-2.5" : "px-2.5 py-1.5",
                    focusRingClassName,
                  )}
                >
                  {active.avatarUrl ? (
                    <AppImage
                      src={active.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="size-5 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <span className="max-w-[6.5rem] truncate sm:max-w-[12rem]">
                    {artistLabel}
                  </span>
                </Link>
              ) : (
                <span className="theme-media-tile-title pointer-events-auto flex items-center rounded-full bg-black/65 px-2.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
                  <span className="max-w-[6.5rem] truncate sm:max-w-[12rem]">
                    {artistLabel}
                  </span>
                </span>
              )}
            </div>
          </div>

          {group.items.length > 1 ? (
            <nav
              aria-label={`${group.label} works`}
              className="theme-media-thumbnail-border border-t bg-black px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-2"
            >
              <ul
                ref={thumbnailRailRef}
                className="flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
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
                          navigate(
                            {
                              groupIndex: position.groupIndex,
                              itemIndex,
                            },
                            "fade",
                          )
                        }
                        className={cn(
                          "relative block size-12 overflow-hidden rounded-md border transition-opacity motion-reduce:transition-none sm:size-14",
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
            className="theme-media-tile-title theme-media-thumbnail-border theme-media-overlay-shadow absolute bottom-0 right-0 top-14 z-20 w-full max-w-md overflow-y-auto border-l bg-black/95 p-5 text-sm sm:top-20 sm:w-[26rem]"
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
