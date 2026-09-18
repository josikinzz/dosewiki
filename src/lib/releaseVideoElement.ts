/**
 * Release a media element's decoder and network pipeline on unmount.
 *
 * A detached `<video>` keeps its underlying media player — and any
 * in-flight fetch — alive until garbage collection finally claims the
 * element. Chromium caps live players per frame (~75 desktop, ~40 mobile)
 * and, once the cap is hit, silently refuses to load new media: no
 * `error` event, just a video that never loads until a full page refresh.
 * Emptying the source and re-running the load algorithm frees the player
 * at unmount time instead of at GC time.
 *
 * The release is deferred one microtask and skipped for still-connected
 * elements: React StrictMode simulates remounts by detaching and
 * immediately re-attaching refs without touching the DOM, and releasing
 * on that simulated detach would strip the `src` attribute React still
 * believes is set. A genuinely unmounted element is out of the document
 * by the time the microtask runs.
 *
 * Callers passing this to a ref must keep the callback identity-stable
 * (`useCallback`), or React re-runs the detach path on every render.
 */
export function releaseVideoElement(video: HTMLVideoElement): void {
  queueMicrotask(() => {
    if (video.isConnected) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
}
