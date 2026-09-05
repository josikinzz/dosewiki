import { releaseVideoElement } from "@/lib/releaseVideoElement";

export function adoptPooledElement(element: HTMLVideoElement): void {
  element.defaultMuted = true;
  element.muted = true;
}

export function detachPooledElement(element: HTMLVideoElement): void {
  releaseVideoElement(element);
}

export function clearPooledSource(element: HTMLVideoElement): void {
  element.removeAttribute("src");
  element.removeAttribute("poster");
  element.load();
}

export function assignPooledSource(
  element: HTMLVideoElement,
  src: string,
  {
    time,
    resume,
    poster,
  }: { time: number; resume: boolean; poster?: string | null },
): void {
  if (poster) element.setAttribute("poster", poster);
  else if (poster === null) element.removeAttribute("poster");
  element.src = src;
  if (time > 0) element.currentTime = time;
  if (resume) {
    const attempt = element.play();
    if (attempt) void attempt.catch(() => undefined);
  }
}
export function seekPooledElement(
  element: HTMLVideoElement,
  time: number,
): void {
  element.currentTime = time;
}

export function reloadPooledElement(element: HTMLVideoElement): void {
  element.load();
}

export function silencePooledElement(element: HTMLVideoElement): void {
  element.muted = true;
  element.defaultMuted = true;
  if (!element.paused) element.pause();
}

export function demotePooledElement(element: HTMLVideoElement): void {
  element.muted = true;
  if (!element.paused) element.pause();
}

export function warmPooledElement(element: HTMLVideoElement): void {
  element.muted = true;
  const attempt = element.play();
  if (attempt) void attempt.catch(() => undefined);
}


interface SoundCustodyOptions {
  volume: number | (() => number);
  onBlocked: () => void;
}

export interface SoundCustody {
  attemptPlay: (element: HTMLVideoElement) => void;
  repayIou: (element: HTMLVideoElement) => boolean;
  applyPreference: (element: HTMLVideoElement, muted: boolean) => void;
  setMuted: (
    element: HTMLVideoElement,
    muted: boolean,
    volume?: number | null,
  ) => void;
  setVolume: (element: HTMLVideoElement) => void;
  pause: (element: HTMLVideoElement) => void;
  clearIou: () => void;
  iouOutstanding: () => boolean;
}

export function createSoundCustody({
  volume,
  onBlocked,
}: SoundCustodyOptions): SoundCustody {
  let soundIou = false;
  let playGeneration = 0;
  const currentVolume = () =>
    typeof volume === "function" ? volume() : volume;

  const attemptPlay = (element: HTMLVideoElement) => {
    const generation = ++playGeneration;
    const attemptSrc = element.src;
    const attempt = element.play();
    if (!attempt) return;
    void attempt.catch((reason: unknown) => {
      if (generation !== playGeneration || !element.isConnected || element.src !== attemptSrc) return;
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (!element.muted) {
        element.muted = true;
        soundIou = true;
        const retry = element.play();
        if (retry) void retry.catch((retryReason: unknown) => {
          if (generation !== playGeneration || !element.isConnected || element.src !== attemptSrc) return;
          if (retryReason instanceof DOMException && retryReason.name === "AbortError") return;
          onBlocked();
        });
        return;
      }
      onBlocked();
    });
  };

  return {
    attemptPlay,
    repayIou(element) {
      if (!soundIou) return false;
      soundIou = false;
      element.muted = false;
      element.volume = currentVolume();
      return true;
    },
    applyPreference(element, muted) {
      element.volume = currentVolume();
      if (muted) {
        element.muted = true;
        soundIou = false;
      } else if (!soundIou) {
        element.muted = false;
      }
    },
    setMuted(element, muted, selectedVolume = currentVolume()) {
      element.muted = muted;
      if (selectedVolume !== null) element.volume = selectedVolume;
      soundIou = false;
    },
    setVolume(element) {
      element.volume = currentVolume();
    },
    pause(element) {
      playGeneration += 1;
      if (!element.paused) element.pause();
    },
    clearIou() {
      soundIou = false;
    },
    iouOutstanding() {
      return soundIou;
    },
  };
}
