"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplicationType } from "@/types/replications";

/** Aspect assumed for media whose intrinsic size hasn't arrived yet. */
export const FALLBACK_IMAGE_RATIO = 4 / 3;
export const FALLBACK_VIDEO_RATIO = 16 / 9;

/**
 * The aspect the crop math runs against, by trust order: a ratio probed from
 * the loaded media itself beats the catalogued dimensions (rows imported
 * before dimensions were recorded lack them, and a few carry stale ones),
 * which beat the per-type guess. The guess only positions the first paint —
 * degenerate inputs must resolve to *something* rather than crop on NaN.
 */
export function resolveMediaAspect(
  type: ReplicationType,
  width: number | null | undefined,
  height: number | null | undefined,
  probed?: number,
): number {
  if (probed !== undefined && Number.isFinite(probed) && probed > 0)
    return probed;
  if (width && height && width > 0 && height > 0) return width / height;
  return type === "video" ? FALLBACK_VIDEO_RATIO : FALLBACK_IMAGE_RATIO;
}

export interface StageRotationInput {
  /** Portrait-phone layout is active (viewport, not device). */
  portraitPhone: boolean;
  /** The session's sticky rotate-mode preference. */
  rotateMode: boolean;
  /** Resolved width/height ratio of the active media. */
  mediaAspect: number;
}

export interface StageRotation {
  /** Offer the rotate-mode toggle. */
  canRotate: boolean;
  /** Paint the stage media turned 90°. */
  rotated: boolean;
}

/**
 * The rotate-to-fit decision: rotate mode is the reader's sticky choice, and
 * while it is on every landscape work turns sideways to fill the portrait
 * screen — portrait and square works land upright, and the next landscape
 * work turns again without being re-asked. The toggle is offered on every
 * portrait-phone layout so the mode can be entered or left from any work;
 * desktop and landscape viewports never rotate and never see it.
 */
export function stageRotation({
  portraitPhone,
  rotateMode,
  mediaAspect,
}: StageRotationInput): StageRotation {
  return {
    canRotate: portraitPhone,
    rotated:
      portraitPhone &&
      rotateMode &&
      Number.isFinite(mediaAspect) &&
      mediaAspect > 1,
  };
}

const PORTRAIT_PHONE_QUERY = "(max-width: 767px) and (orientation: portrait)";

export interface StageFitOptions {
  mediaKey: string;
  type: ReplicationType;
  /** The session's sticky rotate-mode preference (owned by the overlay). */
  rotateMode: boolean;
  width?: number | null;
  height?: number | null;
}

export interface StageFit {
  canRotate: boolean;
  rotated: boolean;
  probeAspect: (mediaWidth: number, mediaHeight: number) => void;
  /** Resolved width/height ratio of the active media (probed > catalogued > guess). */
  mediaAspect: number;
  /**
   * True once mediaAspect is real evidence (probed or catalogued) rather
   * than the per-type guess — until then the rotation decision may still
   * change when the runtime probe lands.
   */
  aspectSettled: boolean;
}

/**
 * Rotate-to-fit for landscape works on portrait phones: turning the work
 * sideways (a pure CSS transform on the stage media, never the chrome) fills
 * the tall screen edge-to-edge the way physically rotating the phone would.
 * The mode itself lives in the overlay, persisted per-session beside the
 * sound preference; this hook derives whether the active media turns.
 */
export function useStageFit({
  mediaKey,
  type,
  rotateMode,
  width,
  height,
}: StageFitOptions): StageFit {
  // Seeded synchronously so the first paint of a freshly mounted stage
  // already knows the layout: reading it lazily in an effect made every
  // work paint upright once and snap to rotated a frame later.
  const [portraitPhone, setPortraitPhone] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia) &&
      window.matchMedia(PORTRAIT_PHONE_QUERY).matches,
  );
  const [probedAspects, setProbedAspects] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(PORTRAIT_PHONE_QUERY);
    const update = () => setPortraitPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const probeAspect = useCallback(
    (mediaWidth: number, mediaHeight: number) => {
      if (!(mediaWidth > 0) || !(mediaHeight > 0)) return;
      setProbedAspects((previous) =>
        previous[mediaKey]
          ? previous
          : { ...previous, [mediaKey]: mediaWidth / mediaHeight },
      );
    },
    [mediaKey],
  );

  const probed = probedAspects[mediaKey];
  const mediaAspect = resolveMediaAspect(type, width, height, probed);
  const aspectSettled =
    probed !== undefined ||
    Boolean(width && height && width > 0 && height > 0);
  const { canRotate, rotated } = stageRotation({
    portraitPhone,
    rotateMode,
    mediaAspect,
  });

  return {
    canRotate,
    rotated,
    probeAspect,
    mediaAspect,
    aspectSettled,
  };
}
