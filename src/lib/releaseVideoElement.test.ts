import { describe, expect, it, vi, type Mock } from "vitest";

import { releaseVideoElement } from "./releaseVideoElement";

function stubbedVideo(): {
  video: HTMLVideoElement;
  pause: Mock;
  load: Mock;
} {
  const video = document.createElement("video");
  video.setAttribute("src", "https://cdn.test/work.mp4");
  const pause = vi.fn();
  const load = vi.fn();
  Object.defineProperties(video, {
    pause: { configurable: true, value: pause },
    load: { configurable: true, value: load },
  });
  return { video, pause, load };
}

describe("releaseVideoElement", () => {
  it("pauses, clears the source, and re-runs the load algorithm once detached", async () => {
    const { video, pause, load } = stubbedVideo();

    releaseVideoElement(video);
    await Promise.resolve();

    expect(pause).toHaveBeenCalledOnce();
    // The empty-source load is what actually frees the media player; the
    // attribute removal alone would leave the old resource selected.
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it("leaves a still-connected element untouched (StrictMode re-attach)", async () => {
    const { video, pause, load } = stubbedVideo();
    document.body.appendChild(video);

    releaseVideoElement(video);
    await Promise.resolve();

    // StrictMode detaches and re-attaches refs without unmounting the DOM
    // node; releasing here would strip a src React still believes is set.
    expect(pause).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(video.getAttribute("src")).toBe("https://cdn.test/work.mp4");
    video.remove();
  });
});
