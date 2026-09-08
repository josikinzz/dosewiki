import type { SoundCustody } from "./mediaCustody";
import { bufferedRangeContaining } from "./seekClock";

const MAX_BUFFER_WAIT_MS = 5_000;

export interface ViewerBufferState {
  phase: "startup" | "rebuffer" | null;
  wantsPlaying: boolean;
  blocked: boolean;
  error: boolean;
}

export interface ViewerBufferingController {
  togglePlayback(): void;
  resumeSound(): void;
  beginSeek(): void;
  endSeek(): void;
  blocked(): void;
  retry(): void;
  dispose(): void;
}

/** One active source owns all deferred playback. Buffer checks never replace it. */
export function createViewerBuffering({
  video,
  sound,
  autoplay,
  onChange,
  onHealth,
}: {
  video: HTMLVideoElement;
  sound: SoundCustody;
  autoplay: boolean;
  onChange: (state: ViewerBufferState) => void;
  onHealth: (healthy: boolean) => void;
}): ViewerBufferingController {
  const source = video.src;
  const arrivedPlaying = !video.paused && video.currentTime > 0 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  let disposed = false;
  let wantsPlaying = autoplay;
  let phase: ViewerBufferState["phase"] = null;
  let blocked = false;
  let error = Boolean(video.error);
  let holding = false;
  let seeking = false;
  let scrubbing = false;
  let presented = false;
  let bypass = false;
  let target = 1.75;
  let waitStarted = 0;
  let timer: number | undefined;
  let frame: number | undefined;
  let generation = 0;
  let lastState: ViewerBufferState | undefined;
  let lastHealth: boolean | undefined;
  let growthTime = performance.now();
  let growthEnd = bufferedRangeContaining(video.buffered, video.currentTime)?.end ?? 0;
  let growthRate: number | null = null;
  let fastGrowthSamples = 0;
  const valid = () => !disposed && video.src === source;
  const visible = () => document.visibilityState !== "hidden";
  const runway = () => {
    const range = bufferedRangeContaining(video.buffered, video.currentTime);
    return range ? Math.max(0, range.end - video.currentTime) : 0;
  };
  const remaining = () => Number.isFinite(video.duration) && video.duration > 0
    ? Math.max(0, video.duration - video.currentTime) : Infinity;
  const enough = (seconds: number) => {
    const ahead = runway();
    return ahead > 0 && ahead + 0.05 >= Math.min(seconds, remaining());
  };
  const clearChecks = () => {
    window.clearTimeout(timer);
    timer = undefined;
  };
  const cancelFrame = () => {
    generation += 1;
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    frame = undefined;
  };
  const report = () => {
    if (!valid()) return;
    if (!lastState || lastState.phase !== phase ||
      lastState.wantsPlaying !== wantsPlaying || lastState.blocked !== blocked || lastState.error !== error) {
      lastState = { phase, wantsPlaying, blocked, error };
      onChange(lastState);
    }
    // Releasing speculative downloads requires spare measured bandwidth, not
    // merely enough buffered media to release the active playback gate.
    const spareBandwidth = fastGrowthSamples >= 2 &&
      growthRate !== null && growthRate > video.playbackRate * 1.5;
    const healthy = visible() && !phase && !seeking && !scrubbing && !error && !blocked &&
      enough(target) && (enough(remaining()) || spareBandwidth);
    if (healthy !== lastHealth) {
      lastHealth = healthy;
      onHealth(healthy);
    }
  };
  const finishFrame = () => {
    if (!valid() || !wantsPlaying || holding || seeking || scrubbing || !visible()) return;
    presented = true;
    bypass = false;
    phase = null;
    clearChecks();
    report();
  };
  const watchFrame = () => {
    if (frame !== undefined || !video.requestVideoFrameCallback) return;
    const token = generation;
    frame = video.requestVideoFrameCallback(() => {
      if (token !== generation) return;
      frame = undefined;
      finishFrame();
    });
  };
  const schedule = () => {
    if (timer !== undefined || !phase || !wantsPlaying || !visible()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      check();
    }, 250);
  };
  const startAttempt = () => {
    if (!valid() || !wantsPlaying || !visible() || seeking || scrubbing || video.error) return;
    holding = false;
    watchFrame();
    sound.attemptPlay(video);
  };
  const check = () => {
    if (!valid()) { dispose(); return; }
    if (!visible() || !wantsPlaying || error || blocked) return;
    if (!seeking && !scrubbing && remaining() === 0) {
      // Let an actively playing native loop wrap; explicit end seeks still stop.
      if (video.loop && !holding && !video.paused) report();
      else stop();
      return;
    }
    if (holding && !seeking && !scrubbing) {
      // Preload is only a hint: a paused browser can stop fetching below our
      // preferred runway. Bound that wait and let native playback fetch data.
      // Keep the bypass until a frame arrives so `waiting` cannot pause it again.
      if (phase !== null && performance.now() - waitStarted >= MAX_BUFFER_WAIT_MS) bypass = true;
      if (bypass || enough(phase === "rebuffer" ? Math.min(4, target + 1.5) : target)) startAttempt();
    }
    report();
    schedule();
  };
  const wait = (next: NonNullable<ViewerBufferState["phase"]>) => {
    cancelFrame();
    if (!phase) waitStarted = performance.now();
    phase = next;
    holding = true;
    sound.pause(video);
    check();
  };
  const stop = () => {
    if (!valid()) return;
    wantsPlaying = false;
    phase = null;
    holding = false;
    bypass = false;
    clearChecks();
    cancelFrame();
    sound.pause(video);
    report();
  };
  const start = (immediate: boolean, gesture: boolean) => {
    if (!valid()) return;
    blocked = false;
    error = Boolean(video.error);
    if (error) { report(); return; }
    wantsPlaying = true;
    holding = true;
    bypass = immediate;
    if (video.ended || remaining() === 0) video.currentTime = 0;
    waitStarted = performance.now();
    phase = presented ? "rebuffer" : "startup";
    if (gesture) {
      sound.repayIou(video);
      // Prime this element during activation even when Safari ignores preload.
      // A deferred unmuted replay may still be refused; custody retains its IOU.
      startAttempt();
    }
    if (!immediate && !enough(target)) wait(phase);
    else if (!gesture) startAttempt();
    report();
    schedule();
  };
  const onPlaying = () => {
    if (!valid()) return;
    if (!wantsPlaying || holding || seeking || scrubbing || !visible()) {
      sound.pause(video);
      return;
    }
    blocked = false;
    if (video.requestVideoFrameCallback) watchFrame();
    else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finishFrame();
    report();
  };
  const onPlay = () => {
    if (!valid()) return;
    if (!wantsPlaying || holding || !visible()) sound.pause(video);
    else { blocked = false; report(); }
  };
  const onPause = () => {
    // A queued internal pause may arrive after playback has already resumed.
    if (!valid() || !video.paused || !wantsPlaying || holding || seeking || scrubbing || !visible()) return;
    stop();
  };
  const onWaiting = () => {
    if (!valid() || !wantsPlaying || holding || seeking || scrubbing || !visible() || video.ended || video.error) return;
    // Let a gesture or timeout start fetch its first frame before rearming the gate.
    if (bypass && phase !== null) return;
    // Healthy buffered media waiting on decode/compositing is not a network stall.
    if (enough(target)) return;
    target = Math.min(2.5, target + 0.2);
    bypass = false;
    wait(presented ? "rebuffer" : "startup");
  };
  const onProgress = () => {
    if (!valid() || !visible()) return;
    const now = performance.now();
    const end = bufferedRangeContaining(video.buffered, video.currentTime)?.end ?? growthEnd;
    const elapsed = (now - growthTime) / 1_000;
    if (elapsed >= 1) {
      const rate = Math.max(0, (end - growthEnd) / elapsed);
      growthRate = growthRate === null ? rate : growthRate * 0.75 + rate * 0.25;
      fastGrowthSamples = rate > video.playbackRate * 1.5 ? Math.min(2, fastGrowthSamples + 1) : 0;
      if (end > growthEnd) {
        target = Math.max(1.5, Math.min(2.5, target + (rate > 1.5 ? -0.05 : 0.05)));
      }
      growthTime = now;
      growthEnd = end;
    }
    check();
    report();
  };
  const beginSeek = () => {
    if (!valid()) return;
    seeking = true;
    bypass = false;
    growthTime = performance.now();
    growthEnd = bufferedRangeContaining(video.buffered, video.currentTime)?.end ?? 0;
    growthRate = null;
    fastGrowthSamples = 0;
    cancelFrame();
    sound.pause(video);
    if (wantsPlaying) {
      waitStarted = performance.now();
      phase = presented ? "rebuffer" : "startup";
      holding = true;
    }
    report();
  };
  const endSeek = () => {
    seeking = false;
    check();
    report();
  };
  const onError = () => { error = true; stop(); };
  const onVisibility = () => {
    if (!valid()) return;
    if (!visible()) {
      clearChecks();
      cancelFrame();
      sound.pause(video);
      holding = wantsPlaying;
    } else if (wantsPlaying) {
      growthTime = performance.now();
      growthEnd = bufferedRangeContaining(video.buffered, video.currentTime)?.end ?? 0;
      growthRate = null;
      fastGrowthSamples = 0;
      waitStarted = performance.now();
      phase = presented ? "rebuffer" : "startup";
      check();
    }
    report();
  };
  const events: Array<[string, () => void]> = [
    ["play", onPlay], ["playing", onPlaying], ["pause", onPause], ["waiting", onWaiting],
    ["stalled", onWaiting], ["progress", onProgress], ["timeupdate", onProgress],
    ["loadeddata", check], ["loadedmetadata", check], ["canplay", check],
    ["seeking", beginSeek], ["seeked", endSeek], ["error", onError],
    ["ended", stop],
  ];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearChecks();
    cancelFrame();
    for (const [name, listener] of events) video.removeEventListener(name, listener);
    document.removeEventListener("visibilitychange", onVisibility);
    sound.pause(video);
    if (lastHealth !== false) onHealth(false);
  };
  for (const [name, listener] of events) video.addEventListener(name, listener);
  document.addEventListener("visibilitychange", onVisibility);
  if (autoplay && !error) {
    start(false, false);
    if (arrivedPlaying && !video.requestVideoFrameCallback) finishFrame();
  }
  else { wantsPlaying = false; sound.pause(video); report(); }
  return {
    togglePlayback: () => wantsPlaying ? stop() : start(false, true),
    resumeSound: () => {
      if (wantsPlaying && !holding && !seeking && !scrubbing && visible()) startAttempt();
    },
    beginSeek: () => { scrubbing = true; beginSeek(); },
    endSeek: () => { scrubbing = false; if (!video.seeking) endSeek(); },
    blocked: () => { if (valid()) { blocked = true; stop(); } },
    retry: () => {
      cancelFrame();
      sound.pause(video);
      start(true, true);
    },
    dispose,
  };
}
