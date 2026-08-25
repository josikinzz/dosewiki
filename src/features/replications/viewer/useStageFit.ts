"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplicationType } from "@/types/replications";
import { resolveMediaAspect } from "./viewerLogic";

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
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [probedAspects, setProbedAspects] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(
      "(max-width: 767px) and (orientation: portrait)",
    );
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

  const mediaAspect = resolveMediaAspect(
    type,
    width,
    height,
    probedAspects[mediaKey],
  );
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
  };
}
