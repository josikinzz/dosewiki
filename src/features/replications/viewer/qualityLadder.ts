import type { ReplicationViewerMedia } from "./viewerModel";
import {
  shouldLoopReplicationMotion,
  slideMotionSource,
  type SlideQuality,
} from "./viewerLogic";

/** A preview at least this much shorter than the catalogue is truncated. */
export const PREVIEW_TRUNCATION_TOLERANCE_S = 1;
/**
 * The preview generator's hard length cap (scripts/replications/
 * generate-preview-renditions.mjs cuts every preview at 10 seconds).
 */
export const PREVIEW_GENERATOR_CAP_S = 10;
/**
 * How long a work must keep playing before the stage sharpens it to the
 * catalogued file. A fling across several works never triggers a full-file
 * fetch; a watched work upgrades almost immediately.
 */
export const AUTO_HQ_SETTLE_MS = 1000;

/** Seeks this close past the preview's end escalate to the full file. */
const PREVIEW_SEEK_TOLERANCE_S = 0.25;

export interface LadderContext {
  replication: ReplicationViewerMedia;
  quality: SlideQuality;
  hqAvailable: boolean;
  dataSaver: boolean;
}

export type LadderEvent =
  | { type: "metadata"; elementDuration: number }
  | { type: "ended"; elementDuration: number }
  | {
      type: "seek";
      target: number;
      elementDuration: number;
      paused: boolean;
      ended: boolean;
    }
  | { type: "settled"; currentTime: number }
  | {
      type: "hq";
      desired: SlideQuality;
      currentTime: number;
      paused: boolean;
      ended: boolean;
    };

export type LadderVerdict =
  | { kind: "stay"; loop?: boolean }
  | {
      kind: "switch";
      quality: SlideQuality;
      src: string;
      time: number;
      play: boolean;
    };

export function resumeAfterSwap(paused: boolean, ended: boolean): boolean {
  // A naturally ended element reports paused=true (the spec pauses it
  // before firing `ended`), but an ended preview is mid-work by
  // definition — the whole point of the swap is to keep it moving.
  return !paused || ended;
}

/**
 * True when the element is playing a preview rendition that ends before
 * the catalogued work does — looping it would silently amputate the piece.
 * Rows with no catalogued duration fall back to the generator's contract:
 * previews are cut at PREVIEW_GENERATOR_CAP_S, so a preview that runs the
 * whole cap is presumed truncated and continues into the full file. A work
 * that genuinely lasts the cap pays one redundant swap at its final frame.
 */
export function previewTruncated(
  ctx: LadderContext,
  elementDuration: number,
): boolean {
  if (!ctx.hqAvailable || ctx.quality !== "preview") return false;
  if (!Number.isFinite(elementDuration) || elementDuration <= 0) return false;
  const catalogued = ctx.replication.duration;
  if (typeof catalogued !== "number" || catalogued <= 0) {
    return elementDuration >= PREVIEW_GENERATOR_CAP_S - 0.15;
  }
  return catalogued > elementDuration + PREVIEW_TRUNCATION_TOLERANCE_S;
}

export function decide(
  event: LadderEvent,
  ctx: LadderContext,
): LadderVerdict {
  switch (event.type) {
    case "metadata":
      return {
        kind: "stay",
        loop:
          shouldLoopReplicationMotion(
            ctx.replication.format,
            ctx.replication.duration ?? event.elementDuration,
          ) && !previewTruncated(ctx, event.elementDuration),
      };
    case "ended":
      return previewTruncated(ctx, event.elementDuration)
        ? {
            kind: "switch",
            quality: "full",
            src: ctx.replication.url,
            time: event.elementDuration,
            play: true,
          }
        : { kind: "stay" };
    case "seek":
      return ctx.quality === "preview" &&
        ctx.hqAvailable &&
        previewTruncated(ctx, event.elementDuration) &&
        event.target > event.elementDuration - PREVIEW_SEEK_TOLERANCE_S
        ? {
            kind: "switch",
            quality: "full",
            src: ctx.replication.url,
            time: event.target,
            play: resumeAfterSwap(event.paused, event.ended),
          }
        : { kind: "stay" };
    case "settled":
      return ctx.quality === "preview" && ctx.hqAvailable && !ctx.dataSaver
        ? {
            kind: "switch",
            quality: "full",
            src: ctx.replication.url,
            time: event.currentTime,
            play: true,
          }
        : { kind: "stay" };
    case "hq": {
      if (event.desired === ctx.quality || !ctx.hqAvailable) {
        return { kind: "stay" };
      }
      const src = slideMotionSource(ctx.replication, event.desired);
      if (!src) return { kind: "stay" };
      return {
        kind: "switch",
        quality: event.desired,
        src,
        time: event.currentTime,
        play:
          event.desired === "full"
            ? resumeAfterSwap(event.paused, event.ended)
            : !event.paused,
      };
    }
  }
}
