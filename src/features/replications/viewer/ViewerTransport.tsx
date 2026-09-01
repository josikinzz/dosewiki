"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Icon } from "@/components/common/Icon";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { ReplicationViewerMediaItem } from "./viewerModel";
import {
  bufferedRangeContaining,
  describeSeekPosition,
  formatPlaybackClock,
  seekRatioFromPointer,
  slideMotionSource,
  type SlideQuality,
} from "./viewerLogic";
import { RotatingIcon } from "./RotatingIcon";

const controlClassName = cn(
  "theme-media-tile-title grid size-11 flex-none place-items-center rounded-full bg-black/65 backdrop-blur-sm",
  "transition-opacity hover:opacity-100 active:opacity-100 motion-reduce:transition-none",
  focusRingClassName,
);

/** Seeks this close past the preview's end escalate to the full file. */
const PREVIEW_SEEK_TOLERANCE_S = 0.25;
/** A preview at least this much shorter than the catalogue is truncated. */
const PREVIEW_TRUNCATION_TOLERANCE_S = 1;
/**
 * The preview generator's hard length cap (scripts/replications/
 * generate-preview-renditions.mjs cuts every preview at 10 seconds).
 */
const PREVIEW_GENERATOR_CAP_S = 10;
/**
 * How long a work must keep playing before the stage sharpens it to the
 * catalogued file. A fling across several works never triggers a full-file
 * fetch; a watched work upgrades almost immediately.
 */
const AUTO_HQ_SETTLE_MS = 1000;

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

/** Gesture-safe verbs the overlay drives from keyboard shortcuts and taps. */
export interface ViewerTransportHandle {
  togglePlayback: () => void;
  toggleMuted: () => void;
  /** A plain tap on the media surface: repay sound, else toggle chrome. */
  surfaceTap: () => void;
  /** Pointer travel over the stage keeps the chrome awake. */
  pointerActivity: () => void;
}

export interface ViewerTransportProps {
  item: ReplicationViewerMediaItem;
  /** The pooled media element currently on the active pane; null for stills. */
  video: HTMLVideoElement | null;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  /** Rendition the active slide is asked to play (owned by the overlay). */
  quality: SlideQuality;
  onQualityChange: (quality: SlideQuality) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onInfo?: () => void;
  infoOpen?: boolean;
  infoControls?: string;
  /** The session's sticky rotate-mode preference (owned by the overlay). */
  rotateMode?: boolean;
  onRotateModeChange?: (rotateMode: boolean) => void;
  /** Rotation decision and aspect for the active work (from useStageFit). */
  canRotate: boolean;
  rotated: boolean;
  mediaAspect: number;
  /**
   * Reports whether the transport chrome is currently presented, so the
   * overlay can fade its own chrome in step for a true immersive state.
   */
  onTransportVisibleChange?: (visible: boolean) => void;
  /** Receives gesture-safe playback verbs; called with null on unmount. */
  onTransportHandle?: (handle: ViewerTransportHandle | null) => void;
  onFullscreen?: () => void;
  fullscreenLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}

/**
 * The viewer's single set of playback chrome, floating above the pooled
 * track and bound to whichever element the active pane holds. It owns
 * playback intent (play/pause, sound, seek, quality) but never the media
 * elements themselves — those live in the track's recycled pool.
 */
export function ViewerTransport({
  item,
  video,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  quality,
  onQualityChange,
  onPrevious,
  onNext,
  onInfo,
  infoOpen = false,
  infoControls,
  rotateMode = false,
  onRotateModeChange,
  canRotate,
  rotated,
  mediaAspect,
  onTransportVisibleChange,
  onTransportHandle,
  onFullscreen,
  fullscreenLabel = "Fullscreen",
  previousLabel = "Previous work",
  nextLabel = "Next work",
}: ViewerTransportProps) {
  const replication = item.replication;
  const moving = slideMotionSource(replication) !== null && video !== null;
  const ordinaryVideo = replication.type === "video";
  const knownAudio = ordinaryVideo ? replication.has_audio : false;
  /** The explicit HQ escape exists only when a distinct preview plays. */
  const hqAvailable =
    ordinaryVideo &&
    Boolean(replication.preview_url) &&
    replication.preview_url !== replication.url;

  /** Sound the reader asked for but the browser refused outside a gesture. */
  const pendingSoundRef = useRef(false);
  /** Latest shared state, readable from per-work effects without re-running. */
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const qualityRef = useRef(quality);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressBufferedRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const progressSliderRef = useRef<HTMLDivElement>(null);
  /** Scrub-time clock node; written per-frame like the playhead. */
  const timeReadoutRef = useRef<HTMLSpanElement>(null);
  /** True while a pointer owns the playhead; the rAF meter yields to it. */
  const scrubbingRef = useRef(false);
  /** Last whole second written to aria-valuenow, deduping per-frame writes. */
  const ariaSecondRef = useRef(-1);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [audioPresence, setAudioPresence] = useState<AudioPresence>(
    knownAudio === true ? "present" : "unknown",
  );

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    qualityRef.current = quality;
  });

  // Catalogued waveform evidence beats runtime track probes: a row proven
  // silent hides sound controls outright; a row with audible signal keeps
  // them. GIF motion renditions are generated silent by contract.
  const soundAvailable =
    ordinaryVideo && knownAudio !== false && audioPresence !== "absent";
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
    if (!moving || (video && !video.paused && !video.ended)) {
      scheduleControlHide();
    } else {
      window.clearTimeout(hideTimerRef.current);
    }
  }, [moving, scheduleControlHide, video]);

  const toggleControls = useCallback(() => {
    setControlsVisible((current) => {
      window.clearTimeout(hideTimerRef.current);
      if (!current) scheduleControlHide();
      return !current;
    });
  }, [scheduleControlHide]);

  useEffect(() => {
    return () => window.clearTimeout(hideTimerRef.current);
  }, []);

  const markBlocked = useCallback(() => {
    setBuffering(false);
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
    (element: HTMLVideoElement) => {
      const attemptSrc = element.src;
      const attempt = element.play();
      if (!attempt) return;
      void attempt.catch((reason: unknown) => {
        // Pooled elements persist across works, so a pending play() from an
        // outgoing work can reject after the next src is already loading
        // (AbortError), or after detach. Those stale rejections must not
        // touch shared state.
        if (!element.isConnected || element.src !== attemptSrc) return;
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        if (!element.muted) {
          element.muted = true;
          pendingSoundRef.current = true;
          const retry = element.play();
          if (retry) void retry.catch(markBlocked);
          return;
        }
        markBlocked();
      });
    },
    [markBlocked],
  );

  /**
   * Swap the active element to the catalogued full file, carrying playback
   * position and intent across. Runs imperatively inside whatever gesture
   * asked for it; the track's assignment effect sees the src already matches
   * the new quality and leaves the element alone.
   */
  const upgradeToFull = useCallback(
    (targetTime?: number) => {
      if (!video || !hqAvailable || qualityRef.current === "full") return;
      // A naturally ended element reports paused=true (the spec pauses it
      // before firing `ended`), but an ended preview is mid-work by
      // definition — the whole point of the swap is to keep it moving.
      const wasPlaying = !video.paused || video.ended;
      const time = targetTime ?? video.currentTime;
      qualityRef.current = "full";
      onQualityChange("full");
      video.src = replication.url;
      if (time > 0) video.currentTime = time;
      if (wasPlaying) attemptPlay(video);
    },
    [attemptPlay, hqAvailable, onQualityChange, replication.url, video],
  );

  const downgradeToPreview = useCallback(() => {
    const previewSource = slideMotionSource(replication, "preview");
    if (!video || !previewSource || qualityRef.current === "preview") return;
    const wasPlaying = !video.paused;
    const time = video.currentTime;
    qualityRef.current = "preview";
    onQualityChange("preview");
    video.src = previewSource;
    if (time > 0) video.currentTime = time;
    if (wasPlaying) attemptPlay(video);
  }, [attemptPlay, onQualityChange, replication, video]);

  /**
   * True when the element is playing a preview rendition that ends before
   * the catalogued work does — looping it would silently amputate the piece.
   * Rows with no catalogued duration fall back to the generator's contract:
   * previews are cut at PREVIEW_GENERATOR_CAP_S, so a preview that runs the
   * whole cap is presumed truncated and continues into the full file. A work
   * that genuinely lasts the cap pays one redundant swap at its final frame.
   */
  const previewTruncated = useCallback(
    (element: HTMLVideoElement): boolean => {
      if (!hqAvailable || qualityRef.current !== "preview") return false;
      const elementDuration = element.duration;
      if (!Number.isFinite(elementDuration) || elementDuration <= 0)
        return false;
      const catalogued = replication.duration;
      if (typeof catalogued !== "number" || catalogued <= 0) {
        return elementDuration >= PREVIEW_GENERATOR_CAP_S - 0.15;
      }
      return catalogued > elementDuration + PREVIEW_TRUNCATION_TOLERANCE_S;
    },
    [hqAvailable, replication.duration],
  );

  /**
   * Repay a refused unmute inside a live gesture; returns true when a debt
   * was repaid. Must only run from user-event handlers.
   */
  const repaySoundIou = useCallback(
    (element: HTMLVideoElement) => {
      if (!pendingSoundRef.current) return false;
      pendingSoundRef.current = false;
      element.muted = false;
      element.volume = volumeRef.current;
      return true;
    },
    [],
  );

  // Reset per-work presentation state whenever the active work changes.
  useEffect(() => {
    setBlocked(false);
    setAudioPresence(knownAudio === true ? "present" : "unknown");
    setError(false);
    setBuffering(false);
    setControlsVisible(true);
    setScrubbing(false);
    scrubbingRef.current = false;
    // A new work re-asks for the shared sound preference in the binding
    // effect below; any refusal re-arms the IOU there, so a stale debt from
    // the previous work never carries over.
    pendingSoundRef.current = false;
    // knownAudio is derived from the same slug change that resets here.
  }, [replication.slug]);

  /** Settle audio presence from track APIs as the media loads and plays. */
  const settleAudioPresence = useCallback(
    (element: HTMLVideoElement) => {
      if (!ordinaryVideo) return;
      setAudioPresence((current) =>
        current === "unknown" ? probeAudioPresence(element) : current,
      );
    },
    [ordinaryVideo],
  );

  // Bind the active pooled element: subscribe to its playback lifecycle and
  // adopt whatever state it arrived in (a drag-committed neighbor is often
  // already playing; a neighbor that failed carries its error).
  useEffect(() => {
    if (!video || !moving) return;
    const syncLoop = () => {
      // Looping a truncated preview would amputate the work: run to the
      // preview's end instead, then continue seamlessly into the full file.
      video.loop = !previewTruncated(video);
    };
    const onPlay = () => {
      setPlaying(true);
      setBlocked(false);
      showControls();
    };
    const onPause = () => {
      setBuffering(false);
      setPlaying(false);
      setControlsVisible(true);
    };
    const onWaiting = () => {
      if (
        video.paused ||
        video.ended ||
        video.error ||
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        return;
      }
      setBuffering(true);
    };
    const onSettled = () => setBuffering(false);
    const onError = () => {
      setBuffering(false);
      setError(true);
      setPlaying(false);
      setControlsVisible(true);
    };
    const onEnded = () => {
      setBuffering(false);
      if (previewTruncated(video)) {
        // The preview ran out before the work did: continue into the full
        // file from this exact moment.
        upgradeToFull(video.duration);
        return;
      }
      setPlaying(false);
      setControlsVisible(true);
    };
    const onLoadedMetadata = () => {
      syncLoop();
      video.volume = volumeRef.current;
      settleAudioPresence(video);
    };
    const onTimeUpdate = () => settleAudioPresence(video);
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onSettled);
    video.addEventListener("canplay", onSettled);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    // Adopt the element's current condition on bind.
    syncLoop();
    setPlaying(!video.paused && !video.ended);
    setError(Boolean(video.error));
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      settleAudioPresence(video);
    }
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onSettled);
      video.removeEventListener("canplay", onSettled);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [
    moving,
    previewTruncated,
    replication.slug,
    settleAudioPresence,
    showControls,
    upgradeToFull,
    video,
  ]);

  // Every work re-asks for the reader's sound preference. An element the
  // reader has already unmuted inside a gesture keeps that blessing across
  // src swaps, so it simply plays with sound; an unblessed one is refused
  // and attemptPlay's muted fallback re-arms the IOU for the next tap.
  useEffect(() => {
    if (!video || !moving) return;
    if (!autoplayAllowed) {
      if (!video.paused) video.pause();
      return;
    }
    video.muted = mutedRef.current;
    video.volume = volumeRef.current;
    attemptPlay(video);
  }, [attemptPlay, autoplayAllowed, moving, replication.slug, video]);

  // The feed lands every work on its lightweight preview so a swipe never
  // waits on the network — but the preview is a 480p hover-tile rendition,
  // not stage quality. Once the reader has settled on a work (sustained
  // playback, not a fling), the active element quietly swaps to the
  // catalogued file at the same playhead. Data-saver sessions keep the
  // preview until the reader asks via the HQ control.
  useEffect(() => {
    if (!video || !moving || !hqAvailable) return;
    if (quality !== "preview" || !playing) return;
    if (browserRequestsDataSaving()) return;
    const timer = window.setTimeout(
      () => upgradeToFull(),
      AUTO_HQ_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    hqAvailable,
    moving,
    playing,
    quality,
    replication.slug,
    upgradeToFull,
    video,
  ]);

  useEffect(() => {
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
  }, [muted, video, volume]);

  const togglePlayback = useCallback(() => {
    if (!video) return;
    showControls();
    if (video.paused || video.ended) {
      repaySoundIou(video);
      attemptPlay(video);
    } else {
      video.pause();
    }
  }, [attemptPlay, repaySoundIou, showControls, video]);

  /**
   * The mute button's whole gesture, shared with the keyboard shortcut: flip
   * the element inside the live user activation — WebKit only honours an
   * unmute (and any needed replay) there; a state-sync alone would land
   * outside it and be refused.
   */
  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    if (video) {
      video.muted = next;
      video.volume = volumeRef.current;
      if (!next && autoplayAllowed) {
        attemptPlay(video);
      }
    }
    pendingSoundRef.current = false;
    showControls();
    onMutedChange(next);
  }, [attemptPlay, autoplayAllowed, onMutedChange, showControls, video]);

  /**
   * A tap on the media surface adopts the still-stage grammar: it only
   * reveals or dismisses the chrome; pause lives exclusively on the play
   * button. But a tap is also the live gesture that can repay a refused
   * unmute, so an outstanding sound IOU is settled first.
   */
  const surfaceTap = useCallback(() => {
    if (video && repaySoundIou(video)) {
      showControls();
      return;
    }
    toggleControls();
  }, [repaySoundIou, showControls, toggleControls, video]);

  // Hand the overlay gesture-safe playback verbs for keyboard and gestures.
  useEffect(() => {
    if (!onTransportHandle) return;
    onTransportHandle({
      togglePlayback,
      toggleMuted,
      surfaceTap,
      pointerActivity: showControls,
    });
    return () => onTransportHandle(null);
  }, [
    onTransportHandle,
    showControls,
    surfaceTap,
    toggleMuted,
    togglePlayback,
  ]);

  /**
   * The timeline the seek bar advertises: a truncated preview still shows
   * the work's full catalogued length, and a seek past the preview's end
   * escalates to the full file — never a silently shortened piece.
   */
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
      if (previewTruncated(element)) return Math.max(own, catalogued);
      return own > 0 ? own : catalogued;
    },
    [previewTruncated, replication.duration],
  );

  /**
   * One direct-DOM write moves both the accent fill and its thumb. While
   * the media is rotated the bar runs vertically down the left screen edge,
   * so progress fills top-to-bottom — the same turn the media box makes.
   */
  const paintPlayhead = useCallback(
    (ratio: number) => {
      const fill = progressFillRef.current;
      if (fill) {
        fill.style.transform = rotated
          ? `scaleY(${ratio})`
          : `scaleX(${ratio})`;
      }
      const thumb = progressThumbRef.current;
      if (thumb) {
        if (rotated) {
          thumb.style.left = "";
          thumb.style.top = `${ratio * 100}%`;
        } else {
          thumb.style.top = "";
          thumb.style.left = `${ratio * 100}%`;
        }
      }
    },
    [rotated],
  );

  /**
   * Seek to the pointer's position on the bar and paint the playhead there.
   * A target beyond a truncated preview's end swaps to the full file first.
   */
  const seekToPointer = useCallback(
    (clientX: number, clientY: number) => {
      const slider = progressSliderRef.current;
      if (!video || !slider) return;
      const duration = resolveSeekDuration(video);
      if (duration <= 0) return;
      const rect = slider.getBoundingClientRect();
      const ratio = rotated
        ? seekRatioFromPointer(clientY, rect.top, rect.height)
        : seekRatioFromPointer(clientX, rect.left, rect.width);
      const target = ratio * duration;
      if (
        previewTruncated(video) &&
        target > video.duration - PREVIEW_SEEK_TOLERANCE_S
      ) {
        upgradeToFull(target);
      } else {
        video.currentTime = target;
      }
      paintPlayhead(ratio);
    },
    [
      paintPlayhead,
      previewTruncated,
      resolveSeekDuration,
      rotated,
      upgradeToFull,
      video,
    ],
  );

  const endScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // The compact playback meter: per-frame direct-DOM writes keep the accent
  // fill, its thumb, and the buffered layer glassy-smooth without
  // re-rendering. While a pointer is scrubbing, the pointer owns the playhead.
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
        if (rotated) {
          bufferedFill.style.left = "";
          bufferedFill.style.width = "";
          bufferedFill.style.top = range
            ? `${(range.start / duration) * 100}%`
            : "0%";
          bufferedFill.style.height = range
            ? `${((range.end - range.start) / duration) * 100}%`
            : "0%";
        } else {
          bufferedFill.style.top = "";
          bufferedFill.style.height = "";
          bufferedFill.style.left = range
            ? `${(range.start / duration) * 100}%`
            : "0%";
          bufferedFill.style.width = range
            ? `${((range.end - range.start) / duration) * 100}%`
            : "0%";
        }
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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    ordinaryVideo,
    paintPlayhead,
    replication.slug,
    resolveSeekDuration,
    rotated,
    video,
  ]);

  const transportVisible = moving
    ? controlsVisible || !playing || blocked || error
    : controlsVisible;
  // The overlay fades its own chrome (header, rail, byline) in step with
  // the transport, so hidden chrome means the whole screen belongs to the
  // work — not just the corner controls.
  useEffect(() => {
    onTransportVisibleChange?.(transportVisible);
  }, [onTransportVisibleChange, transportVisible]);

  /**
   * The error card's second chance: re-run the load algorithm from inside
   * the click gesture, so a replay is blessed.
   */
  const retryLoad = useCallback(() => {
    setError(false);
    setBuffering(false);
    if (!video) return;
    video.load();
    if (autoplayAllowed) attemptPlay(video);
  }, [attemptPlay, autoplayAllowed, video]);

  // Anchor the playback cluster to the letterboxed media box, not the stage:
  // object-contain centers the media, so each axis's spare space is half of
  // (stage minus contained size). Container-query units resolve against the
  // transport section ([container-type:size]); a rotated media box presents
  // its inverted aspect. The 0.75rem inset keeps the pill just inside the
  // media's bottom-left corner; while rotated the vertical seek bar owns the
  // leftmost 20px, so the pill steps right past its hit zone.
  const anchorAspect = rotated ? 1 / mediaAspect : mediaAspect;
  const anchorLeftInset = rotated ? "1.75rem" : "0.75rem";
  const mediaBoxAnchorStyle = {
    "--media-box-left": `calc((100cqw - min(100cqw, 100cqh * ${anchorAspect})) / 2 + ${anchorLeftInset})`,
    "--media-box-bottom": `calc((100cqh - min(100cqh, 100cqw / ${anchorAspect})) / 2 + 0.75rem)`,
  } as CSSProperties;
  const showWorkNavigation = Boolean(onPrevious || onNext);

  return (
    <section
      aria-label={`${replication.title} media controls`}
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
            This media could not be loaded. You can still open information or
            continue browsing.
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
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {buffering && !error ? (
        <div className="pointer-events-none absolute inset-x-3 top-16 z-20 flex justify-center">
          <div className="theme-media-tile-title flex min-h-8 items-center justify-center rounded-full bg-black/65 px-2.5 py-2 backdrop-blur-sm">
            <span
              role="img"
              aria-label="Buffering"
              className="grid size-4 shrink-0 place-items-center"
            >
              <Icon icon="eos-icons:loading" className="size-4" />
            </span>
          </div>
        </div>
      ) : null}

      {ordinaryVideo && !error && moving ? (
        // The YouTube grammar: a hairline meter that is secretly a full
        // slider. A tall invisible hit area owns the pointer so a scrub can
        // never read as a stage tap or a swipe; the visible track fattens
        // under the pointer and while dragging. While the media is rotated
        // the same bar stands up along the left screen edge.
        <div
          ref={progressSliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(replication.duration ?? 0)}
          aria-valuenow={0}
          aria-valuetext={describeSeekPosition(0, replication.duration ?? 0)}
          aria-orientation={rotated ? "vertical" : undefined}
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
            seekToPointer(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!scrubbingRef.current) return;
            event.stopPropagation();
            showControls();
            seekToPointer(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (!scrubbingRef.current) return;
            event.stopPropagation();
            seekToPointer(event.clientX, event.clientY);
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
                  : rotated && event.key === "ArrowUp"
                    ? -5
                    : rotated && event.key === "ArrowDown"
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
            if (
              previewTruncated(video) &&
              next > video.duration - PREVIEW_SEEK_TOLERANCE_S
            ) {
              upgradeToFull(next);
            } else {
              video.currentTime = next;
            }
            paintPlayhead(next / duration);
            showControls();
          }}
          className={cn(
            "group pointer-events-auto absolute z-10 flex cursor-pointer touch-none",
            rotated
              ? "inset-y-0 left-0 w-5 flex-row justify-start"
              : "inset-x-0 bottom-0 h-5 flex-col justify-end",
            focusRingClassName,
          )}
        >
          <div
            className={cn(
              "theme-media-progress-track relative duration-100 motion-reduce:transition-none",
              rotated
                ? "h-full w-[3px] transition-[width] group-hover:w-[5px] group-focus-visible:w-[5px]"
                : "h-[3px] w-full transition-[height] group-hover:h-[5px] group-focus-visible:h-[5px]",
              scrubbing && (rotated ? "w-[5px]" : "h-[5px]"),
            )}
          >
            <div
              ref={progressBufferedRef}
              aria-hidden
              className={cn(
                "theme-media-progress-buffered absolute",
                rotated ? "inset-x-0 top-0" : "inset-y-0 left-0",
              )}
              style={rotated ? { height: "0%" } : { width: "0%" }}
            />
            <div
              ref={progressFillRef}
              aria-hidden
              className={cn(
                "theme-media-playback-fill absolute",
                rotated
                  ? "inset-x-0 top-0 h-full origin-top"
                  : "inset-y-0 left-0 w-full origin-left",
              )}
              style={{ transform: rotated ? "scaleY(0)" : "scaleX(0)" }}
            />
            <div
              ref={progressThumbRef}
              aria-hidden
              className={cn(
                "theme-media-playback-thumb absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100",
                rotated ? "left-1/2" : "top-1/2",
                scrubbing && "opacity-100",
              )}
              style={rotated ? { top: "0%" } : { left: "0%" }}
            />
          </div>
        </div>
      ) : null}

      {ordinaryVideo && !error && scrubbing ? (
        // The scrub clock: elapsed / total rides just clear of the bar while
        // a pointer owns the playhead. Values are written per-frame by the
        // rAF meter; text stays upright either way.
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-10 flex",
            rotated
              ? "left-8 top-1/2 -translate-y-1/2"
              : "inset-x-0 bottom-9 justify-center",
          )}
        >
          <span
            ref={timeReadoutRef}
            className="theme-media-tile-title rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium tabular-nums backdrop-blur-sm"
          />
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
          {canRotate && onRotateModeChange ? (
            <button
              type="button"
              aria-label={
                rotateMode ? "Rotate back upright" : "Rotate to fill screen"
              }
              aria-pressed={rotateMode}
              onClick={(event) => {
                event.stopPropagation();
                onRotateModeChange(!rotateMode);
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto",
                rotateMode && "theme-media-control-pressed",
              )}
            >
              <RotatingIcon rotated={rotated}>
                <Icon icon="lucide:rotate-cw" className="size-5" />
              </RotatingIcon>
            </button>
          ) : null}
          {hqAvailable && moving ? (
            <button
              type="button"
              aria-label={
                quality === "full"
                  ? "Switch to preview quality"
                  : "Play original quality"
              }
              aria-pressed={quality === "full"}
              onClick={(event) => {
                event.stopPropagation();
                if (quality === "full") downgradeToPreview();
                else upgradeToFull();
                showControls();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto text-[10px] font-bold tracking-wide",
                quality === "full" && "theme-media-control-pressed",
              )}
            >
              <RotatingIcon rotated={rotated}>
                <span aria-hidden>HQ</span>
              </RotatingIcon>
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
              <RotatingIcon rotated={rotated}>
                <Icon icon="lucide:info" className="size-5" />
              </RotatingIcon>
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
              <RotatingIcon rotated={rotated}>
                <Icon icon="lucide:maximize" className="size-5" />
              </RotatingIcon>
            </button>
          ) : null}
        </div>

        {/* Work navigation sits at the stage's vertical midline (the classic
            lightbox grammar), leaving the bottom edge to the byline chip and
            the playback cluster. Touch readers swipe instead. */}
        {showWorkNavigation ? (
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
            <RotatingIcon rotated={rotated}>
              <Icon icon="lucide:chevron-left" className="size-6" />
            </RotatingIcon>
          </button>
        ) : null}
        {showWorkNavigation ? (
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
            <RotatingIcon rotated={rotated}>
              <Icon icon="lucide:chevron-right" className="size-6" />
            </RotatingIcon>
          </button>
        ) : null}
        {moving ? (
          <div
            style={mediaBoxAnchorStyle}
            className="theme-media-tile-title pointer-events-none absolute bottom-[var(--media-box-bottom)] left-[var(--media-box-left)] flex items-center gap-2 rounded-full bg-black/65 px-2 py-1.5 backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
              className={cn(
                "pointer-events-auto grid size-9 place-items-center rounded-full [@media(pointer:coarse)]:size-11",
                focusRingClassName,
              )}
            >
              <RotatingIcon rotated={rotated}>
                <Icon
                  icon={playing ? "lucide:pause" : "lucide:play"}
                  className="size-5"
                />
              </RotatingIcon>
            </button>
            {soundAvailable ? (
              <>
                <button
                  type="button"
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleMuted();
                  }}
                  className={cn(
                    "pointer-events-auto grid size-9 place-items-center rounded-full [@media(pointer:coarse)]:size-11",
                    focusRingClassName,
                  )}
                >
                  <RotatingIcon rotated={rotated}>
                    <Icon
                      icon={muted ? "lucide:volume-x" : "lucide:volume-2"}
                      className="size-5"
                    />
                  </RotatingIcon>
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
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const nextVolume = Number(event.currentTarget.value);
                    const nextMuted = nextVolume === 0;
                    if (video) {
                      video.muted = nextMuted;
                      if (!nextMuted) {
                        video.volume = nextVolume;
                        if (autoplayAllowed) attemptPlay(video);
                      }
                    }
                    pendingSoundRef.current = false;
                    if (!nextMuted) onVolumeChange(nextVolume);
                    if (nextMuted !== muted) onMutedChange(nextMuted);
                  }}
                  className="pointer-events-auto hidden w-24 accent-white sm:block"
                />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
