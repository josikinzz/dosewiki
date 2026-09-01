"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AppImage } from "@/components/common/AppImage";
import { releaseVideoElement } from "@/lib/releaseVideoElement";
import { cn } from "@/lib/utils";
import { ReplicationStillStage } from "./ReplicationStillStage";
import {
  slideMotionSource,
  slidePosterSource,
  type SlideQuality,
} from "./viewerLogic";
import type { ReplicationViewerMediaItem } from "./viewerModel";

/** Distance that commits a work change on release. */
const SWIPE_THRESHOLD_PX = 48;
/** A fast flick commits a work change well before the full swipe distance. */
const SWIPE_FLICK_MIN_PX = 20;
const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.45;
/** Movement below this keeps the gesture axis undecided (still a tap). */
const DRAG_AXIS_LOCK_PX = 8;
/** Touches this close to a screen edge belong to the OS (iOS back swipe). */
const SCREEN_EDGE_GUARD_PX = 24;
const SLIDE_TRANSITION = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
/** Commits if transitionend never fires (throttled tab, dropped frames). */
const COMMIT_FALLBACK_MS = 320;

const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, [role='slider']";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Gesture-safe verbs the overlay drives from keys, buttons, and gestures. */
export interface ViewerTrackHandle {
  /**
   * Animate one work over and commit, exactly like a completed swipe.
   * Returns false when no neighbor exists in that direction.
   */
  slide: (direction: 1 | -1) => boolean;
  /**
   * Prime every pooled media element inside a live user gesture: a play()
   * issued here marks the element user-activated, so later unmuted playback
   * on recycled elements is honoured (iOS Safari's blessing is per-element
   * and survives src swaps). Safe to call repeatedly; only the first runs.
   */
  blessPool: () => void;
}

export interface ViewerMediaTrackProps {
  /** Works surrounding the active position: previous and next may be null. */
  previousItem: ReplicationViewerMediaItem | null;
  activeItem: ReplicationViewerMediaItem;
  nextItem: ReplicationViewerMediaItem | null;
  /** Identity of the current position; any change recenters the track. */
  positionKey: string;
  /** Rendition the active slide plays; neighbors always warm the preview. */
  activeQuality: SlideQuality;
  /** Motion may start on its own (no reduced-motion / data-saver request). */
  autoplayAllowed: boolean;
  /** Rotation geometry for the active media element (from useStageFit). */
  activeMediaClassName: string;
  /** Reported whenever the active slide's video element changes (null = still). */
  onActiveVideoChange: (video: HTMLVideoElement | null) => void;
  /** A completed horizontal gesture landed one work over. */
  onNavigateWork: (direction: 1 | -1) => void;
  /** A completed vertical gesture asked for the adjacent group. */
  onNavigateGroup: (direction: 1 | -1) => void;
  /** A plain tap on the media surface (reveal/dismiss chrome, repay sound). */
  onSurfaceTap: () => void;
  /** Pointer travel over the stage (keeps the transport chrome awake). */
  onPointerActivity: () => void;
  /** Intrinsic size of the active media, for rotate-to-fit. */
  onProbeAspect: (mediaWidth: number, mediaHeight: number) => void;
  /** Chrome visibility, spoken by the active still's toggle surface. */
  controlsVisible: boolean;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  t: number;
  axis: "x" | "y" | null;
}

type Pane = -1 | 0 | 1;

/** [slot at previous pane, slot at active pane, slot at next pane]. */
type SlotByPane = readonly [number, number, number];

interface ViewerSlideProps {
  item: ReplicationViewerMediaItem | null;
  pane: Pane;
  quality: SlideQuality;
  activeMediaClassName: string;
  saveData: boolean;
  registerVideo: (element: HTMLVideoElement | null) => void;
  onProbeAspect: (mediaWidth: number, mediaHeight: number) => void;
  onSurfaceTap: () => void;
  controlsVisible: boolean;
}

/**
 * One pooled pane of the track. The `<video>` element is unconditionally
 * mounted and never keyed, so it survives every recycle: iOS Safari's
 * unmuted-playback blessing is per-element, and a remount would also leak
 * the old media pipeline until GC (browsers cap live players per page).
 * Items rotate through panes purely by src assignment and CSS transforms.
 */
function ViewerSlide({
  item,
  pane,
  quality,
  activeMediaClassName,
  saveData,
  registerVideo,
  onProbeAspect,
  onSurfaceTap,
  controlsVisible,
}: ViewerSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * True once the pooled element has decoded real frames for the CURRENT
   * work. The poster underlay lives only in the gap before that: a
   * thumbnail is an editorial crop whose aspect may differ from the video,
   * so leaving it visible would leak around the letterboxed frame.
   */
  const [framePainted, setFramePainted] = useState(false);
  const active = pane === 0;
  const replication = item?.replication ?? null;
  const motion = replication ? slideMotionSource(replication) !== null : false;
  const gifLike = replication?.format.toLowerCase() === "gif";
  const poster = replication ? slidePosterSource(replication) : null;

  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      if (!node) {
        const previous = videoRef.current;
        videoRef.current = null;
        if (previous) releaseVideoElement(previous);
        registerVideo(null);
        return;
      }
      videoRef.current = node;
      // Neighbors are always muted; the transport governs the active element.
      node.defaultMuted = true;
      node.muted = true;
      registerVideo(node);
    },
    [registerVideo],
  );

  const assignedSlug = replication && motion ? replication.slug : null;
  useEffect(() => {
    setFramePainted(false);
    const element = videoRef.current;
    if (!element || !assignedSlug) return;
    let cancelled = false;
    const markPainted = () => {
      if (!cancelled) setFramePainted(true);
    };
    if (typeof element.requestVideoFrameCallback === "function") {
      const handle = element.requestVideoFrameCallback(markPainted);
      return () => {
        cancelled = true;
        element.cancelVideoFrameCallback(handle);
      };
    }
    if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markPainted();
      return;
    }
    element.addEventListener("canplay", markPainted);
    return () => {
      cancelled = true;
      element.removeEventListener("canplay", markPainted);
    };
  }, [assignedSlug]);

  // Assign this pane's work to the pooled element. Recycles preserve the
  // element (and its blessing); only the source and poster change. A swap
  // within the same work (preview <-> full) carries playback position and
  // intent across, so a quality change never restarts the piece.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const source = replication
      ? slideMotionSource(replication, active ? quality : "preview")
      : null;
    if (!source || !replication) {
      delete element.dataset.slug;
      if (element.getAttribute("src")) {
        element.removeAttribute("src");
        element.removeAttribute("poster");
        element.load();
      }
      return;
    }
    const sameWork = element.dataset.slug === replication.slug;
    if (sameWork && element.src === source) return;
    const keepTime = sameWork ? element.currentTime : 0;
    const wasPlaying = sameWork && !element.paused && !element.ended;
    element.dataset.slug = replication.slug;
    if (gifLike && poster) element.setAttribute("poster", poster);
    else element.removeAttribute("poster");
    element.src = source;
    if (keepTime > 0) element.currentTime = keepTime;
    if (wasPlaying) {
      const resumed = element.play();
      if (resumed) void resumed.catch(() => undefined);
    }
  }, [replication, active, quality, gifLike, poster]);

  // A pane that stops being active immediately falls silent and still; the
  // incoming active element is governed by the transport instead.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || active) return;
    element.muted = true;
    element.defaultMuted = true;
    if (!element.paused) element.pause();
  }, [active, item]);

  // Rows imported before dimensions were catalogued still need a real
  // orientation for rotate-to-fit: read it off the active video itself.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !active || !motion) return;
    const probe = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        onProbeAspect(element.videoWidth, element.videoHeight);
      }
    };
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) probe();
    element.addEventListener("loadedmetadata", probe);
    return () => element.removeEventListener("loadedmetadata", probe);
  }, [active, motion, item, onProbeAspect]);

  const width = replication?.width ?? 1600;
  const height = replication?.height ?? Math.round(width / (4 / 3));
  const mediaGeometryClassName = active
    ? activeMediaClassName
    : "inset-0 h-full w-full";
  const stillSource = replication
    ? gifLike
      ? (poster ?? replication.url)
      : replication.url
    : null;

  return (
    <div
      aria-hidden={active ? undefined : true}
      data-viewer-pane={pane}
      data-viewer-active-pane={active || undefined}
      className={cn(
        "absolute inset-0 overflow-hidden bg-black",
        !active && "pointer-events-none",
      )}
      style={{ transform: `translateX(${pane * 100}%)` }}
    >
      {/* Poster underlay: the video covers it the instant real frames
          paint, and until then the pane reads as the work, never black. */}
      {motion && poster && !framePainted ? (
        <div aria-hidden className={cn("absolute", mediaGeometryClassName)}>
          <AppImage
            src={poster}
            alt=""
            width={width}
            height={height}
            priority={active}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}
      {/* Replications are non-verbal visual artworks; title, effect,
          creator, and rights context are exposed by the surrounding viewer. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={attachVideo}
        playsInline
        preload={saveData ? "metadata" : "auto"}
        className={cn(
          "absolute object-contain",
          mediaGeometryClassName,
          !motion && "hidden",
        )}
      />
      {!motion && stillSource && replication ? (
        active ? (
          <ReplicationStillStage
            src={stillSource}
            alt={replication.title}
            width={width}
            height={height}
            controlsVisible={controlsVisible}
            onToggleControls={onSurfaceTap}
            mediaClassName={cn("absolute", mediaGeometryClassName)}
            onProbeAspect={onProbeAspect}
          />
        ) : (
          <AppImage
            src={stillSource}
            alt=""
            width={width}
            height={height}
            unoptimized
            className="absolute inset-0 h-full w-full object-contain"
          />
        )
      ) : null}
    </div>
  );
}

/**
 * The swipe feed's moving floor: three pooled panes riding one translated
 * track. Neighbors hold already-buffered preview renditions, so a committed
 * swipe is pause-outgoing/play-incoming — never a media load. Gestures are
 * pointer events with capture on a touch-action-none surface, so the browser
 * never fights the drag; commits land on transitionend with a timer backstop.
 */
export const ViewerMediaTrack = forwardRef<
  ViewerTrackHandle,
  ViewerMediaTrackProps
>(function ViewerMediaTrack(
  {
    previousItem,
    activeItem,
    nextItem,
    positionKey,
    activeQuality,
    autoplayAllowed,
    activeMediaClassName,
    onActiveVideoChange,
    onNavigateWork,
    onNavigateGroup,
    onSurfaceTap,
    onPointerActivity,
    onProbeAspect,
    controlsVisible,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressTapRef = useRef(false);
  /** Non-null while a commit animation owns the track. */
  const commitRef = useRef<{ finish: () => void; cancel: () => void } | null>(
    null,
  );
  const blessedRef = useRef(false);
  /**
   * Which pool slot sits at each pane. Ring-buffer: a committed swipe
   * rotates roles so the incoming work keeps its DOM element — the
   * already-playing video simply becomes the active one.
   */
  const [slotByPane, setSlotByPane] = useState<SlotByPane>([0, 1, 2]);
  /** Mirror for event handlers and imperative callbacks. */
  const slotByPaneRef = useRef<SlotByPane>(slotByPane);
  slotByPaneRef.current = slotByPane;
  const slotVideosRef = useRef<(HTMLVideoElement | null)[]>([
    null,
    null,
    null,
  ]);
  /**
   * Identity-stable per-slot registrars: a fresh closure per render would
   * re-run each slide's ref attach cycle, and the attach pass re-stamps
   * muted — silencing an actively unmuted work on every overlay re-render.
   */
  const slotRegistrars = useMemo(
    () =>
      [0, 1, 2].map(
        (slot) => (element: HTMLVideoElement | null) => {
          slotVideosRef.current[slot] = element;
        },
      ),
    [],
  );

  const itemsByPane: readonly [
    ReplicationViewerMediaItem | null,
    ReplicationViewerMediaItem,
    ReplicationViewerMediaItem | null,
  ] = [previousItem, activeItem, nextItem];

  // Hand the active element up whenever the position (or its slot's element)
  // changes. Runs after ref callbacks, so mounted elements are visible here.
  const activeIsMotion = slideMotionSource(activeItem.replication) !== null;
  useEffect(() => {
    onActiveVideoChange(
      activeIsMotion
        ? (slotVideosRef.current[slotByPane[1]] ?? null)
        : null,
    );
  }, [activeIsMotion, onActiveVideoChange, positionKey, slotByPane]);

  // Any position change recenters the floor instantly. After a commit the
  // pane transforms and the track reset cancel out in one layout pass, so
  // the frame the reader is watching never moves.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = "";
    dragRef.current = null;
  }, [positionKey]);

  // An in-flight commit must not outlive the track: cancel, never commit,
  // so a closing overlay cannot navigate or rewrite the URL post-unmount.
  useEffect(() => {
    return () => commitRef.current?.cancel();
  }, []);

  const pauseAllExcept = useCallback((keptSlot: number) => {
    slotVideosRef.current.forEach((element, slot) => {
      if (!element || slot === keptSlot) return;
      element.muted = true;
      if (!element.paused) element.pause();
    });
  }, []);

  /**
   * Start the neighbors' already-buffered previews the moment a horizontal
   * drag begins (a live gesture, so muted playback is always honoured): the
   * pane sliding into view is moving before the finger lifts.
   */
  const playNeighbors = useCallback(() => {
    if (!autoplayAllowed) return;
    const [previousSlot, activeSlot, nextSlot] = slotByPaneRef.current;
    for (const slot of [previousSlot, nextSlot]) {
      const element = slotVideosRef.current[slot];
      if (!element || slot === activeSlot) continue;
      if (!element.getAttribute("src") || !element.paused) continue;
      element.muted = true;
      const attempt = element.play();
      if (attempt) void attempt.catch(() => undefined);
    }
  }, [autoplayAllowed]);

  const blessPool = useCallback(() => {
    if (blessedRef.current) return;
    blessedRef.current = true;
    const activeSlot = slotByPaneRef.current[1];
    slotVideosRef.current.forEach((element, slot) => {
      if (!element || slot === activeSlot) return;
      if (!element.getAttribute("src")) return;
      element.muted = true;
      const attempt = element.play();
      if (!attempt) return;
      void attempt
        .then(() => {
          if (slot !== slotByPaneRef.current[1]) element.pause();
        })
        .catch(() => undefined);
    });
  }, []);

  const commitWork = useCallback(
    (direction: 1 | -1) => {
      const [previousSlot, activeSlot, nextSlot] = slotByPaneRef.current;
      const incoming = direction === 1 ? nextSlot : previousSlot;
      const outgoing = direction === 1 ? previousSlot : nextSlot;
      const rotated: SlotByPane =
        direction === 1
          ? [activeSlot, incoming, outgoing]
          : [outgoing, incoming, activeSlot];
      slotByPaneRef.current = rotated;
      setSlotByPane(rotated);
      pauseAllExcept(incoming);
      onNavigateWork(direction);
    },
    [onNavigateWork, pauseAllExcept],
  );

  const slide = useCallback(
    (direction: 1 | -1): boolean => {
      const target = direction === 1 ? nextItem : previousItem;
      if (!target || commitRef.current) return false;
      const track = trackRef.current;
      const width = track?.clientWidth ?? 0;
      if (!track || width === 0 || prefersReducedMotion()) {
        commitWork(direction);
        return true;
      }
      let settled = false;
      const teardown = () => {
        settled = true;
        commitRef.current = null;
        track.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
      };
      const finish = () => {
        if (settled) return;
        teardown();
        commitWork(direction);
      };
      const cancel = () => {
        if (!settled) teardown();
      };
      const onEnd = (event: TransitionEvent) => {
        if (event.target !== track || event.propertyName !== "transform")
          return;
        finish();
      };
      const timer = window.setTimeout(finish, COMMIT_FALLBACK_MS);
      commitRef.current = { finish, cancel };
      track.addEventListener("transitionend", onEnd);
      track.style.transition = SLIDE_TRANSITION;
      track.style.transform = `translateX(${direction * -100}%)`;
      return true;
    },
    [commitWork, nextItem, previousItem],
  );

  useImperativeHandle(ref, () => ({ slide, blessPool }), [slide, blessPool]);

  const snapBack = useCallback(() => {
    const track = trackRef.current;
    if (track?.style.transform) {
      track.style.transition = prefersReducedMotion()
        ? "none"
        : SLIDE_TRANSITION;
      track.style.transform = "";
    }
    pauseAllExcept(slotByPaneRef.current[1]);
  }, [pauseAllExcept]);

  const releasePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture?.(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  return (
    // The viewport is the gesture floor, not a semantic control: taps fall
    // through to it only from non-interactive space, and every action it
    // proxies has a real control or keyboard path (still surface button,
    // transport buttons, overlay shortcuts).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={viewportRef}
      data-replication-media-track
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        blessPool();
        suppressTapRef.current = false;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (commitRef.current) return;
        const target = event.target;
        // A still's whole surface is a chrome-toggle <button>; it is the
        // artwork, so drags MUST start there. Real controls stay exempt.
        if (
          target instanceof Element &&
          target.closest(INTERACTIVE_SELECTOR) &&
          !target.closest("[data-replication-media-surface]")
        ) {
          return;
        }
        if (
          event.pointerType === "touch" &&
          (event.clientX <= SCREEN_EDGE_GUARD_PX ||
            event.clientX >= window.innerWidth - SCREEN_EDGE_GUARD_PX)
        ) {
          return;
        }
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          t: event.timeStamp,
          axis: null,
        };
      }}
      onPointerMove={(event) => {
        onPointerActivity();
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.axis) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_AXIS_LOCK_PX) return;
          drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          viewportRef.current?.setPointerCapture?.(event.pointerId);
          if (drag.axis === "x") playNeighbors();
        }
        if (drag.axis !== "x") return;
        const track = trackRef.current;
        if (!track) return;
        // The floor follows the finger; endpoints resist instead of moving.
        const bounded =
          (dx > 0 && !previousItem) || (dx < 0 && !nextItem) ? dx / 3 : dx;
        track.style.transition = "none";
        track.style.transform = `translateX(${bounded}px)`;
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag || drag.pointerId !== event.pointerId) return;
        releasePointer(event);
        if (!drag.axis) return;
        suppressTapRef.current = true;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (drag.axis === "x") {
          const elapsed = Math.max(1, event.timeStamp - drag.t);
          const flick =
            Math.abs(dx) >= SWIPE_FLICK_MIN_PX &&
            Math.abs(dx) / elapsed >= SWIPE_FLICK_VELOCITY_PX_PER_MS;
          const direction: 1 | -1 = dx > 0 ? -1 : 1;
          if (
            (Math.abs(dx) >= SWIPE_THRESHOLD_PX || flick) &&
            slide(direction)
          ) {
            return;
          }
          snapBack();
          return;
        }
        if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return;
        onNavigateGroup(dy > 0 ? -1 : 1);
      }}
      onPointerCancel={(event) => {
        dragRef.current = null;
        releasePointer(event);
        snapBack();
      }}
      onClickCapture={(event) => {
        if (!suppressTapRef.current) return;
        suppressTapRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(INTERACTIVE_SELECTOR)
        ) {
          return;
        }
        onSurfaceTap();
      }}
    >
      <div
        ref={trackRef}
        data-viewer-track-floor
        className="relative h-full w-full"
      >
        {/* DOM order is fixed by slot, never by pane: React must never move
            a pooled <video> between siblings — a reinserted media element
            risks a playback hiccup and defeats the pool's whole point. Panes
            are pure transforms. */}
        {[0, 1, 2].map((slot) => {
          const paneIndex = slotByPane.indexOf(slot);
          return (
            <ViewerSlide
              key={`slot-${slot}`}
              item={itemsByPane[paneIndex]}
              pane={(paneIndex - 1) as Pane}
              quality={activeQuality}
              activeMediaClassName={activeMediaClassName}
              saveData={!autoplayAllowed}
              registerVideo={slotRegistrars[slot]}
              onProbeAspect={onProbeAspect}
              onSurfaceTap={onSurfaceTap}
              controlsVisible={controlsVisible}
            />
          );
        })}
      </div>
    </div>
  );
});
