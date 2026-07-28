"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import {
  describePlaybackPosition,
  formatPlaybackTime,
  getPlaybackProgressRatio,
} from "./audioPlaybackTime";

type LoadState = "loading" | "ready" | "error";

/** Every mounted player, so starting one clip can stop whichever was running. */
const mountedPlayers = new Set<HTMLAudioElement>();

function pauseOtherPlayers(active: HTMLAudioElement) {
  mountedPlayers.forEach((player) => {
    if (player !== active && !player.paused) {
      player.pause();
    }
  });
}

function readDuration(audio: HTMLAudioElement) {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
}

interface AudioReplicationPlayerProps {
  /** Direct URL of the clip. */
  src: string;
  /** Clip title, folded into the control labels so each player is distinguishable. */
  label: string;
  className?: string;
}

/**
 * Themed transport for one audio replication: a real <audio> element driving
 * custom play/pause, scrub, and elapsed/total controls.
 */
export function AudioReplicationPlayer({ src, label, className }: AudioReplicationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    mountedPlayers.add(audio);

    // Metadata can land before hydration attaches the React handlers.
    if (audio.error) {
      setLoadState("error");
    } else if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setLoadState("ready");
      setDuration(readDuration(audio));
    }

    return () => {
      mountedPlayers.delete(audio);
    };
  }, []);

  const handleToggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      if (audio.ended) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      // Rejections (autoplay policy, unsupported source) surface through the
      // element's own pause/error events.
      void audio.play().catch(() => undefined);
      return;
    }

    audio.pause();
  }, []);

  const handleSeek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
    setHasEnded(false);
  }, []);

  const hasDuration = duration !== null;
  const progress = getPlaybackProgressRatio(currentTime, duration);
  // Track the thumb's centre rather than its left edge so neither end overhangs.
  const progressOffset = `calc(0.375rem + (100% - 0.75rem) * ${progress.toFixed(5)})`;
  const isFailed = loadState === "error";

  const transportIcon = isFailed
    ? "lucide:triangle-alert"
    : isBuffering
      ? "lucide:loader-circle"
      : hasEnded
        ? "lucide:rotate-ccw"
        : isPlaying
          ? "lucide:pause"
          : "lucide:play";

  const transportLabel = isFailed
    ? `${label} could not be loaded`
    : hasEnded
      ? `Replay ${label}`
      : isPlaying
        ? `Pause ${label}`
        : `Play ${label}`;

  return (
    <div
      className={cn("flex items-center gap-3", className)}
      role="group"
      aria-label={`Audio player: ${label}`}
      aria-busy={loadState === "loading" || undefined}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setLoadState("ready");
          setDuration(readDuration(event.currentTarget));
        }}
        onDurationChange={(event) => setDuration(readDuration(event.currentTarget))}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={(event) => {
          pauseOtherPlayers(event.currentTarget);
          setIsPlaying(true);
          setHasEnded(false);
        }}
        onPlaying={() => setIsBuffering(false)}
        onWaiting={() => setIsBuffering(true)}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setHasEnded(true);
        }}
        onError={() => {
          setLoadState("error");
          setIsPlaying(false);
          setIsBuffering(false);
        }}
      >
        <track kind="captions" />
        <a href={src}>Download {label}</a>
      </audio>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isFailed}
        aria-label={transportLabel}
        title={transportLabel}
        className={cn(
          "theme-control-pill inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          isFailed && "cursor-not-allowed opacity-60",
        )}
      >
        <Icon
          icon={transportIcon}
          size={18}
          className={cn(
            isFailed ? "theme-icon-danger" : "theme-icon-accent",
            isBuffering && !isFailed && "animate-spin motion-reduce:animate-none",
          )}
        />
      </button>

      <div className="min-w-0 flex-1">
        {isFailed ? (
          <p role="alert" className="theme-text-secondary text-xs leading-5">
            This clip could not be loaded.{" "}
            <a
              href={src}
              className="theme-accent-heading transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              Open the file directly
            </a>
            .
          </p>
        ) : (
          <>
            <div className="relative flex h-4 items-center">
              <input
                type="range"
                min={0}
                max={hasDuration ? duration : 0}
                step="any"
                value={hasDuration ? Math.min(currentTime, duration) : 0}
                disabled={!hasDuration}
                onChange={(event) => handleSeek(Number(event.currentTarget.value))}
                aria-label={`Seek within ${label}`}
                aria-valuetext={describePlaybackPosition(currentTime, duration)}
                className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 outline-none disabled:cursor-not-allowed"
              />
              <div
                aria-hidden="true"
                style={{ "--audio-progress": progressOffset } as CSSProperties}
                className={cn(
                  "theme-audio-scrubber-track pointer-events-none absolute inset-x-0 h-1.5 rounded-full transition-opacity",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-fuchsia-400",
                  !hasDuration && "opacity-60",
                )}
              >
                <div className="theme-audio-scrubber-fill h-full w-[var(--audio-progress)] rounded-full" />
                <span className="theme-audio-scrubber-thumb absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full left-[var(--audio-progress)]" />
              </div>
            </div>

            <div className="theme-text-faint mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
              <span>{formatPlaybackTime(currentTime)}</span>
              <span>{formatPlaybackTime(duration)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
