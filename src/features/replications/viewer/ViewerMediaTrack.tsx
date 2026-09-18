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
import { AudioReplicationPlayer } from "@/features/effects/components/AudioReplicationPlayer";
import { audioWaveformBars } from "@/features/replications/audioWaveform";
import { Surface } from "@/components/ui/surface";
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
const NEIGHBOR_WARMUP_MS = 1000;
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
  allowNeighborPreload?: boolean;
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
  preparation: "none" | "preload" | "gesture";
  reducedMotion: boolean;
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
  preparation,
  reducedMotion,
  registerVideo,
  onProbeAspect,
  onSurfaceTap,
  controlsVisible,
}: ViewerSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioPanelRef = useRef<HTMLDivElement | null>(null);
  const [paintedSource, setPaintedSource] = useState<string | null>(null);
  const [posterAspect, setPosterAspect] = useState<{ source: string; width: number; height: number } | null>(null);
  const active = pane === CENTER;
  const activeRef = useRef(active);
  activeRef.current = active;
  const replication = item?.replication ?? null;
  const source = replication ? slideMotionSource(replication) : null;
  const poster = replication ? slidePosterSource(replication) : null;
  const gifLike = replication?.format.toLowerCase() === "gif";
  // A clip has no frame: the pooled <video> stays empty and the stage renders
  // the shared audio player instead.
  const isAudio = replication?.type === "audio";
  const paintKey = source ? `${replication?.slug}|${source}` : null;
  const knownPosterAspect = posterAspect?.source === poster ? posterAspect : null;
  const { canRotate, rotated, aspectSettled, mediaAspect, probeAspect } = useStageFit({
    mediaKey: replication ? `${replication.slug}|${replication.url}` : "",
    type: replication?.type ?? "image",
    rotateMode,
    // Audio carries no intrinsic size. Reporting a square keeps rotate-to-fit
    // from turning a transport on its side on a portrait phone.
    width: isAudio ? 1 : (replication?.width ?? knownPosterAspect?.width),
    height: isAudio ? 1 : (replication?.height ?? knownPosterAspect?.height),
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
    element.dataset.slug = replication?.slug;
    if (element.getAttribute("src") === source) return;
    silencePooledElement(element);
    assignPooledSource(element, source, {
      time: 0,
      resume: false,
      poster: gifLike ? poster : null,
    });
  }, [source, replication?.slug, gifLike, poster]);

  useLayoutEffect(() => {
    setPaintedSource(null);
    const element = videoRef.current;
    if (!element || !source || !paintKey) return;
    let cancelled = false;
    const markPainted = () => {
      if (cancelled) return;
      setPaintedSource(paintKey);
      if (!activeRef.current) demotePooledElement(element);
    };
    if (typeof element.requestVideoFrameCallback === "function") {
      const handle = element.requestVideoFrameCallback(markPainted);
      return () => {
        cancelled = true;
        element.cancelVideoFrameCallback(handle);
      };
    }
    // Metadata says nothing about a presented frame. Without rVFC, require
    // current data and a paint opportunity before uncovering the video.
    let frame = 0;
    const present = () => {
      if (frame || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markPainted();
        });
      });
    };
    present();
    element.addEventListener("loadeddata", present);
    element.addEventListener("playing", present);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      element.removeEventListener("loadeddata", present);
      element.removeEventListener("playing", present);
    };
  }, [source, paintKey]);

  useEffect(() => {
    const element = videoRef.current;
    if (element && !active) silencePooledElement(element);
  }, [active, source]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || active || !source) return;
    if (preparation !== "gesture" || paintedSource === paintKey) {
      demotePooledElement(element);
      return;
    }
    // A gesture may decode one frame, never leave an offscreen loop running.
    element.loop = false;
    warmPooledElement(element);
    const timer = window.setTimeout(() => {
      if (!activeRef.current) demotePooledElement(element);
    }, NEIGHBOR_WARMUP_MS);
    return () => {
      window.clearTimeout(timer);
      if (!activeRef.current) demotePooledElement(element);
    };
  }, [active, source, preparation, paintedSource, paintKey]);

  // Metadata from the active or selected neighbor refines catalog/poster geometry.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !source) return;
    const probe = () => probeAspect(element.videoWidth, element.videoHeight);
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) probe();
    element.addEventListener("loadedmetadata", probe);
    return () => element.removeEventListener("loadedmetadata", probe);
  }, [source, probeAspect]);

  useLayoutEffect(() => {
    if (active && aspectSettled) onProbeAspect(mediaAspect, 1);
  }, [active, aspectSettled, mediaAspect, onProbeAspect, replication?.slug]);

  // Slides stay mounted in the pool, so a clip left playing would keep going
  // from an offscreen pane. Leaving the centre stops this slide's own player.
  useEffect(() => {
    if (active) return;
    audioPanelRef.current?.querySelector("audio")?.pause();
  }, [active]);

  const width = replication?.width ?? 1600;
  const height = replication?.height ?? Math.round(width / (4 / 3));
  // Audio never reaches the still stage: `url` is the clip, and the image
  // layer would sit forever on bytes that never decode.
  const stillSource =
    !replication || isAudio
      ? null
      : gifLike
        ? (poster ?? replication.url)
        : replication.url;
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
      {/* Non-verbal artworks: creator and rights context live in the viewer. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={attachVideo}
        playsInline
        preload={active ? (saveData ? "metadata" : "auto") : preparation === "none" ? "none" : "auto"}
        className={cn("absolute object-contain", mediaGeometryClassName, !source && "hidden")}
      />
      {source && poster ? (
        <div
          key={`${paintKey}|${poster}`}
          aria-hidden
          className={cn("pointer-events-none absolute", mediaGeometryClassName)}
          style={{
            opacity: orientationPending || paintedSource === paintKey ? 0 : 1,
            transition: reducedMotion ? "none" : "opacity 140ms ease-out",
          }}
          onLoadCapture={(event) => {
            const image = event.target;
            if (image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0) {
              setPosterAspect({ source: poster, width: image.naturalWidth, height: image.naturalHeight });
            }
          }}
        >
          <AppImage
            src={poster}
            alt=""
            width={width}
            height={height}
            priority={active}
            loading={active ? "eager" : "lazy"}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}
      {!source && stillSource && replication ? (
        <div className={cn("absolute", mediaGeometryClassName)}>
          <ReplicationStillStage
            src={stillSource}
            alt={replication.title}
            width={width}
            height={height}
            priority={active}
            controlsVisible={controlsVisible}
            onToggleControls={onSurfaceTap}
            onProbeAspect={probeAspect}
          />
        </div>
      ) : null}
      {isAudio && replication ? (
        <div
          ref={audioPanelRef}
          className="absolute inset-0 flex items-center justify-center p-6"
        >
          <Surface variant="card" padding="md" radius="xl" className="w-full max-w-md">
            {/* A stable bar pattern derived from the slug, never sampled from
                the file. Without it the stage is a black rectangle with a
                transport floating in it. */}
            <div
              aria-hidden
              className="mb-4 flex h-24 items-end justify-center gap-[3px]"
            >
              {audioWaveformBars(replication.slug || replication.title, 40).map(
                (barHeight, index) => (
                  <span
                    key={index}
                    className="theme-replication-waveform-bar w-[3px] flex-none rounded-full opacity-70"
                    style={{ height: `${barHeight.toFixed(0)}%` }}
                  />
                ),
              )}
            </div>
            <AudioReplicationPlayer
              src={replication.url}
              label={replication.title}
            />
          </Surface>
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
    allowNeighborPreload = false,
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
    const [saveData, setSaveData] = useState(() =>
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    );
    const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
    useEffect(() => {
      const connection = (navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }).connection;
      const updateConnection = () => setSaveData(connection?.saveData === true);
      const updateVisibility = () => setVisible(!document.hidden);
      connection?.addEventListener?.("change", updateConnection);
      document.addEventListener("visibilitychange", updateVisibility);
      return () => {
        connection?.removeEventListener?.("change", updateConnection);
        document.removeEventListener("visibilitychange", updateVisibility);
      };
    }, []);
    const motionAllowed = autoplayAllowed && !saveData && !reducedMotion && !prefersReducedMotion();
    const canPrepareNeighbor = allowNeighborPreload && motionAllowed && visible;
    const [approachedPane, setApproachedPane] = useState<number | null>(null);
    const preparedPane = canPrepareNeighbor ? approachedPane ?? (nextItem ? 2 : null) : null;
    const committedPositionRef = useRef<string | null>(null);
    const [slotByPane, setSlotByPane] = useState<SlotByPane>([0, 1, 2, 3, 4]);
    const slotByPaneRef = useRef(slotByPane);
    slotByPaneRef.current = slotByPane;
    const slotVideosRef = useRef<(HTMLVideoElement | null)[]>([null, null, null, null, null]);
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
      setApproachedPane(null);
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
      setApproachedPane(neighborPane(axis, direction));
    }, []);

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
                preparation={pane === preparedPane ? approachedPane === null ? "preload" : "gesture" : "none"}
                reducedMotion={reducedMotion}
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
