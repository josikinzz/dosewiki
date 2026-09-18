import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adoptPooledElement,
  assignPooledSource,
  clearPooledSource,
  createSoundCustody,
  detachPooledElement,
  demotePooledElement,
  reloadPooledElement,
  seekPooledElement,
  silencePooledElement,
} from "./mediaCustody";

function video({ paused = true }: { paused?: boolean } = {}) {
  const element = document.createElement("video");
  const play = vi.fn<() => Promise<void> | undefined>().mockResolvedValue(undefined);
  const pause = vi.fn();
  const load = vi.fn();
  Object.defineProperty(element, "paused", { configurable: true, value: paused });
  Object.defineProperty(element, "play", { configurable: true, value: play });
  Object.defineProperty(element, "pause", { configurable: true, value: pause });
  Object.defineProperty(element, "load", { configurable: true, value: load });
  return { element, play, pause, load };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("pooled element custody verbs", () => {
  it("adopts by stamping both mute properties", () => {
    const { element } = video();
    element.defaultMuted = false;
    element.muted = false;
    adoptPooledElement(element);
    expect({ muted: element.muted, defaultMuted: element.defaultMuted }).toEqual({
      muted: true,
      defaultMuted: true,
    });
  });

  it.each([
    ["silence", silencePooledElement, true],
    ["demote", demotePooledElement, false],
  ] as const)("%s preserves its distinct defaultMuted behavior", (_, verb, expected) => {
    const { element, pause } = video({ paused: false });
    element.defaultMuted = false;
    verb(element);
    expect(element.muted).toBe(true);
    expect(element.defaultMuted).toBe(expected);
    expect(pause).toHaveBeenCalledOnce();
  });

  it.each([
    [false, 0],
    [true, 1],
  ] as const)("assigns a source and resume=%s controls play", (resume, plays) => {
    const { element, play } = video();
    assignPooledSource(element, "https://cdn.test/new.mp4", {
      time: 12,
      resume,
      poster: "https://cdn.test/poster.jpg",
    });
    expect(element.src).toBe("https://cdn.test/new.mp4");
    expect(element.currentTime).toBe(12);
    expect(element.getAttribute("poster")).toBe("https://cdn.test/poster.jpg");
    expect(play).toHaveBeenCalledTimes(plays);
  });

  it("clears source and poster before loading", () => {
    const { element, load } = video();
    element.src = "https://cdn.test/old.mp4";
    element.poster = "https://cdn.test/old.jpg";
    clearPooledSource(element);
    expect(element.hasAttribute("src")).toBe(false);
    expect(element.hasAttribute("poster")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it("detaches through the generic deferred release", async () => {
    const { element, pause, load } = video({ paused: false });
    element.src = "https://cdn.test/old.mp4";
    detachPooledElement(element);
    await settlePromises();
    expect(pause).toHaveBeenCalledOnce();
    expect(element.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it("routes seek and reload mutations", () => {
    const { element, load } = video();
    seekPooledElement(element, 8);
    reloadPooledElement(element);
    expect(element.currentTime).toBe(8);
    expect(load).toHaveBeenCalledOnce();
  });
});

describe("sound custody", () => {
  it("arms an IOU after refused sound and retries muted", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = false;
    play.mockRejectedValueOnce(new Error("gesture required")).mockResolvedValueOnce(undefined);
    const custody = createSoundCustody({ volume: 0.6, onBlocked: vi.fn() });
    custody.attemptPlay(element);
    await settlePromises();
    expect(play).toHaveBeenCalledTimes(2);
    expect(element.muted).toBe(true);
    expect(custody.iouOutstanding()).toBe(true);
  });

  it("reports blocked when muted playback is refused", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = true;
    play.mockRejectedValueOnce(new Error("blocked"));
    const onBlocked = vi.fn();
    const custody = createSoundCustody({ volume: 1, onBlocked });
    custody.attemptPlay(element);
    await settlePromises();
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(custody.iouOutstanding()).toBe(false);
  });

  it("reports blocked when the muted fallback is also refused", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = false;
    play.mockRejectedValueOnce(new Error("sound refused")).mockRejectedValueOnce(new Error("muted refused"));
    const onBlocked = vi.fn();
    const custody = createSoundCustody({ volume: 1, onBlocked });
    custody.attemptPlay(element);
    await settlePromises();
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(custody.iouOutstanding()).toBe(true);
  });

  it("repays and clears an IOU with the current volume", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = false;
    play.mockRejectedValueOnce(new Error("refused")).mockResolvedValueOnce(undefined);
    let volume = 0.4;
    const custody = createSoundCustody({ volume: () => volume, onBlocked: vi.fn() });
    custody.attemptPlay(element);
    await settlePromises();
    volume = 0.7;
    expect(custody.repayIou(element)).toBe(true);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(0.7);
    expect(custody.iouOutstanding()).toBe(false);
    expect(custody.repayIou(element)).toBe(false);
  });

  it("refuses to unmute through preference sync while an IOU is outstanding", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = false;
    play.mockRejectedValueOnce(new Error("refused")).mockResolvedValueOnce(undefined);
    const custody = createSoundCustody({ volume: 0.5, onBlocked: vi.fn() });
    custody.attemptPlay(element);
    await settlePromises();
    custody.applyPreference(element, false);
    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0.5);
    expect(custody.iouOutstanding()).toBe(true);
  });

  it("does not retry refused audio after an explicit pause", async () => {
    const { element, play } = video();
    document.body.append(element);
    element.muted = false;
    let rejectPending!: (reason: unknown) => void;
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
    play.mockReturnValueOnce(pending);
    const onBlocked = vi.fn();
    const custody = createSoundCustody({ volume: 1, onBlocked });
    custody.attemptPlay(element);
    custody.pause(element);
    rejectPending(new DOMException("denied", "NotAllowedError"));
    await settlePromises();
    expect(play).toHaveBeenCalledOnce();
    expect(element.muted).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("ignores a stale fallback rejection after custody moves to a new element", async () => {
    const { element, play } = video();
    const next = video();
    document.body.append(element, next.element);
    element.muted = false;
    let rejectFallback!: (reason: unknown) => void;
    const fallback = new Promise<void>((_resolve, reject) => { rejectFallback = reject; });
    play.mockRejectedValueOnce(new Error("sound denied"))
      .mockReturnValueOnce(fallback);
    const onBlocked = vi.fn();
    const custody = createSoundCustody({ volume: 1, onBlocked });
    custody.attemptPlay(element);
    await settlePromises();
    custody.pause(element);
    custody.attemptPlay(next.element);
    rejectFallback(new Error("old fallback denied"));
    await settlePromises();
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
