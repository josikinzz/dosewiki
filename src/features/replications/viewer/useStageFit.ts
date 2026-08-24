"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplicationType } from "@/types/replications";
import { resolveMediaAspect } from "./viewerLogic";

export const PORTRAIT_PHONE_SCALE = 1.15;
export const PORTRAIT_PHONE_SCALE_LIMIT = 1.2;

export function portraitPhoneMediaScale({
  moving,
  mediaAspect,
  portraitPhone,
  fullFrame,
}: {
  moving: boolean;
  mediaAspect: number;
  portraitPhone: boolean;
  fullFrame: boolean;
}): number {
  if (
    !moving ||
    !portraitPhone ||
    fullFrame ||
    !Number.isFinite(mediaAspect) ||
    mediaAspect <= 1
  ) {
    return 1;
  }
  return Math.min(PORTRAIT_PHONE_SCALE, PORTRAIT_PHONE_SCALE_LIMIT);
}

export interface StageFitOptions {
  mediaKey: string;
  type: ReplicationType;
  moving?: boolean;
  width?: number | null;
  height?: number | null;
  fullFrame?: boolean;
  onFullFrameChange?: (fullFrame: boolean) => void;
}

export interface StageFit {
  canEnlarge: boolean;
  scaleStyle: React.CSSProperties | undefined;
  toggleFit: () => void;
  probeAspect: (mediaWidth: number, mediaHeight: number) => void;
}

/**
 * The only automatic crop: a small enlargement for wide moving media on a
 * portrait phone. State lives in the open viewer, never browser storage.
 */
export function useStageFit({
  mediaKey,
  type,
  moving = type === "video",
  width,
  height,
  fullFrame: controlledFullFrame,
  onFullFrameChange,
}: StageFitOptions): StageFit {
  const [localFullFrame, setLocalFullFrame] = useState(false);
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [probedAspects, setProbedAspects] = useState<Record<string, number>>(
    {},
  );
  const fullFrame = controlledFullFrame ?? localFullFrame;

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
  const canEnlarge = moving && portraitPhone && mediaAspect > 1;
  const scale = portraitPhoneMediaScale({
    moving,
    mediaAspect,
    portraitPhone,
    fullFrame,
  });
  const scaleStyle =
    scale > 1.001 ? { transform: `scale(${scale.toFixed(3)})` } : undefined;
  const toggleFit = useCallback(() => {
    const next = !fullFrame;
    if (controlledFullFrame === undefined) setLocalFullFrame(next);
    onFullFrameChange?.(next);
  }, [controlledFullFrame, fullFrame, onFullFrameChange]);

  return {
    canEnlarge,
    scaleStyle,
    toggleFit,
    probeAspect,
  };
}
