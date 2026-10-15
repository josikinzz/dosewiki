"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Icon } from "@/components/common/Icon";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import {
  createSoundCustody,
  reloadPooledElement,
  seekPooledElement,
  type SoundCustody,
} from "./mediaCustody";
import type { ReplicationViewerMediaItem } from "./viewerModel";
import {
  bufferedRangeContaining,
  describeSeekPosition,
  formatPlaybackClock,
  seekRatioFromPointer,
} from "./seekClock";
import { shouldLoopReplicationMotion, slideMotionSource } from "./qualityLadder";
import { RotatingIcon } from "./RotatingIcon";
import { ViewerBufferingIndicator } from "./ViewerBufferingIndicator";
import {
  createViewerBuffering,
  type ViewerBufferingController,
  type ViewerBufferState,
} from "./viewerBuffering";

const glyphContourClassName =
  "[filter:drop-shadow(1px_0_0_#000)_drop-shadow(-1px_0_0_#000)_drop-shadow(0_1px_0_#000)_drop-shadow(0_-1px_0_#000)_drop-shadow(0_1px_2px_rgba(0,0,0,0.6))]";

const controlClassName = cn(
  "theme-media-tile-title grid size-11 flex-none place-items-center rounded-lg",
  glyphContourClassName,
  "transition-opacity hover:opacity-100 active:opacity-100 motion-reduce:transition-none",
  focusRingClassName,
);

const dockControlClassName = cn(
  "theme-media-tile-title pointer-events-auto grid size-11 flex-none place-items-center rounded-lg",
  glyphContourClassName,
  focusRingClassName,
);

const dockToggleOffClassName =
  "opacity-55 transition-opacity hover:opacity-85 motion-reduce:transition-none";

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

export interface ViewerTransportHandle {
  togglePlayback: () => void;
  toggleMuted: () => void;
  surfaceTap: () => void;
  toggleChrome: () => void;
}

export interface ViewerTransportProps {
  item: ReplicationViewerMediaItem;
  video: HTMLVideoElement | null;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onInfo?: () => void;
  infoOpen?: boolean;
  infoControls?: string;
  rotateMode?: boolean;
  rotated?: boolean;
  onRotateModeChange?: (rotateMode: boolean) => void;
  canRotate: boolean;
  onTransportVisibleChange?: (visible: boolean) => void;
  onBufferHealthChange?: (mediaKey: string, healthy: boolean) => void;
  onTransportHandle?: (handle: ViewerTransportHandle | null) => void;
  onFullscreen?: () => void;
  fullscreenSupported: boolean;
  previousLabel?: string;
  nextLabel?: string;
}

export function ViewerTransport({
  item,
  video,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  onPrevious,
  onNext,
  onInfo,
  infoOpen = false,
  infoControls,
  rotateMode = false,
  rotated = false,
  onRotateModeChange,
  canRotate,
  onTransportVisibleChange,
  onBufferHealthChange,
  onTransportHandle,
  onFullscreen,
  fullscreenSupported,
  previousLabel,
  nextLabel,
}: ViewerTransportProps) {
  const t = useT();
  const replication = item.replication;
  const moving = slideMotionSource(replication) !== null && video !== null;
  const ordinaryVideo = replication.type === "video";
  const knownAudio = ordinaryVideo ? replication.has_audio : false;

  const soundCustodyRef = useRef<SoundCustody | null>(null);
  const bufferingControllerRef = useRef<ViewerBufferingController | null>(null);
  const healthCallbackRef = useRef(onBufferHealthChange);
  healthCallbackRef.current = onBufferHealthChange;
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const transportRef = useRef<HTMLElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressBufferedRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const progressSliderRef = useRef<HTMLDivElement>(null);
  const timeReadoutRef = useRef<HTMLSpanElement>(null);
  const scrubbingRef = useRef(false);
  const ariaSecondRef = useRef(-1);
  const reducedMotion = useReducedMotion();
  const [playback, setPlayback] = useState<ViewerBufferState>({
    phase: null,
    wantsPlaying: false,
    blocked: false,
    error: false,
  });
  const { wantsPlaying: playing, blocked, error } = playback;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [elementMuted, setElementMuted] = useState(video?.muted ?? muted);
  const [audioPresence, setAudioPresence] = useState<AudioPresence>(
    knownAudio === true ? "present" : "unknown",
  );

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
  });

  const soundAvailable =
    ordinaryVideo && knownAudio !== false && audioPresence !== "absent";
  const autoplayAllowed = !reducedMotion && !browserRequestsDataSaving();

  const showControls = useCallback(() => setControlsVisible(true), []);

  const toggleChrome = useCallback(() => {
    scrubbingRef.current = false;
    setScrubbing(false);
    bufferingControllerRef.current?.endSeek();
    setControlsVisible((current) => !current);
  }, []);

  const markBlocked = useCallback(() => {
    bufferingControllerRef.current?.blocked();
  }, []);
  if (!soundCustodyRef.current) {
    soundCustodyRef.current = createSoundCustody({
      volume: () => volumeRef.current,
      onBlocked: markBlocked,
    });
  }
  const soundCustody = soundCustodyRef.current;

  useEffect(() => {
    setPlayback({ phase: null, wantsPlaying: false, blocked: false, error: false });
    setAudioPresence(knownAudio === true ? "present" : "unknown");
    setScrubbing(false);
    scrubbingRef.current = false;
    soundCustody.clearIou();
  }, [replication.slug]);

  const settleAudioPresence = useCallback(
    (element: HTMLVideoElement) => {
      if (!ordinaryVideo) return;
      setAudioPresence((current) =>
        current === "unknown" ? probeAudioPresence(element) : current,
      );
    },
    [ordinaryVideo],
  );

  useEffect(() => {
    if (!video || !moving || (video.dataset.slug && video.dataset.slug !== replication.slug)) {
      setPlayback({ phase: null, wantsPlaying: false, blocked: false, error: false });
      return;
    }
    const syncLoop = () => {
      video.loop = shouldLoopReplicationMotion(
        replication.format,
        replication.duration ?? video.duration,
      );
    };
    const syncMuted = () => setElementMuted(video.muted);
    const onLoadedMetadata = () => {
      syncLoop();
      soundCustody.setVolume(video);
      settleAudioPresence(video);
    };
    const onTimeUpdate = () => settleAudioPresence(video);
    video.addEventListener("play", syncMuted);
    video.addEventListener("playing", syncMuted);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("volumechange", syncMuted);
    syncMuted();
    syncLoop();
    soundCustody.applyPreference(video, mutedRef.current);
    const controller = createViewerBuffering({
      video,
      sound: soundCustody,
      autoplay: autoplayAllowed,
      onChange: setPlayback,
      onHealth: (healthy) => healthCallbackRef.current?.(replication.slug, healthy),
    });
    bufferingControllerRef.current = controller;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      settleAudioPresence(video);
    }
    return () => {
      controller.dispose();
      if (bufferingControllerRef.current === controller) bufferingControllerRef.current = null;
      video.removeEventListener("play", syncMuted);
      video.removeEventListener("playing", syncMuted);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("volumechange", syncMuted);
    };
  }, [
    autoplayAllowed,
    moving,
    replication.duration,
    replication.format,
    replication.slug,
    settleAudioPresence,
    video,
  ]);


  useEffect(() => {
    if (!video) return;
    soundCustody.applyPreference(video, muted);
    setElementMuted(video.muted);
  }, [muted, video, volume]);

  const togglePlayback = useCallback(() => {
    bufferingControllerRef.current?.togglePlayback();
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !(video?.muted ?? mutedRef.current);
    if (video) {
      soundCustody.setMuted(video, next);
      setElementMuted(next);
      if (!next) bufferingControllerRef.current?.resumeSound();
    } else {
      soundCustody.clearIou();
    }
    onMutedChange(next);
  }, [onMutedChange, video]);

  const surfaceTap = toggleChrome;

  useEffect(() => {
    if (!onTransportHandle) return;
    onTransportHandle({
      togglePlayback,
      toggleMuted,
      surfaceTap,
      toggleChrome,
    });
    return () => onTransportHandle(null);
  }, [onTransportHandle, surfaceTap, toggleChrome, toggleMuted, togglePlayback]);

  const resolveSeekDuration = useCallback(
    (element: HTMLVideoElement): number => {
      const own =
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : 0;
      const catalogued =
        typeof replication.duration === "number" && replication.duration > 0
          ? replication.duration
          : 0;
      return own > 0 ? own : catalogued;
    },
    [replication.duration],
  );

  const paintPlayhead = useCallback((ratio: number) => {
    const fill = progressFillRef.current;
    if (fill) fill.style.transform = `scaleX(${ratio})`;
    const thumb = progressThumbRef.current;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
  }, []);

  const seekToPointer = useCallback(
    (clientX: number) => {
      const slider = progressSliderRef.current;
      if (!video || !slider) return;
      const duration = resolveSeekDuration(video);
      if (duration <= 0) return;
      bufferingControllerRef.current?.beginSeek();
      const rect = slider.getBoundingClientRect();
      const ratio = seekRatioFromPointer(clientX, rect.left, rect.width);
      const target = ratio * duration;
      seekPooledElement(video, target);
      paintPlayhead(ratio);
    },
    [paintPlayhead, resolveSeekDuration, video],
  );

  const endScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    bufferingControllerRef.current?.endSeek();
  }, []);

  useEffect(() => {
    if (!ordinaryVideo || !video) return;
    ariaSecondRef.current = -1;
    let frame = 0;
    const tick = () => {
      const duration = resolveSeekDuration(video);
      const playable = duration > 0;
      if (!scrubbingRef.current) {
        paintPlayhead(playable ? Math.min(video.currentTime / duration, 1) : 0);
      }
      const bufferedFill = progressBufferedRef.current;
      if (bufferedFill) {
        const range = playable
          ? bufferedRangeContaining(video.buffered, video.currentTime)
          : null;
        bufferedFill.style.left = range
          ? `${(range.start / duration) * 100}%`
          : "0%";
        bufferedFill.style.width = range
          ? `${((range.end - range.start) / duration) * 100}%`
          : "0%";
      }
      const slider = progressSliderRef.current;
      if (slider && playable) {
        const second = Math.round(video.currentTime);
        if (second !== ariaSecondRef.current) {
          ariaSecondRef.current = second;
          slider.setAttribute("aria-valuenow", String(second));
          slider.setAttribute("aria-valuemax", String(Math.round(duration)));
          slider.setAttribute(
            "aria-valuetext",
            describeSeekPosition(video.currentTime, duration),
          );
        }
      }
      const readout = timeReadoutRef.current;
      if (readout) {
        readout.textContent = playable
          ? `${formatPlaybackClock(video.currentTime)} / ${formatPlaybackClock(duration)}`
          : "";
      }
      if (!video.paused && document.visibilityState !== "hidden") {
        frame = requestAnimationFrame(tick);
      }
    };
    const update = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState !== "hidden") tick();
    };
    const meterEvents = ["play", "pause", "timeupdate", "progress", "seeked", "loadedmetadata"];
    for (const name of meterEvents) video.addEventListener(name, update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      for (const name of meterEvents) video.removeEventListener(name, update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [
    ordinaryVideo,
    paintPlayhead,
    replication.slug,
    resolveSeekDuration,
    video,
  ]);

  const transportVisible = controlsVisible || error || (moving && blocked);
  useLayoutEffect(() => {
    if (transportVisible) return;
    const focused = document.activeElement;
    const transport = transportRef.current;
    if (transport && focused instanceof HTMLElement && transport.contains(focused)) {
      const dialog = transport.closest<HTMLElement>('[role="dialog"]');
      if (dialog) dialog.focus({ preventScroll: true });
      else focused.blur();
    }
  }, [transportVisible]);
  useEffect(() => {
    onTransportVisibleChange?.(transportVisible);
  }, [onTransportVisibleChange, transportVisible]);

  const retryLoad = useCallback(() => {
    if (!video) return;
    reloadPooledElement(video);
    bufferingControllerRef.current?.retry();
  }, [video]);

  const showWorkNavigation = Boolean(onPrevious || onNext);

  return (
    <section
      ref={transportRef}
      aria-label={t("{{title}} media controls", { title: replication.title })}
      data-replication-media-stage
      data-controls-visible={transportVisible || undefined}
      className="pointer-events-none absolute inset-0 [container-type:size]"
    >
      {error ? (
        <div
          role="alert"
          className="theme-media-tile-title pointer-events-auto absolute inset-x-6 top-1/2 z-20 -translate-y-1/2 rounded-lg bg-black/80 p-4 text-center text-sm"
        >
          <p>
            {t(
              "This media could not be loaded. You can still open information or continue browsing.",
            )}
          </p>
          {moving ? (
            <button
              type="button"
              onClick={retryLoad}
              className={cn(
                "theme-media-control-raised mt-3 rounded-full px-4 py-2 text-xs font-semibold",
                focusRingClassName,
              )}
            >
              {t("Try again")}
            </button>
          ) : null}
        </div>
      ) : null}

      <ViewerBufferingIndicator
        phase={error ? null : playback.phase}
        rotated={rotated}
        mediaKey={replication.slug}
      />

      {ordinaryVideo && !error && moving ? (
        <div
          ref={progressSliderRef}
          role="slider"
          tabIndex={transportVisible ? 0 : -1}
          aria-hidden={!transportVisible || undefined}
          inert={!transportVisible}
          aria-label={t("Seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(replication.duration ?? 0)}
          aria-valuenow={0}
          aria-valuetext={describeSeekPosition(0, replication.duration ?? 0)}
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
            const step =
              event.key === "ArrowLeft"
                ? -5
                : event.key === "ArrowRight"
                  ? 5
                  : null;
            if (step === null) return;
            event.preventDefault();
            event.stopPropagation();
            if (!video) return;
            const duration = resolveSeekDuration(video);
            if (duration <= 0) return;
            const next = Math.min(
              Math.max(video.currentTime + step, 0),
              duration,
            );
            bufferingControllerRef.current?.beginSeek();
            seekPooledElement(video, next);
            bufferingControllerRef.current?.endSeek();
            paintPlayhead(next / duration);
            showControls();
          }}
          className={cn(
            "group pointer-events-auto absolute inset-x-0 bottom-[var(--viewer-rail-height,0px)] z-30 flex h-5 cursor-pointer touch-none flex-col justify-end",
            !transportVisible && "invisible !pointer-events-none",
            focusRingClassName,
          )}
        >
          <div className="relative h-[5px] w-full">
            <div
              aria-hidden
              className={cn(
                "theme-media-progress-track absolute inset-0 origin-bottom scale-y-[0.6] transition-transform duration-100 group-hover:scale-y-100 group-focus-visible:scale-y-100 motion-reduce:transition-none",
                scrubbing && "scale-y-100",
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
            </div>
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
        aria-hidden={!transportVisible || undefined}
        inert={!transportVisible}
        className={cn(
          "pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 motion-reduce:transition-none",
          transportVisible
            ? "opacity-100"
            : "invisible opacity-0 [&_*]:!pointer-events-none",
        )}
      >
        {showWorkNavigation ? (
          <button
            type="button"
            aria-label={previousLabel ?? t("Previous work")}
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
              <Icon icon="fluent:chevron-left-20-filled" className="size-8" />
          </button>
        ) : null}
        {showWorkNavigation ? (
          <button
            type="button"
            aria-label={nextLabel ?? t("Next work")}
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
              <Icon icon="fluent:chevron-right-20-filled" className="size-8" />
          </button>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-[var(--viewer-rail-height,0px)] flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:gap-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-0 sm:gap-1">
            {moving ? (
              <>
                <button
                  type="button"
                  aria-label={playing ? t("Pause") : t("Play")}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlayback();
                  }}
                  className={dockControlClassName}
                >
                  <RotatingIcon key={replication.slug} rotated={rotated}>
                    <Icon
                      icon={
                        playing
                          ? "fluent:pause-20-filled"
                          : "fluent:play-20-filled"
                      }
                      className="size-6"
                    />
                  </RotatingIcon>
                </button>
                {soundAvailable ? (
                  <>
                    <button
                      type="button"
                      aria-label={elementMuted ? t("Unmute") : t("Mute")}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMuted();
                      }}
                      className={dockControlClassName}
                    >
                      <RotatingIcon key={replication.slug} rotated={rotated}>
                        <Icon
                          icon={
                            elementMuted
                              ? "fluent:speaker-mute-20-filled"
                              : "fluent:speaker-2-20-filled"
                          }
                          className="size-6"
                        />
                      </RotatingIcon>
                    </button>
                    <label
                      className="sr-only"
                      htmlFor={`replication-volume-${replication.slug}`}
                    >
                      {t("Volume")}
                    </label>
                    <input
                      id={`replication-volume-${replication.slug}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={elementMuted ? 0 : volume}
                      onChange={(event) => {
                        const nextVolume = Number(event.currentTarget.value);
                        const nextMuted = nextVolume === 0;
                        if (video) {
                          soundCustody.setMuted(
                            video,
                            nextMuted,
                            nextMuted ? null : nextVolume,
                          );
                          setElementMuted(nextMuted);
                          if (!nextMuted) bufferingControllerRef.current?.resumeSound();
                        } else {
                          soundCustody.clearIou();
                        }
                        if (!nextMuted) onVolumeChange(nextVolume);
                        if (nextMuted !== muted) onMutedChange(nextMuted);
                      }}
                      className="pointer-events-auto hidden w-24 accent-white [@media(min-width:640px)_and_(pointer:fine)]:block"
                    />
                  </>
                ) : null}
                {ordinaryVideo ? (
                  <span
                    ref={timeReadoutRef}
                    aria-hidden
                    className="theme-media-tile-title overflow-hidden whitespace-nowrap px-1 text-xs font-medium tabular-nums sm:px-1.5"
                  />
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-0 sm:gap-1">
            {canRotate && onRotateModeChange ? (
              <button
                type="button"
                aria-label={
                  rotateMode ? t("Rotate back upright") : t("Rotate to fill screen")
                }
                aria-pressed={rotateMode}
                onClick={(event) => {
                  event.stopPropagation();
                  onRotateModeChange(!rotateMode);
                }}
                className={cn(
                  dockControlClassName,
                  !rotateMode && dockToggleOffClassName,
                )}
              >
                <RotatingIcon key={replication.slug} rotated={rotated}>
                  <Icon
                    icon="fluent:arrow-rotate-clockwise-20-filled"
                    className="size-6"
                  />
                </RotatingIcon>
              </button>
            ) : null}
            {onInfo ? (
              <button
                type="button"
                aria-label={t("Show information")}
                aria-expanded={infoOpen}
                aria-controls={infoControls}
                onClick={(event) => {
                  event.stopPropagation();
                  onInfo();
                }}
                className={dockControlClassName}
              >
                <RotatingIcon key={replication.slug} rotated={rotated}>
                  <Icon icon="fluent:info-20-filled" className="size-6" />
                </RotatingIcon>
              </button>
            ) : null}
            {fullscreenSupported && onFullscreen ? (
              <button
                type="button"
                aria-label={t("Fullscreen")}
                onClick={(event) => {
                  event.stopPropagation();
                  onFullscreen();
                }}
                className={dockControlClassName}
              >
                <RotatingIcon key={replication.slug} rotated={rotated}>
                  <Icon
                    icon="fluent:full-screen-maximize-20-filled"
                    className="size-6"
                  />
                </RotatingIcon>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
