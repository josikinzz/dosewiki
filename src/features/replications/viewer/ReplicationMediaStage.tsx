"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { ReplicationViewerMediaItem } from "./viewerModel";
import { bufferedRangeContaining, seekRatioFromPointer } from "./viewerLogic";
import { useStageFit } from "./useStageFit";
import { ReplicationStillStage } from "./ReplicationStillStage";

const controlClassName = cn(
  "theme-media-tile-title grid size-11 flex-none place-items-center rounded-full bg-black/65 backdrop-blur-sm",
  "transition-opacity hover:opacity-100 active:opacity-100 motion-reduce:transition-none",
  focusRingClassName,
);

function reducedMotionRequested(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia) &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotionRequested);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function browserRequestsDataSaving(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

type AudioPresence = "unknown" | "present" | "absent";

/**
 * Read audio presence from whichever track API this browser exposes. The
 * decoded-byte counter only accumulates while audio is actually rendered, so
 * a zero on a muted (or never-unmuted) video proves nothing — "absent" is only
 * concluded from a real track API or from silent *unmuted* playback.
 */
function probeAudioPresence(video: HTMLVideoElement): AudioPresence {
  const probed = video as HTMLVideoElement & {
    mozHasAudio?: boolean;
    audioTracks?: { length: number };
    webkitAudioDecodedByteCount?: number;
  };
  if (typeof probed.mozHasAudio === "boolean") {
    return probed.mozHasAudio ? "present" : "absent";
  }
  if (probed.audioTracks) {
    return probed.audioTracks.length > 0 ? "present" : "absent";
  }
  if (typeof probed.webkitAudioDecodedByteCount === "number") {
    if (probed.webkitAudioDecodedByteCount > 0) return "present";
    return !video.muted && video.currentTime > 1 ? "absent" : "unknown";
  }
  return "unknown";
}

export interface ReplicationMediaStageProps {
  item: ReplicationViewerMediaItem;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  previousHref?: string;
  nextHref?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onInfo?: () => void;
  infoOpen?: boolean;
  infoControls?: string;
  onFullscreen?: () => void;
  fullscreenLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}

export function ReplicationMediaStage({
  item,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  onPrevious,
  onNext,
  previousHref,
  nextHref,
  onInfo,
  infoOpen = false,
  infoControls,
  onFullscreen,
  fullscreenLabel = "Fullscreen",
  previousLabel = "Previous work",
  nextLabel = "Next work",
  className,
}: ReplicationMediaStageProps) {
  const replication = item.replication;
  const gifLike = replication.format.toLowerCase() === "gif";
  const gifReady =
    gifLike && Boolean(replication.motion_url && replication.motion_poster_url);
  const motionSource = gifLike
    ? gifReady
      ? replication.motion_url
      : undefined
    : replication.url;
  const moving = replication.type === "video" || gifReady;
  const hasSafeGifFallback = gifLike && !gifReady;
  const poster = gifLike
    ? replication.motion_poster_url
    : replication.thumbnail_url;
  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Sound the reader asked for but the browser refused outside a gesture. */
  const pendingSoundRef = useRef(false);
  /** Latest shared sound state, readable from per-work effects without re-running them. */
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressBufferedRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const progressSliderRef = useRef<HTMLDivElement>(null);
  /** True while a pointer owns the playhead; the rAF meter yields to it. */
  const scrubbingRef = useRef(false);
  /** Last whole second written to aria-valuenow, deduping per-frame writes. */
  const ariaSecondRef = useRef(-1);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  /** True once the video has painted real frames; drops the poster underlay. */
  const [framePainted, setFramePainted] = useState(false);
  const ordinaryVideo = replication.type === "video";
  const knownAudio = ordinaryVideo ? replication.has_audio : false;
  const [audioPresence, setAudioPresence] = useState<AudioPresence>(
    knownAudio === true ? "present" : "unknown",
  );
  const { canRotate, rotated, toggleRotate, probeAspect } = useStageFit({
    mediaKey: replication.slug,
    type: replication.type,
    moving,
    width: replication.width,
    height: replication.height,
  });
  // Rotate-to-fit geometry: the media element alone turns 90° and swaps its
  // box to the stage's cross dimensions (container-query units resolved
  // against the stage section), so a landscape work fills the portrait
  // screen edge-to-edge while all chrome, gestures, and text stay upright.
  // A pure transform on the existing element — the <video> keeps playing.
  const mediaGeometryClassName = rotated
    ? "left-1/2 top-1/2 h-[100cqw] w-[100cqh] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90"
    : "inset-0 h-full w-full";
  // Catalogued waveform evidence beats runtime track probes: a row proven
  // silent hides sound controls outright; a row with audible signal keeps them.
  // GIF-derived motion renditions are generated silent by contract; browser
  // track APIs only decide for unprobed legacy rows.
  const soundAvailable =
    ordinaryVideo && knownAudio !== false && audioPresence !== "absent";
  // The immersive viewer always loops motion: a work never dead-ends into a
  // stopped final frame while the reader is exploring.
  const autoplayAllowed = !reducedMotion && !browserRequestsDataSaving();

  const scheduleControlHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(
      () => setControlsVisible(false),
      2600,
    );
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    const video = videoRef.current;
    if (!moving || (video && !video.paused && !video.ended)) {
      scheduleControlHide();
    } else {
      window.clearTimeout(hideTimerRef.current);
    }
  }, [moving, scheduleControlHide]);

  const toggleStillControls = useCallback(() => {
    setControlsVisible((current) => {
      window.clearTimeout(hideTimerRef.current);
      if (!current) scheduleControlHide();
      return !current;
    });
  }, [scheduleControlHide]);

  useEffect(() => {
    return () => window.clearTimeout(hideTimerRef.current);
  }, []);

  useEffect(() => {
    if (!moving) showControls();
  }, [moving, replication.slug, showControls]);

  useEffect(() => {
    setBlocked(false);
    setAudioPresence(knownAudio === true ? "present" : "unknown");
    setError(false);
    setPlaying(false);
    setControlsVisible(true);
    setFramePainted(false);
    setScrubbing(false);
    scrubbingRef.current = false;
    // A new work re-asks for the shared sound preference in the autoplay
    // effect below; any refusal re-arms the IOU there, so a stale debt from
    // the previous work never carries over.
    pendingSoundRef.current = false;
    // knownAudio is derived from the same slug change that resets here.
  }, [replication.slug]);

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    if (muted) {
      video.muted = true;
      pendingSoundRef.current = false;
    } else if (!pendingSoundRef.current) {
      // Never force an unmute while an IOU is outstanding: outside a gesture
      // WebKit answers it by pausing the video instead.
      video.muted = false;
    }
  }, [muted, volume]);

  const markBlocked = useCallback(() => {
    setBlocked(true);
    setPlaying(false);
    setControlsVisible(true);
  }, []);

  /**
   * Start playback the way phone feeds do: when the browser rejects unmuted
   * playback (iOS Safari outside a user gesture), retry muted so the work
   * keeps moving — but keep the reader's sound intent as an IOU that the
   * next gesture repays, instead of flipping the shared mute control. Only
   * surface the Play affordance when even muted playback is refused (e.g.
   * Low Power Mode).
   */
  const attemptPlay = useCallback(
    (video: HTMLVideoElement) => {
      const attempt = video.play();
      if (!attempt) return;
      void attempt.catch(() => {
        if (!video.muted) {
          video.muted = true;
          pendingSoundRef.current = true;
          const retry = video.play();
          if (retry) void retry.catch(markBlocked);
          return;
        }
        markBlocked();
      });
    },
    [markBlocked],
  );

  /**
   * Repay a refused unmute inside a live gesture; returns true when a debt
   * was repaid. Must only run from user-event handlers.
   */
  const repaySoundIou = useCallback((video: HTMLVideoElement) => {
    if (!pendingSoundRef.current) return false;
    pendingSoundRef.current = false;
    video.muted = false;
    video.volume = volumeRef.current;
    return true;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!autoplayAllowed) {
      if (!video.paused) video.pause();
      return;
    }
    // Every work re-asks for the reader's sound preference. An element the
    // reader has already unmuted inside a gesture keeps that blessing across
    // src swaps, so it simply plays with sound; an unblessed one is refused
    // and attemptPlay's muted fallback re-arms the IOU for the next tap.
    video.muted = mutedRef.current;
    video.volume = volumeRef.current;
    attemptPlay(video);
  }, [attemptPlay, autoplayAllowed, replication.slug]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    if (video.paused || video.ended) {
      repaySoundIou(video);
      attemptPlay(video);
    } else if (!repaySoundIou(video)) {
      // The reels grammar: a tap while sound is owed brings the sound back;
      // only a tap with nothing owed toggles pause.
      video.pause();
    }
  }, [attemptPlay, repaySoundIou, showControls]);

  /** Settle audio presence from track APIs as the media loads and plays. */
  const settleAudioPresence = useCallback(
    (video: HTMLVideoElement) => {
      if (!ordinaryVideo) return;
      setAudioPresence((current) => {
        if (current !== "unknown") return current;
        return probeAudioPresence(video);
      });
    },
    [ordinaryVideo],
  );

  /**
   * The catalogued duration stands in until the element reports its own —
   * seeks issued before metadata arrives still land near the right spot.
   */
  const resolveSeekDuration = useCallback(
    (video: HTMLVideoElement): number => {
      if (Number.isFinite(video.duration) && video.duration > 0)
        return video.duration;
      const catalogued = replication.duration;
      return typeof catalogued === "number" && catalogued > 0 ? catalogued : 0;
    },
    [replication.duration],
  );

  /** One direct-DOM write moves both the accent fill and its thumb. */
  const paintPlayhead = useCallback((ratio: number) => {
    const fill = progressFillRef.current;
    if (fill) fill.style.transform = `scaleX(${ratio})`;
    const thumb = progressThumbRef.current;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
  }, []);

  /** Seek to the pointer's position on the bar and paint the playhead there. */
  const seekToPointer = useCallback(
    (clientX: number) => {
      const video = videoRef.current;
      const slider = progressSliderRef.current;
      if (!video || !slider) return;
      const duration = resolveSeekDuration(video);
      if (duration <= 0) return;
      const rect = slider.getBoundingClientRect();
      const ratio = seekRatioFromPointer(clientX, rect.left, rect.width);
      video.currentTime = ratio * duration;
      paintPlayhead(ratio);
    },
    [paintPlayhead, resolveSeekDuration],
  );

  const endScrub = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      setScrubbing(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  // The compact playback meter: per-frame direct-DOM writes keep the accent
  // fill, its thumb, and the buffered layer glassy-smooth without
  // re-rendering the stage. It sweeps to the end and restarts as the loop
  // wraps; while a pointer is scrubbing, the pointer owns the playhead.
  useEffect(() => {
    if (!ordinaryVideo) return;
    ariaSecondRef.current = -1;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const { duration } = video;
        const playable = Number.isFinite(duration) && duration > 0;
        if (!scrubbingRef.current) {
          paintPlayhead(
            playable ? Math.min(video.currentTime / duration, 1) : 0,
          );
        }
        const bufferedFill = progressBufferedRef.current;
        if (bufferedFill) {
          const range = playable
            ? bufferedRangeContaining(video.buffered, video.currentTime)
            : null;
          if (range) {
            bufferedFill.style.left = `${(range.start / duration) * 100}%`;
            bufferedFill.style.width = `${((range.end - range.start) / duration) * 100}%`;
          } else {
            bufferedFill.style.width = "0%";
          }
        }
        const slider = progressSliderRef.current;
        if (slider && playable) {
          const second = Math.round(video.currentTime);
          if (second !== ariaSecondRef.current) {
            ariaSecondRef.current = second;
            slider.setAttribute("aria-valuenow", String(second));
            slider.setAttribute("aria-valuemax", String(Math.round(duration)));
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ordinaryVideo, paintPlayhead, replication.slug]);

  const width = replication.width ?? 1600;
  const height = replication.height ?? Math.round(width / (4 / 3));
  const transportVisible = moving
    ? controlsVisible || !playing || blocked || error
    : controlsVisible;
  const showWorkNavigation = Boolean(
    previousHref || nextHref || onPrevious || onNext,
  );

  return (
    <section
      ref={stageRef}
      aria-label={`${replication.title} media`}
      data-replication-media-stage
      data-controls-visible={transportVisible || undefined}
      onPointerMove={showControls}
      onFocusCapture={showControls}
      className={cn(
        "relative h-full min-h-[22rem] w-full overflow-hidden bg-black [container-type:size]",
        className,
      )}
    >
      {moving && motionSource ? (
        // Replications are non-verbal visual artworks; title, effect, creator,
        // and rights context are exposed by the surrounding viewer.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          // Deliberately unkeyed: iOS Safari's unmuted-playback blessing is
          // per-element and survives src swaps but not remounts. One element
          // carried across works is what lets sound continue seamlessly
          // through a swipe, the way the phone feeds behave.
          ref={(node) => {
            videoRef.current = node;
            // Mobile autoplay policies read the muted flag at load time, before
            // React's post-mount property sync runs.
            if (node) {
              node.defaultMuted = muted;
              node.muted = muted;
            }
          }}
          src={motionSource}
          poster={poster}
          loop
          autoPlay={autoplayAllowed}
          playsInline
          preload={autoplayAllowed ? "auto" : "metadata"}
          onClick={togglePlayback}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            probeAspect(video.videoWidth, video.videoHeight);
            video.volume = volume;
            settleAudioPresence(video);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            settleAudioPresence(video);
            if (video.currentTime > 0) setFramePainted(true);
          }}
          onPlay={() => {
            setPlaying(true);
            setBlocked(false);
            showControls();
          }}
          onPause={() => {
            setPlaying(false);
            setControlsVisible(true);
          }}
          onError={() => {
            setError(true);
            setPlaying(false);
            setControlsVisible(true);
          }}
          className={cn(
            "absolute object-contain transition-transform duration-200 motion-reduce:transition-none",
            mediaGeometryClassName,
          )}
        />
      ) : null}
      {moving && motionSource && poster ? (
        // The warm poster rides above the remounting <video> until real
        // frames paint, so a work change never flashes black. Same URL the
        // standby pane already showed — the swap lands on an identical image.
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute transition-opacity duration-200 motion-reduce:transition-none",
            mediaGeometryClassName,
            framePainted ? "opacity-0" : "opacity-100",
          )}
        >
          <AppImage
            src={poster}
            alt=""
            width={width}
            height={height}
            priority
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}
      {!(moving && motionSource) ? (
        hasSafeGifFallback ? (
          poster ? (
            <ReplicationStillStage
              src={poster}
              alt={replication.title}
              width={width}
              height={height}
              controlsVisible={controlsVisible}
              onToggleControls={toggleStillControls}
            />
          ) : (
            <div className="theme-media-tile-creator absolute inset-0 grid place-items-center px-8 text-center text-sm">
              Animation unavailable until its controllable rendition is ready.
            </div>
          )
        ) : (
          <ReplicationStillStage
            src={replication.url}
            alt={replication.title}
            width={width}
            height={height}
            controlsVisible={controlsVisible}
            onToggleControls={toggleStillControls}
          />
        )
      ) : null}

      {error ? (
        <div
          role="alert"
          className="theme-media-tile-title absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-lg bg-black/80 p-4 text-center text-sm"
        >
          This media could not be loaded. You can still open information or
          continue browsing.
        </div>
      ) : null}

      {ordinaryVideo && !error ? (
        // The YouTube grammar: a hairline meter that is secretly a full
        // slider. A tall invisible hit area owns the pointer so a scrub can
        // never read as a stage tap or a swipe; the visible track fattens
        // under the pointer and while dragging.
        <div
          ref={progressSliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(replication.duration ?? 0)}
          aria-valuenow={0}
          data-scrubbing={scrubbing || undefined}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.pointerType === "mouse" && event.button !== 0) return;
            scrubbingRef.current = true;
            setScrubbing(true);
            showControls();
            if (event.currentTarget.setPointerCapture) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            seekToPointer(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!scrubbingRef.current) return;
            event.stopPropagation();
            showControls();
            seekToPointer(event.clientX);
          }}
          onPointerUp={(event) => {
            if (!scrubbingRef.current) return;
            event.stopPropagation();
            seekToPointer(event.clientX);
            endScrub(event);
          }}
          onPointerCancel={endScrub}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
              return;
            event.preventDefault();
            event.stopPropagation();
            const video = videoRef.current;
            if (!video) return;
            const duration = resolveSeekDuration(video);
            if (duration <= 0) return;
            const step = event.key === "ArrowLeft" ? -5 : 5;
            const next = Math.min(
              Math.max(video.currentTime + step, 0),
              duration,
            );
            video.currentTime = next;
            paintPlayhead(next / duration);
            showControls();
          }}
          className={cn(
            "group absolute inset-x-0 bottom-0 z-10 flex h-5 cursor-pointer touch-none flex-col justify-end",
            focusRingClassName,
          )}
        >
          <div
            className={cn(
              "theme-media-progress-track relative h-[3px] w-full transition-[height] duration-100 group-hover:h-[5px] group-focus-visible:h-[5px] motion-reduce:transition-none",
              scrubbing && "h-[5px]",
            )}
          >
            <div
              ref={progressBufferedRef}
              aria-hidden
              className="theme-media-progress-buffered absolute inset-y-0 left-0"
              style={{ width: "0%" }}
            />
            <div
              ref={progressFillRef}
              aria-hidden
              className="theme-media-playback-fill absolute inset-y-0 left-0 w-full origin-left"
              style={{ transform: "scaleX(0)" }}
            />
            <div
              ref={progressThumbRef}
              aria-hidden
              className={cn(
                "theme-media-playback-thumb absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100",
                scrubbing && "opacity-100",
              )}
              style={{ left: "0%" }}
            />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 transition-opacity duration-200 motion-reduce:transition-none sm:p-4",
          transportVisible
            ? "opacity-100"
            : "opacity-0 [&_*]:!pointer-events-none",
        )}
      >
        <div className="flex justify-end gap-2">
          {canRotate ? (
            <button
              type="button"
              aria-label={
                rotated ? "Rotate back upright" : "Rotate to fill screen"
              }
              aria-pressed={rotated}
              onClick={(event) => {
                event.stopPropagation();
                toggleRotate();
              }}
              className={cn(controlClassName, "pointer-events-auto")}
            >
              <Icon icon="lucide:rotate-cw" className="size-5" />
            </button>
          ) : null}
          {onInfo ? (
            <button
              type="button"
              aria-label="Show information"
              aria-expanded={infoOpen}
              aria-controls={infoControls}
              onClick={(event) => {
                event.stopPropagation();
                onInfo();
              }}
              className={cn(controlClassName, "pointer-events-auto")}
            >
              <Icon icon="lucide:info" className="size-5" />
            </button>
          ) : null}
          {onFullscreen ? (
            <button
              type="button"
              aria-label={fullscreenLabel}
              onClick={(event) => {
                event.stopPropagation();
                onFullscreen();
              }}
              className={cn(controlClassName, "pointer-events-auto")}
            >
              <Icon icon="lucide:maximize" className="size-5" />
            </button>
          ) : null}
        </div>

        {/* Work navigation sits at the stage's vertical midline (the classic
            lightbox grammar), leaving the bottom corners to the byline chip
            and the centered playback controls. Touch readers swipe instead. */}
        {showWorkNavigation ? (
          previousHref && onPrevious ? (
            <a
              href={previousHref}
              rel="prev"
              aria-label={previousLabel}
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
                onPrevious();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden",
              )}
            >
              <Icon icon="lucide:chevron-left" className="size-6" />
            </a>
          ) : (
            <button
              type="button"
              aria-label={previousLabel}
              disabled={!onPrevious}
              onClick={(event) => {
                event.stopPropagation();
                onPrevious?.();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 disabled:cursor-not-allowed disabled:opacity-30 [@media(pointer:coarse)]:hidden",
              )}
            >
              <Icon icon="lucide:chevron-left" className="size-6" />
            </button>
          )
        ) : null}
        {showWorkNavigation ? (
          nextHref && onNext ? (
            <a
              href={nextHref}
              rel="next"
              aria-label={nextLabel}
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
                onNext();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden",
              )}
            >
              <Icon icon="lucide:chevron-right" className="size-6" />
            </a>
          ) : (
            <button
              type="button"
              aria-label={nextLabel}
              disabled={!onNext}
              onClick={(event) => {
                event.stopPropagation();
                onNext?.();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 disabled:cursor-not-allowed disabled:opacity-30 [@media(pointer:coarse)]:hidden",
              )}
            >
              <Icon icon="lucide:chevron-right" className="size-6" />
            </button>
          )
        ) : null}
        <div className="flex items-center justify-center gap-3">
          {moving ? (
            <div className="theme-media-tile-title pointer-events-auto flex items-center gap-2 rounded-full bg-black/65 px-2 py-1.5 backdrop-blur-sm">
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={(event) => {
                  event.stopPropagation();
                  togglePlayback();
                }}
                className={cn(
                  "grid size-9 place-items-center rounded-full",
                  focusRingClassName,
                )}
              >
                <Icon
                  icon={playing ? "lucide:pause" : "lucide:play"}
                  className="size-5"
                />
              </button>
              {soundAvailable ? (
                <>
                  <button
                    type="button"
                    aria-label={muted ? "Unmute" : "Mute"}
                    onClick={(event) => {
                      event.stopPropagation();
                      const next = !muted;
                      // Flip the element inside the gesture: WebKit only
                      // honours an unmute (and any needed replay) while the
                      // user activation is live; the state sync alone would
                      // land outside it and be refused.
                      const video = videoRef.current;
                      if (video) {
                        video.muted = next;
                        video.volume = volume;
                        // An in-gesture play() is what blesses this element
                        // for future unmuted playback on later works; calling
                        // it while already playing is a no-op.
                        if (!next && autoplayAllowed) {
                          attemptPlay(video);
                        }
                      }
                      pendingSoundRef.current = false;
                      onMutedChange(next);
                    }}
                    className={cn(
                      "grid size-9 place-items-center rounded-full",
                      focusRingClassName,
                    )}
                  >
                    <Icon
                      icon={muted ? "lucide:volume-x" : "lucide:volume-2"}
                      className="size-5"
                    />
                  </button>
                  <label
                    className="sr-only"
                    htmlFor={`replication-volume-${replication.slug}`}
                  >
                    Volume
                  </label>
                  <input
                    id={`replication-volume-${replication.slug}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) =>
                      onVolumeChange(Number(event.currentTarget.value))
                    }
                    className="hidden w-24 accent-white sm:block"
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
