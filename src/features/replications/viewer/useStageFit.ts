"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplicationType } from "@/types/replications";

export const FALLBACK_IMAGE_RATIO = 4 / 3;
export const FALLBACK_VIDEO_RATIO = 16 / 9;

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
  portraitPhone: boolean;
  rotateMode: boolean;
  mediaAspect: number;
}

export interface StageRotation {
  canRotate: boolean;
  rotated: boolean;
}

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
  rotateMode: boolean;
  width?: number | null;
  height?: number | null;
}

export interface StageFit {
  canRotate: boolean;
  rotated: boolean;
  probeAspect: (mediaWidth: number, mediaHeight: number) => void;
  mediaAspect: number;
  aspectSettled: boolean;
}

export function useStageFit({
  mediaKey,
  type,
  rotateMode,
  width,
  height,
}: StageFitOptions): StageFit {
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
