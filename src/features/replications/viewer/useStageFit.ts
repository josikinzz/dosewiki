"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplicationType } from "@/types/replications";
import { resolveMediaAspect } from "./viewerLogic";

export interface StageRotationInput {
  /** Portrait-phone layout is active (viewport, not device). */
  portraitPhone: boolean;
  /** True for media that plays (video or controllable GIF rendition). */
  moving: boolean;
  /** Resolved width/height ratio of the active media. */
  mediaAspect: number;
  /** Identity of the active media. */
  mediaKey: string;
  /** The media the reader last rotated, or null when upright. */
  rotatedKey: string | null;
}

export interface StageRotation {
  /** Offer the rotate-to-fit control. */
  canRotate: boolean;
  /** Paint the stage media turned 90°. */
  rotated: boolean;
}

/**
 * The rotate-to-fit decision: only landscape moving media on a portrait
 * phone benefits from being turned sideways, and a rotation belongs to the
 * one work it was requested on — advancing to any other work (or to media
 * that is not landscape) lands upright, because `rotatedKey` no longer
 * names the active media.
 */
export function stageRotation({
  portraitPhone,
  moving,
  mediaAspect,
  mediaKey,
  rotatedKey,
}: StageRotationInput): StageRotation {
  const canRotate =
    moving && portraitPhone && Number.isFinite(mediaAspect) && mediaAspect > 1;
  return { canRotate, rotated: canRotate && rotatedKey === mediaKey };
}

export interface StageFitOptions {
  mediaKey: string;
  type: ReplicationType;
  moving?: boolean;
  width?: number | null;
  height?: number | null;
}

export interface StageFit {
  canRotate: boolean;
  rotated: boolean;
  toggleRotate: () => void;
  probeAspect: (mediaWidth: number, mediaHeight: number) => void;
}

/**
 * Rotate-to-fit for landscape motion on portrait phones: turning the work
 * sideways (a pure CSS transform on the stage media, never the chrome) fills
 * the tall screen edge-to-edge the way physically rotating the phone would.
 * State lives in the open viewer, never browser storage.
 */
export function useStageFit({
  mediaKey,
  type,
  moving = type === "video",
  width,
  height,
}: StageFitOptions): StageFit {
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
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
    moving,
    mediaAspect,
    mediaKey,
    rotatedKey,
  });
  const toggleRotate = useCallback(() => {
    setRotatedKey((previous) => (previous === mediaKey ? null : mediaKey));
  }, [mediaKey]);

  return {
    canRotate,
    rotated,
    toggleRotate,
    probeAspect,
  };
}
