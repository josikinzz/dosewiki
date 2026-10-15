export function releaseVideoElement(video: HTMLVideoElement): void {
  queueMicrotask(() => {
    if (video.isConnected) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
}
