"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Icon } from "@/components/common/Icon";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import {
  assignPooledSource,
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
import {
  AUTO_HQ_SETTLE_MS,
  decide,
  previewTruncated,
  slideMotionSource,
  type LadderContext,
  type LadderVerdict,
  type SlideQuality,
} from "./qualityLadder";
import { RotatingIcon } from "./RotatingIcon";

/** Overlay controls float directly on the media: no pills, no chips — just
    filled glyphs (fluent) with the 44px hit area and rounded focus ring the
    rest of the app expects. The four hard 1px drop-shadows compound into a
    solid black contour around each glyph AND bleed through the alpha into
    enclosed hollows (the HD counters, the info "i"), so the white shapes
    survive any backdrop; the soft final shadow lifts them off busy frames. */
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

/** Toggle glyphs signal state by weight alone: dimmed is off, full is on. */
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
  /** Pure chrome visibility toggle; never touches the sound IOU. */
  toggleChrome: () => void;
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
  /** Whether this platform can honour a fullscreen request at all. */
  fullscreenSupported: boolean;
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
  onTransportVisibleChange,
  onTransportHandle,
  onFullscreen,
  fullscreenSupported,
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

  const soundCustodyRef = useRef<SoundCustody | null>(null);
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
  /** Keyboard focus inside the transport pins the chrome (focus-within). */
  const [focusWithin, setFocusWithin] = useState(false);
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

  /** Reveal the chrome for an intent gesture, then let it fade again. */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlHide();
  }, [scheduleControlHide]);

  /**
   * The pure chrome toggle behind surface taps and the `h` shortcut:
   * hiding cancels the fade timer so the hidden state persists until the
   * next intent — pointer travel never resurrects it — and revealing
   * re-arms the fade over any media, still or moving. States that plainly
   * need the chrome (paused, error, scrubbing, keyboard focus) pin it in
   * transportVisible below, never here.
   */
  const toggleChrome = useCallback(() => {
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
  if (!soundCustodyRef.current) {
    soundCustodyRef.current = createSoundCustody({
      volume: () => volumeRef.current,
      onBlocked: markBlocked,
    });
  }
  const soundCustody = soundCustodyRef.current;

  /**
   * Start playback the way phone feeds do: when the browser rejects unmuted
   * playback (iOS Safari outside a user gesture), retry muted so the work
   * keeps moving — but keep the reader's sound intent as an IOU that the
   * next gesture repays, instead of flipping the shared mute control.
   */
  const attemptPlay = soundCustody.attemptPlay;

  const ladderContext = useCallback(
    (): LadderContext => ({
      replication,
      quality: qualityRef.current,
      hqAvailable,
      dataSaver: browserRequestsDataSaving(),
    }),
    [hqAvailable, replication],
  );

  /** Apply a pure ladder decision to the active pooled element. */
  const applyVerdict = useCallback(
    (verdict: LadderVerdict) => {
      if (!video || verdict.kind === "stay") return;
      qualityRef.current = verdict.quality;
      onQualityChange(verdict.quality);
      assignPooledSource(video, verdict.src, {
        time: verdict.time,
        resume: false,
      });
      if (verdict.play) attemptPlay(video);
    },
    [attemptPlay, onQualityChange, video],
  );

  const repaySoundIou = soundCustody.repayIou;

  // Reset per-work presentation state whenever the active work changes.
  useEffect(() => {
    setBlocked(false);
    setAudioPresence(knownAudio === true ? "present" : "unknown");
    setError(false);
    setBuffering(false);
    setControlsVisible(true);
    // Every work opens with the chrome up and already fading — stills
    // included, so an untouched still goes immersive on its own.
    scheduleControlHide();
    setScrubbing(false);
    scrubbingRef.current = false;
    // A new work re-asks for the shared sound preference in the binding
    // effect below; any refusal re-arms the IOU there, so a stale debt from
    // the previous work never carries over.
    soundCustody.clearIou();
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
      const verdict = decide(
        { type: "metadata", elementDuration: video.duration },
        ladderContext(),
      );
      if (verdict.kind === "stay" && verdict.loop !== undefined) {
        video.loop = verdict.loop;
      }
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
      const verdict = decide(
        { type: "ended", elementDuration: video.duration },
        ladderContext(),
      );
      if (verdict.kind === "switch") {
        applyVerdict(verdict);
        return;
      }
      setPlaying(false);
      setControlsVisible(true);
    };
    const onLoadedMetadata = () => {
      syncLoop();
      soundCustody.setVolume(video);
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
    applyVerdict,
    ladderContext,
    moving,
    replication.slug,
    settleAudioPresence,
    showControls,
    video,
  ]);

  // Every work re-asks for the reader's sound preference. An element the
  // reader has already unmuted inside a gesture keeps that blessing across
  // src swaps, so it simply plays with sound; an unblessed one is refused
  // and attemptPlay's muted fallback re-arms the IOU for the next tap.
  useEffect(() => {
    if (!video || !moving) return;
    if (!autoplayAllowed) {
      soundCustody.pause(video);
      return;
    }
    soundCustody.applyPreference(video, mutedRef.current);
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
    if (ladderContext().dataSaver) return;
    const timer = window.setTimeout(() => {
      applyVerdict(
        decide(
          { type: "settled", currentTime: video.currentTime },
          ladderContext(),
        ),
      );
    }, AUTO_HQ_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [
    applyVerdict,
    hqAvailable,
    ladderContext,
    moving,
    playing,
    quality,
    replication.slug,
    video,
  ]);

  useEffect(() => {
    if (!video) return;
    soundCustody.applyPreference(video, muted);
  }, [muted, video, volume]);

  const togglePlayback = useCallback(() => {
    if (!video) return;
    showControls();
    if (video.paused || video.ended) {
      repaySoundIou(video);
      attemptPlay(video);
    } else {
      soundCustody.pause(video);
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
      soundCustody.setMuted(video, next);
      if (!next && autoplayAllowed) {
        attemptPlay(video);
      }
    } else {
      soundCustody.clearIou();
    }
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
    toggleChrome();
  }, [repaySoundIou, showControls, toggleChrome, video]);

  // Hand the overlay gesture-safe playback verbs for keyboard and gestures.
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
      if (previewTruncated(ladderContext(), element.duration)) {
        return Math.max(own, catalogued);
      }
      return own > 0 ? own : catalogued;
    },
    [ladderContext, replication.duration],
  );

  /** One direct-DOM write moves both the accent fill and its thumb. */
  const paintPlayhead = useCallback((ratio: number) => {
    const fill = progressFillRef.current;
    if (fill) fill.style.transform = `scaleX(${ratio})`;
    const thumb = progressThumbRef.current;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
  }, []);

  /**
   * Seek to the pointer's position on the bar and paint the playhead there.
   * A target beyond a truncated preview's end swaps to the full file first.
   */
  const seekToPointer = useCallback(
    (clientX: number) => {
      const slider = progressSliderRef.current;
      if (!video || !slider) return;
      const duration = resolveSeekDuration(video);
      if (duration <= 0) return;
      const rect = slider.getBoundingClientRect();
      const ratio = seekRatioFromPointer(clientX, rect.left, rect.width);
      const target = ratio * duration;
      const verdict = decide(
        {
          type: "seek",
          target,
          elementDuration: video.duration,
          paused: video.paused,
          ended: video.ended,
        },
        ladderContext(),
      );
      if (verdict.kind === "switch") applyVerdict(verdict);
      else seekPooledElement(video, target);
      paintPlayhead(ratio);
    },
    [applyVerdict, ladderContext, paintPlayhead, resolveSeekDuration, video],
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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    ordinaryVideo,
    paintPlayhead,
    replication.slug,
    resolveSeekDuration,
    video,
  ]);

  // Pins hold the chrome up while the reader plainly needs it: a paused,
  // blocked, or failed work, a scrub in progress, or keyboard focus inside
  // the transport. Otherwise visibility follows the intent toggle + fade.
  const transportVisible =
    controlsVisible ||
    scrubbing ||
    focusWithin ||
    error ||
    (moving && (!playing || blocked));
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
    reloadPooledElement(video);
    if (autoplayAllowed) attemptPlay(video);
  }, [attemptPlay, autoplayAllowed, video]);

  const showWorkNavigation = Boolean(onPrevious || onNext);

  return (
    // Focus/blur bubble up from the transport's buttons and sliders; the
    // section only observes them to pin the chrome while a control is
    // focused. It is delegation, not interaction on the landmark itself.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-label={`${replication.title} media controls`}
      data-replication-media-stage
      data-controls-visible={transportVisible || undefined}
      // Tab users are never operating invisible controls: focus landing on
      // any transport control reveals the chrome and pins it until focus
      // leaves, when the ordinary fade resumes.
      onFocus={() => {
        setFocusWithin(true);
        setControlsVisible(true);
        window.clearTimeout(hideTimerRef.current);
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setFocusWithin(false);
        scheduleControlHide();
      }}
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
        // under the pointer and while dragging via a bottom-origin scale —
        // a compositor transform, so the hairline never relayouts. The bar
        // keeps the screen's bottom edge in every orientation: rotated
        // media turns under an upright transport, matching the header.
        <div
          ref={progressSliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
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
            const verdict = decide(
              {
                type: "seek",
                target: next,
                elementDuration: video.duration,
                paused: video.paused,
                ended: video.ended,
              },
              ladderContext(),
            );
            if (verdict.kind === "switch") applyVerdict(verdict);
            else seekPooledElement(video, next);
            paintPlayhead(next / duration);
            showControls();
          }}
          className={cn(
            "group pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex h-5 cursor-pointer touch-none flex-col justify-end",
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
        className={cn(
          "pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 motion-reduce:transition-none",
          transportVisible
            ? "opacity-100"
            : "opacity-0 [&_*]:!pointer-events-none",
        )}
      >
        {/* Work navigation sits at the stage's vertical midline (the classic
            lightbox grammar), leaving the bottom edge to the control dock.
            Touch readers swipe instead. */}
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
              <Icon icon="fluent:chevron-left-20-filled" className="size-8" />
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
              <Icon icon="fluent:chevron-right-20-filled" className="size-8" />
            </RotatingIcon>
          </button>
        ) : null}

        {/* The control dock: every transport control in one screen-anchored
            bar over a quiet bottom scrim, upright in every orientation like
            the header. Playback verbs sit left; work-level modes sit right.
            The scrim itself never eats taps — only the controls do. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            {moving ? (
              <>
                <button
                  type="button"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlayback();
                  }}
                  className={dockControlClassName}
                >
                  <RotatingIcon rotated={rotated}>
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
                      aria-label={muted ? "Unmute" : "Mute"}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMuted();
                      }}
                      className={dockControlClassName}
                    >
                      <RotatingIcon rotated={rotated}>
                        <Icon
                          icon={
                            muted
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
                          soundCustody.setMuted(
                            video,
                            nextMuted,
                            nextMuted ? null : nextVolume,
                          );
                          if (!nextMuted && autoplayAllowed) attemptPlay(video);
                        } else {
                          soundCustody.clearIou();
                        }
                        if (!nextMuted) onVolumeChange(nextVolume);
                        if (nextMuted !== muted) onMutedChange(nextMuted);
                      }}
                      className="pointer-events-auto hidden w-24 accent-white [@media(pointer:fine)]:block"
                    />
                  </>
                ) : null}
                {ordinaryVideo ? (
                  // The playback clock, written per-frame by the rAF meter
                  // alongside the playhead; empty until a duration settles.
                  <span
                    ref={timeReadoutRef}
                    aria-hidden
                    className="theme-media-tile-title px-1.5 text-xs font-medium tabular-nums"
                  />
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-1">
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
                  if (video) {
                    applyVerdict(
                      decide(
                        {
                          type: "hq",
                          desired: quality === "full" ? "preview" : "full",
                          currentTime: video.currentTime,
                          paused: video.paused,
                          ended: video.ended,
                        },
                        ladderContext(),
                      ),
                    );
                  }
                  showControls();
                }}
                className={cn(
                  dockControlClassName,
                  quality !== "full" && dockToggleOffClassName,
                )}
              >
                <RotatingIcon rotated={rotated}>
                  <Icon icon="fluent:hd-20-filled" className="size-6" />
                </RotatingIcon>
              </button>
            ) : null}
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
                  dockControlClassName,
                  !rotateMode && dockToggleOffClassName,
                )}
              >
                <RotatingIcon rotated={rotated}>
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
                aria-label="Show information"
                aria-expanded={infoOpen}
                aria-controls={infoControls}
                onClick={(event) => {
                  event.stopPropagation();
                  onInfo();
                }}
                className={dockControlClassName}
              >
                <RotatingIcon rotated={rotated}>
                  <Icon icon="fluent:info-20-filled" className="size-6" />
                </RotatingIcon>
              </button>
            ) : null}
            {fullscreenSupported && onFullscreen ? (
              <button
                type="button"
                aria-label="Fullscreen"
                onClick={(event) => {
                  event.stopPropagation();
                  onFullscreen();
                }}
                className={dockControlClassName}
              >
                <RotatingIcon rotated={rotated}>
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
