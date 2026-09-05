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
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";
import {
  adoptPooledElement,
  assignPooledSource,
  clearPooledSource,
  demotePooledElement,
  detachPooledElement,
  silencePooledElement,
  warmPooledElement,
} from "./mediaCustody";
import { ReplicationStillStage } from "./ReplicationStillStage";
import { slideMotionSource, slidePosterSource } from "./qualityLadder";
import { useStageFit } from "./useStageFit";
import type { ReplicationViewerMediaItem } from "./viewerModel";

const SWIPE_THRESHOLD_PX = 48;
const SWIPE_FLICK_MIN_PX = 20;
const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.45;
const DRAG_AXIS_LOCK_PX = 8;
const SCREEN_EDGE_GUARD_PX = 24;
const SLIDE_TRANSITION = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
const COMMIT_FALLBACK_MS = 320;
const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, [role='slider']";
const POOL_SLOTS = [0, 1, 2, 3, 4] as const;
const PANE_OFFSETS = [[-1, 0], [0, 0], [1, 0], [0, -1], [0, 1]] as const;
const CENTER = 1;
type Axis = "x" | "y";
type Direction = 1 | -1;
/** Slots at left, center, right, above, below. DOM order never changes. */
type SlotByPane = readonly [number, number, number, number, number];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function neighborPane(axis: Axis, direction: Direction): number {
  return axis === "x" ? (direction === 1 ? 2 : 0) : (direction === 1 ? 4 : 3);
}

export interface ViewerTrackHandle {
  /** Animate and commit an adjacent work, retaining its pooled player. */
  slide: (direction: Direction) => boolean;
  /** Animate and commit an adjacent group's remembered work. */
  slideGroup: (direction: Direction) => boolean;
}

export interface ViewerMediaTrackProps {
  previousItem: ReplicationViewerMediaItem | null;
  activeItem: ReplicationViewerMediaItem;
  nextItem: ReplicationViewerMediaItem | null;
  previousGroupItem: ReplicationViewerMediaItem | null;
  nextGroupItem: ReplicationViewerMediaItem | null;
  positionKey: string;
  autoplayAllowed: boolean;
  rotateMode: boolean;
  onActiveVideoChange: (video: HTMLVideoElement | null) => void;
  onNavigateWork: (direction: Direction) => void;
  onNavigateGroup: (direction: Direction) => void;
  onSurfaceTap: () => void;
  onProbeAspect: (mediaWidth: number, mediaHeight: number) => void;
  controlsVisible: boolean;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  t: number;
  axis: Axis | null;
}

interface ViewerSlideProps {
  item: ReplicationViewerMediaItem | null;
  pane: number;
  rotateMode: boolean;
  saveData: boolean;
  registerVideo: (element: HTMLVideoElement | null) => void;
  onProbeAspect: (mediaWidth: number, mediaHeight: number) => void;
  onSurfaceTap: () => void;
  controlsVisible: boolean;
}

/** A persistent player and independently prepared geometry for one pool slot. */
function ViewerSlide({
  item,
  pane,
  rotateMode,
  saveData,
  registerVideo,
  onProbeAspect,
  onSurfaceTap,
  controlsVisible,
}: ViewerSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paintedSource, setPaintedSource] = useState<string | null>(null);
  const active = pane === CENTER;
  const replication = item?.replication ?? null;
  const source = replication ? slideMotionSource(replication) : null;
  const poster = replication ? slidePosterSource(replication) : null;
  const gifLike = replication?.format.toLowerCase() === "gif";
  const { canRotate, rotated, aspectSettled, mediaAspect, probeAspect } = useStageFit({
    mediaKey: replication ? `${replication.slug}|${replication.url}` : "",
    type: replication?.type ?? "image",
    rotateMode,
    width: replication?.width,
    height: replication?.height,
  });
  const orientationPending = canRotate && rotateMode && !aspectSettled;
  const mediaGeometryClassName = cn(
    rotated
      ? "left-1/2 top-1/2 h-[100cqw] w-[100cqh] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90"
      : "inset-0 h-full w-full",
    orientationPending && "opacity-0",
  );

  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      if (!node) {
        const previous = videoRef.current;
        videoRef.current = null;
        if (previous) detachPooledElement(previous);
        registerVideo(null);
        return;
      }
      videoRef.current = node;
      adoptPooledElement(node);
      registerVideo(node);
    },
    [registerVideo],
  );

  // Activation never changes the source. Only recycling a slot does so.
  useLayoutEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (!source) {
      delete element.dataset.slug;
      if (element.getAttribute("src")) clearPooledSource(element);
      return;
    }
    if (element.getAttribute("src") === source) return;
    silencePooledElement(element);
    element.dataset.slug = replication?.slug;
    assignPooledSource(element, source, {
      time: 0,
      resume: false,
      poster: gifLike ? poster : null,
    });
  }, [source, replication?.slug, gifLike, poster]);

  useEffect(() => {
    setPaintedSource(null);
    const element = videoRef.current;
    if (!element || !source) return;
    let cancelled = false;
    const markPainted = () => {
      if (!cancelled) setPaintedSource(source);
    };
    if (typeof element.requestVideoFrameCallback === "function") {
      const handle = element.requestVideoFrameCallback(markPainted);
      return () => {
        cancelled = true;
        element.cancelVideoFrameCallback(handle);
      };
    }
    if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markPainted();
    element.addEventListener("canplay", markPainted);
    return () => {
      cancelled = true;
      element.removeEventListener("canplay", markPainted);
    };
  }, [source]);

  useEffect(() => {
    const element = videoRef.current;
    if (element && !active) silencePooledElement(element);
  }, [active, source]);

  // Every parked video probes at metadata time, before it can enter the stage.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !source) return;
    const probe = () => probeAspect(element.videoWidth, element.videoHeight);
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) probe();
    element.addEventListener("loadedmetadata", probe);
    return () => element.removeEventListener("loadedmetadata", probe);
  }, [source, probeAspect]);

  useEffect(() => {
    if (active && aspectSettled) onProbeAspect(mediaAspect, 1);
  }, [active, aspectSettled, mediaAspect, onProbeAspect, replication?.slug]);

  const width = replication?.width ?? 1600;
  const height = replication?.height ?? Math.round(width / (4 / 3));
  const stillSource = replication
    ? gifLike ? (poster ?? replication.url) : replication.url
    : null;
  const [x, y] = PANE_OFFSETS[pane];

  return (
    <div
      aria-hidden={active ? undefined : true}
      inert={!active}
      data-viewer-pane={pane}
      data-viewer-active-pane={active || undefined}
      className={cn("absolute inset-0 overflow-hidden bg-black", !active && "pointer-events-none")}
      style={{ transform: `translate(${x * 100}%, ${y * 100}%)`, containerType: "size" }}
    >
      {source && poster && paintedSource !== source ? (
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
      {/* Non-verbal artworks: creator and rights context live in the viewer. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={attachVideo}
        playsInline
        preload={active && !saveData ? "auto" : "metadata"}
        className={cn("absolute object-contain", mediaGeometryClassName, !source && "hidden")}
      />
      {!source && stillSource && replication ? (
        <div className={cn("absolute", mediaGeometryClassName)}>
          <ReplicationStillStage
            src={stillSource}
            alt={replication.title}
            width={width}
            height={height}
            controlsVisible={controlsVisible}
            onToggleControls={onSurfaceTap}
            onProbeAspect={probeAspect}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Five fixed DOM slots follow the same gesture and commit path on both axes. */
export const ViewerMediaTrack = forwardRef<ViewerTrackHandle, ViewerMediaTrackProps>(
  function ViewerMediaTrack({
    previousItem,
    activeItem,
    nextItem,
    previousGroupItem,
    nextGroupItem,
    positionKey,
    autoplayAllowed,
    rotateMode,
    onActiveVideoChange,
    onNavigateWork,
    onNavigateGroup,
    onSurfaceTap,
    onProbeAspect,
    controlsVisible,
  }, ref) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const suppressTapRef = useRef(false);
    const commitRef = useRef<{ cancel: () => void } | null>(null);
    const reducedMotion = usePrefersReducedMotion();
    const saveData =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;
    const motionAllowed = autoplayAllowed && !saveData && !reducedMotion && !prefersReducedMotion();
    const committedPositionRef = useRef<string | null>(null);
    const [slotByPane, setSlotByPane] = useState<SlotByPane>([0, 1, 2, 3, 4]);
    const slotByPaneRef = useRef(slotByPane);
    slotByPaneRef.current = slotByPane;
    const slotVideosRef = useRef<(HTMLVideoElement | null)[]>([null, null, null, null, null]);
    const warmedSlotRef = useRef<number | null>(null);
    const slotRegistrars = useMemo(() => POOL_SLOTS.map(
      (slot) => (element: HTMLVideoElement | null) => {
        slotVideosRef.current[slot] = element;
      },
    ), []);
    const itemsByPane = [previousItem, activeItem, nextItem, previousGroupItem, nextGroupItem];
    const itemsByPaneRef = useRef(itemsByPane);
    itemsByPaneRef.current = itemsByPane;

    const pauseAllExcept = useCallback((keptSlot: number) => {
      slotVideosRef.current.forEach((element, slot) => {
        if (element && slot !== keptSlot) demotePooledElement(element);
      });
      warmedSlotRef.current = null;
    }, []);

    const activeIsMotion = slideMotionSource(activeItem.replication) !== null;
    useEffect(() => {
      onActiveVideoChange(activeIsMotion ? slotVideosRef.current[slotByPane[CENTER]] : null);
    }, [activeIsMotion, onActiveVideoChange, positionKey, slotByPane]);

    // External navigation cancels pending work. A committed rotation and this
    // reset land in one layout pass, so the incoming frame stays in place.
    useLayoutEffect(() => {
      committedPositionRef.current = null;
      commitRef.current?.cancel();
      const track = trackRef.current;
      if (track) {
        track.style.transition = "none";
        track.style.transform = "";
      }
      dragRef.current = null;
      pauseAllExcept(slotByPaneRef.current[CENTER]);
    }, [positionKey, pauseAllExcept]);

    useEffect(() => () => commitRef.current?.cancel(), []);

    const warmNeighbor = useCallback((axis: Axis, direction: Direction) => {
      if (!motionAllowed) return;
      const pane = neighborPane(axis, direction);
      const slot = itemsByPaneRef.current[pane] ? slotByPaneRef.current[pane] : null;
      if (warmedSlotRef.current === slot) return;
      if (warmedSlotRef.current !== null) {
        const previous = slotVideosRef.current[warmedSlotRef.current];
        if (previous) demotePooledElement(previous);
      }
      warmedSlotRef.current = slot;
      if (slot === null) return;
      const element = slotVideosRef.current[slot];
      if (element?.getAttribute("src") && element.paused) warmPooledElement(element);
    }, [motionAllowed]);

    const commitNavigation = useCallback((axis: Axis, direction: Direction) => {
      committedPositionRef.current = positionKey;
      const incomingPane = neighborPane(axis, direction);
      const farPane = neighborPane(axis, direction === 1 ? -1 : 1);
      const slots = slotByPaneRef.current;
      const rotated: [number, number, number, number, number] = [...slots];
      rotated[CENTER] = slots[incomingPane];
      rotated[farPane] = slots[CENTER];
      rotated[incomingPane] = slots[farPane];
      slotByPaneRef.current = rotated;
      setSlotByPane(rotated);
      pauseAllExcept(rotated[CENTER]);
      if (axis === "x") onNavigateWork(direction);
      else onNavigateGroup(direction);
    }, [onNavigateWork, onNavigateGroup, pauseAllExcept, positionKey]);

    const slideAxis = useCallback((axis: Axis, direction: Direction): boolean => {
      if (!itemsByPaneRef.current[neighborPane(axis, direction)] || commitRef.current || committedPositionRef.current === positionKey) return false;
      const track = trackRef.current;
      const distance = axis === "x" ? track?.clientWidth : track?.clientHeight;
      warmNeighbor(axis, direction);
      if (!track || !distance || prefersReducedMotion()) {
        commitNavigation(axis, direction);
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
        commitNavigation(axis, direction);
      };
      const cancel = () => {
        if (!settled) teardown();
      };
      const onEnd = (event: TransitionEvent) => {
        if (event.target === track && event.propertyName === "transform") finish();
      };
      const timer = window.setTimeout(finish, COMMIT_FALLBACK_MS);
      commitRef.current = { cancel };
      track.addEventListener("transitionend", onEnd);
      track.style.transition = SLIDE_TRANSITION;
      track.style.transform = `translate${axis.toUpperCase()}(${direction * -100}%)`;
      return true;
    }, [commitNavigation, warmNeighbor, positionKey]);

    const slide = useCallback((direction: Direction) => slideAxis("x", direction), [slideAxis]);
    const slideGroup = useCallback((direction: Direction) => slideAxis("y", direction), [slideAxis]);
    useImperativeHandle(ref, () => ({ slide, slideGroup }), [slide, slideGroup]);

    const snapBack = useCallback(() => {
      const track = trackRef.current;
      if (track?.style.transform) {
        track.style.transition = prefersReducedMotion() ? "none" : SLIDE_TRANSITION;
        track.style.transform = "";
      }
      pauseAllExcept(slotByPaneRef.current[CENTER]);
    }, [pauseAllExcept]);

    const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    }, []);

    const cancelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      suppressTapRef.current = Boolean(dragRef.current.axis);
      dragRef.current = null;
      releasePointer(event);
      snapBack();
    }, [releasePointer, snapBack]);

    return (
      // The gesture floor proxies controls and keyboard paths, not semantics.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        ref={viewportRef}
        data-replication-media-track
        className="relative h-full w-full overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if ((event.pointerType === "mouse" && event.button !== 0) || commitRef.current || dragRef.current) return;
          const target = event.target;
          if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR) && !target.closest("[data-replication-media-surface]")) return;
          if (event.pointerType === "touch" && (event.clientX <= SCREEN_EDGE_GUARD_PX || event.clientX >= window.innerWidth - SCREEN_EDGE_GUARD_PX)) return;
          suppressTapRef.current = false;
          dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, axis: null };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (!drag.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_AXIS_LOCK_PX) return;
            drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
            viewportRef.current?.setPointerCapture?.(event.pointerId);
          }
          const delta = drag.axis === "x" ? dx : dy;
          const direction = delta > 0 ? -1 : 1;
          warmNeighbor(drag.axis, direction);
          const track = trackRef.current;
          if (!track) return;
          const bounded = itemsByPaneRef.current[neighborPane(drag.axis, direction)] ? delta : delta / 3;
          track.style.transition = "none";
          track.style.transform = `translate${drag.axis.toUpperCase()}(${bounded}px)`;
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          releasePointer(event);
          if (!drag.axis) return;
          suppressTapRef.current = true;
          const delta = drag.axis === "x" ? event.clientX - drag.x : event.clientY - drag.y;
          const elapsed = Math.max(1, event.timeStamp - drag.t);
          const flick = Math.abs(delta) >= SWIPE_FLICK_MIN_PX && Math.abs(delta) / elapsed >= SWIPE_FLICK_VELOCITY_PX_PER_MS;
          if ((Math.abs(delta) >= SWIPE_THRESHOLD_PX || flick) && slideAxis(drag.axis, delta > 0 ? -1 : 1)) return;
          snapBack();
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={(event) => {
          // Taking capture from a touched video emits a bubbling loss for that
          // child. Only losing the viewport's own capture cancels the swipe.
          if (event.target === event.currentTarget) cancelDrag(event);
        }}
        onClickCapture={(event) => {
          if (!suppressTapRef.current) return;
          suppressTapRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;
          onSurfaceTap();
        }}
      >
        <div ref={trackRef} data-viewer-track-floor className="relative h-full w-full">
          {POOL_SLOTS.map((slot) => {
            const pane = slotByPane.indexOf(slot);
            return (
              <ViewerSlide
                key={slot}
                item={itemsByPane[pane]}
                pane={pane}
                rotateMode={rotateMode}
                saveData={!motionAllowed}
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
  },
);
