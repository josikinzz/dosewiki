import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSoundCustody } from "./mediaCustody";
import { createViewerBuffering, type ViewerBufferingController, type ViewerBufferState } from "./viewerBuffering";

const cleanups: Array<() => void> = [];
function setup({
  ahead = 0,
  duration = 30,
  autoplay = true,
  frames = false,
  readyState = HTMLMediaElement.HAVE_CURRENT_DATA,
}: {
  ahead?: number;
  duration?: number;
  autoplay?: boolean;
  frames?: boolean;
  readyState?: number;
} = {}) {
  const video = document.createElement("video");
  video.src = "https://cdn.test/first.mp4";
  document.body.appendChild(video);
  let paused = true;
  let ranges = [[0, ahead]];
  let currentTime = 0;
  let frameCallback: VideoFrameRequestCallback | undefined;
  Object.defineProperties(video, {
    paused: { get: () => paused },
    duration: { value: duration },
    readyState: { value: readyState },
    currentTime: { get: () => currentTime, set: (time: number) => { currentTime = time; } },
    buffered: { get: () => ({ length: ranges.length, start: (i: number) => ranges[i][0], end: (i: number) => ranges[i][1] }) },
    play: { value: vi.fn(() => { paused = false; video.dispatchEvent(new Event("play")); return Promise.resolve(); }) },
    pause: { value: vi.fn(() => { paused = true; video.dispatchEvent(new Event("pause")); }) },
  });
  if (frames) {
    video.requestVideoFrameCallback = vi.fn((callback) => { frameCallback = callback; return 1; });
    video.cancelVideoFrameCallback = vi.fn();
  }
  const states: ViewerBufferState[] = [];
  const health = vi.fn();
  const sound = createSoundCustody({ volume: 1, onBlocked: () => controller.blocked() });
  const controller: ViewerBufferingController = createViewerBuffering({ video, sound, autoplay, onChange: (state) => states.push(state), onHealth: health });
  cleanups.push(() => { controller.dispose(); video.remove(); });
  return {
    video, controller, sound, health,
    state: () => states[states.length - 1],
    event: (name: string) => video.dispatchEvent(new Event(name)),
    buffer: (next: number[][]) => { ranges = next; video.dispatchEvent(new Event("progress")); },
    frame: () => frameCallback,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("active viewer buffering", () => {
  it("holds startup for the contiguous runway at the playhead, not canplay or disjoint data", () => {
    const f = setup({ ahead: 0.4 });
    f.buffer([[0, 0.4], [10, 30]]);
    f.event("canplay");
    vi.advanceTimersByTime(2_000);
    expect(f.video.play).not.toHaveBeenCalled();
    expect(f.state()).toMatchObject({ phase: "startup", wantsPlaying: true });
    f.buffer([[0, 2]]);
    expect(f.video.paused).toBe(false);
    expect(f.state().phase).toBe("startup");
    f.event("playing");
    expect(f.state().phase).toBeNull();
  });

  it.each([{ ahead: 8, duration: 30 }, { ahead: 0.6, duration: 0.6 }])("starts already buffered and complete short clips immediately: %j", (options) => {
    const f = setup(options);
    expect(f.video.paused).toBe(false);
    f.event("playing");
    expect(f.state().phase).toBeNull();
    expect(f.health).toHaveBeenLastCalledWith(options.ahead === options.duration);
  });

  it("uses the remaining tail rather than waiting for an impossible target near the end", () => {
    const f = setup({ ahead: 30 });
    f.event("playing");
    f.controller.beginSeek();
    f.video.currentTime = 29.5;
    f.controller.endSeek();
    expect(f.video.paused).toBe(false);
    f.event("playing");
    expect(f.state().phase).toBeNull();
  });

  it("requires a larger runway after a real stall and ignores healthy decode waits", () => {
    const f = setup({ ahead: 8 });
    f.event("playing");
    f.event("waiting");
    expect(f.video.paused).toBe(false);
    expect(f.state().phase).toBeNull();
    f.video.currentTime = 7.8;
    f.event("waiting");
    expect(f.video.paused).toBe(true);
    expect(f.state().phase).toBe("rebuffer");
    f.buffer([[0, 10]]);
    f.event("canplay");
    expect(f.video.paused).toBe(true);
    f.buffer([[0, 11.5]]);
    expect(f.video.paused).toBe(false);
  });

  it("raises the startup runway gradually when measured buffer growth cannot keep up", () => {
    const f = setup({ ahead: 0.2 });
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 0.6]]);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 1]]);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 1.4]]);
    f.buffer([[0, 1.8]]);
    expect(f.video.paused).toBe(true);
    f.buffer([[0, 2.1]]);
    expect(f.video.paused).toBe(false);
  });

  it("explicit Pause cancels pending playback and sound gestures cannot restart it", () => {
    const f = setup();
    f.controller.togglePlayback();
    f.sound.setMuted(f.video, false);
    f.controller.resumeSound();
    f.buffer([[0, 20]]);
    vi.advanceTimersByTime(8_000);
    expect(f.video.play).not.toHaveBeenCalled();
    expect(f.state()).toMatchObject({ phase: null, wantsPlaying: false });
  });

  it("lets native looping cross the end without cancelling playback intent", () => {
    const f = setup({ ahead: 30 });
    f.video.loop = true;
    f.event("playing");
    f.video.currentTime = 30;
    f.event("timeupdate");
    expect(f.video.paused).toBe(false);
    expect(f.state().wantsPlaying).toBe(true);
    f.video.currentTime = 0;
    f.event("seeking");
    f.event("seeked");
    expect(f.video.paused).toBe(false);
  });

  it.each([
    { ahead: 0, readyState: HTMLMediaElement.HAVE_NOTHING },
    { ahead: 0.4, readyState: HTMLMediaElement.HAVE_FUTURE_DATA },
  ])("automatically releases a sustained wait, then rearms at the next stall: %j", (options) => {
    const f = setup({ ...options, frames: true });
    vi.advanceTimersByTime(4_750);
    expect(f.video.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(f.video.play).toHaveBeenCalledOnce();
    expect(f.video.paused).toBe(false);
    expect(f.state().phase).toBe("startup");
    // Native loading must continue even when preload fetched no initial data.
    f.event("waiting");
    f.event("stalled");
    vi.advanceTimersByTime(5_000);
    expect(f.video.paused).toBe(false);
    expect(f.video.play).toHaveBeenCalledOnce();
    f.event("playing");
    expect(f.state().phase).toBe("startup");
    f.frame()!(0, {} as VideoFrameCallbackMetadata);
    expect(f.state()).toMatchObject({ phase: null });
    f.event("waiting");
    expect(f.video.paused).toBe(true);
    f.event("canplay");
    expect(f.video.paused).toBe(true);
    vi.advanceTimersByTime(4_750);
    expect(f.video.play).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(250);
    expect(f.video.play).toHaveBeenCalledTimes(2);
    expect(f.video.paused).toBe(false);
  });

  it("keeps loading until a presented frame and rejects a pre-seek frame callback", () => {
    const f = setup({ ahead: 20, frames: true });
    const staleFrame = f.frame()!;
    f.event("playing");
    expect(f.state().phase).toBe("startup");
    f.controller.beginSeek();
    f.video.currentTime = 25;
    f.controller.endSeek();
    staleFrame(0, {} as VideoFrameCallbackMetadata);
    expect(f.state().phase).toBe("startup");
    expect(f.video.paused).toBe(true);
    f.buffer([[25, 30]]);
    f.frame()!(0, {} as VideoFrameCallbackMetadata);
    expect(f.state().phase).toBeNull();
  });

  it("never resumes during a scrub, nor after a paused seek", () => {
    const f = setup({ ahead: 10 });
    f.controller.beginSeek();
    f.video.currentTime = 15;
    f.buffer([[15, 25]]);
    f.event("seeked");
    vi.advanceTimersByTime(10_000);
    expect(f.video.paused).toBe(true);
    f.controller.endSeek();
    expect(f.video.paused).toBe(false);
    f.controller.togglePlayback();
    f.controller.beginSeek();
    f.video.currentTime = 17;
    f.controller.endSeek();
    expect(f.video.paused).toBe(true);
  });

  it("does not start on a timeout when automatic playback is disabled", () => {
    const f = setup({ autoplay: false });
    f.buffer([[0, 20]]);
    vi.advanceTimersByTime(10_000);
    expect(f.video.play).not.toHaveBeenCalled();
    expect(f.state()).toMatchObject({ phase: null, wantsPlaying: false });
  });

  it("invalidates source swaps and disposed frame callbacks", () => {
    const f = setup({ ahead: 10, frames: true });
    const staleFrame = f.frame()!;
    f.video.src = "https://cdn.test/second.mp4";
    f.buffer([[0, 20]]);
    vi.advanceTimersByTime(500);
    const previous = f.state();
    f.controller.dispose();
    staleFrame(0, {} as VideoFrameCallbackMetadata);
    f.controller.retry();
    expect(f.state()).toBe(previous);
    expect(f.video.paused).toBe(true);
    expect(f.health).toHaveBeenLastCalledWith(false);
  });

  it("clears error and blocked waits and allows deliberate retry", () => {
    const f = setup();
    f.event("error");
    expect(f.state()).toMatchObject({ error: true, phase: null, wantsPlaying: false });
    f.controller.retry();
    expect(f.video.paused).toBe(false);
    f.controller.blocked();
    f.buffer([[0, 20]]);
    expect(f.state()).toMatchObject({ blocked: true, phase: null, wantsPlaying: false });
    expect(f.video.paused).toBe(true);
    f.controller.togglePlayback();
    expect(f.state().blocked).toBe(false);
    expect(f.video.paused).toBe(false);
  });

  it("suspends hidden-tab work and restores only the prior play intent", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const f = setup({ ahead: 20 });
    f.event("playing");
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.video.paused).toBe(true);
    expect(f.health).toHaveBeenLastCalledWith(false);
    f.buffer([[0, 30]]);
    vi.advanceTimersByTime(10_000);
    expect(f.video.paused).toBe(true);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.video.paused).toBe(false);
    f.controller.togglePlayback();
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.video.paused).toBe(true);
  });

  it("deduplicates buffer health and revokes healthy status on disposal", () => {
    const f = setup({ ahead: 30 });
    f.event("playing");
    const reports = f.health.mock.calls.length;
    f.event("timeupdate");
    f.event("progress");
    expect(f.health).toHaveBeenCalledTimes(reports);
    f.controller.dispose();
    expect(f.health).toHaveBeenLastCalledWith(false);
  });

  it("turns a native pause into deliberate Play recovery without retrying on buffer or sound changes", () => {
    const f = setup({ ahead: 10 });
    f.event("playing");
    f.video.pause();
    expect(f.state()).toMatchObject({ wantsPlaying: false, phase: null });
    f.buffer([[0, 20]]);
    f.sound.setMuted(f.video, false);
    f.controller.resumeSound();
    expect(f.video.paused).toBe(true);
    f.controller.togglePlayback();
    expect(f.video.paused).toBe(false);
    expect(f.state().wantsPlaying).toBe(true);
  });

  it("ignores a queued pause notification after a newer playback has resumed", () => {
    const f = setup({ ahead: 10 });
    f.event("playing");
    f.controller.beginSeek();
    f.video.currentTime = 2;
    f.controller.endSeek();
    expect(f.video.paused).toBe(false);
    f.event("pause");
    expect(f.state().wantsPlaying).toBe(true);
    expect(f.video.paused).toBe(false);
  });

  it("releases speculative downloads only for sustained bandwidth headroom or a complete clip", () => {
    const f = setup({ ahead: 2 });
    f.event("playing");
    expect(f.health).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 2.5]]);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 3]]);
    expect(f.health).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 7]]);
    expect(f.health).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 11]]);
    expect(f.health).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1_000);
    f.event("timeupdate");
    expect(f.health).toHaveBeenLastCalledWith(false);
    f.buffer([[0, 30]]);
    expect(f.health).toHaveBeenLastCalledWith(true);
  });

  it.each(["seek", "visibility"] as const)("requires fresh bandwidth evidence after %s recovery", (recovery) => {
    const f = setup({ ahead: 2 });
    f.event("playing");
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 6]]);
    vi.advanceTimersByTime(1_000);
    f.buffer([[0, 10]]);
    expect(f.health).toHaveBeenLastCalledWith(true);
    if (recovery === "seek") {
      f.controller.beginSeek();
      f.video.currentTime = 1;
      f.controller.endSeek();
    } else {
      const visibility = vi.spyOn(document, "visibilityState", "get");
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    }
    f.event("playing");
    expect(f.video.paused).toBe(false);
    expect(f.health).toHaveBeenLastCalledWith(false);
  });
});

it("finishes a paused seek to the exact end rather than waiting for nonexistent runway", () => {
  const f = setup({ ahead: 30 });
  f.controller.beginSeek();
  f.video.currentTime = 30;
  f.controller.endSeek();
  expect(f.state()).toMatchObject({ phase: null, wantsPlaying: false });
  expect(f.video.paused).toBe(true);
  f.controller.togglePlayback();
  expect(f.video.currentTime).toBe(0);
  expect(f.video.paused).toBe(false);
});
