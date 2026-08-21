'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { ReplicationType } from '@/types/replications';
import {
  FALLBACK_VIDEO_RATIO,
  FIT_MODE_STORAGE_KEY,
  computeStageScale,
  resolveFitMode,
  resolveMediaAspect,
  type FitMode,
} from './viewerLogic';

/**
 * One crop rule on every immersive stage. This hook owns everything stateful
 * about it — the stage's live aspect, ratios probed from loaded media, the
 * reader's session-wide fit/fill choice — so the permalink viewer, the swipe
 * deck, and any future fullscreen surface crop the identical work
 * identically. The math itself lives in `viewerLogic` (pure, tested).
 *
 * The fit preference is a single external store over the one sessionStorage
 * key: toggling on any surface re-renders every mounted stage on the page,
 * and the next surface the reader opens reads the same key.
 */

const fitListeners = new Set<() => void>();

/** In-memory copy so the toggle still works when storage is denied. */
let memoryFitOverride: FitMode | null = null;

function readFitOverride(): FitMode | null {
  try {
    const stored = window.sessionStorage.getItem(FIT_MODE_STORAGE_KEY);
    if (stored === 'fit' || stored === 'fill') return stored;
  } catch {
    // Storage may be denied (private mode); the in-memory copy stands in.
  }
  return memoryFitOverride;
}

/** Statically rendered markup carries no preference; per-type defaults apply. */
const readServerFitOverride = (): FitMode | null => null;

function subscribeFitOverride(listener: () => void): () => void {
  fitListeners.add(listener);
  return () => {
    fitListeners.delete(listener);
  };
}

/** Persist the reader's explicit choice and notify every mounted stage. */
export function setFitOverride(mode: FitMode): void {
  memoryFitOverride = mode;
  try {
    window.sessionStorage.setItem(FIT_MODE_STORAGE_KEY, mode);
  } catch {
    // Session-only preference; losing it costs one extra tap next page.
  }
  for (const listener of fitListeners) listener();
}

export interface StageFitOptions {
  /** The element the media must fill; observed so the crop tracks resizes. */
  stageRef: React.RefObject<HTMLElement | null>;
  /** Keys probed aspects, so a stage that swaps works keeps earlier probes. */
  mediaKey: string;
  type: ReplicationType;
  /** Catalogued intrinsic dimensions, when the row carries them. */
  width?: number | null;
  height?: number | null;
}

export interface StageFit {
  fitMode: FitMode;
  /** Bounded fill transform for the media element; undefined = no crop. */
  scaleStyle: React.CSSProperties | undefined;
  toggleFit: () => void;
  /** Feed intrinsic sizes back from `loadedmetadata`; junk sizes ignored. */
  probeAspect: (mediaWidth: number, mediaHeight: number) => void;
}

export function useStageFit({ stageRef, mediaKey, type, width, height }: StageFitOptions): StageFit {
  const fitOverride = useSyncExternalStore(
    subscribeFitOverride,
    readFitOverride,
    readServerFitOverride,
  );
  /** Aspect ratios probed from loaded media, for rows missing dimensions. */
  const [probedAspects, setProbedAspects] = useState<Record<string, number>>({});
  const [stageAspect, setStageAspect] = useState(FALLBACK_VIDEO_RATIO);

  /** Track the stage's own aspect — the crop is against it, not the viewport. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      if (stage.clientHeight > 0) setStageAspect(stage.clientWidth / stage.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef]);

  const probeAspect = useCallback(
    (mediaWidth: number, mediaHeight: number) => {
      if (!(mediaWidth > 0) || !(mediaHeight > 0)) return;
      setProbedAspects((prev) =>
        prev[mediaKey] ? prev : { ...prev, [mediaKey]: mediaWidth / mediaHeight },
      );
    },
    [mediaKey],
  );

  const fitMode = resolveFitMode(type, fitOverride);
  const mediaAspect = resolveMediaAspect(type, width, height, probedAspects[mediaKey]);
  const scale = fitMode === 'fill' ? computeStageScale(mediaAspect, stageAspect) : 1;
  const scaleStyle = scale > 1.001 ? { transform: `scale(${scale.toFixed(3)})` } : undefined;

  const toggleFit = useCallback(() => {
    setFitOverride(fitMode === 'fill' ? 'fit' : 'fill');
  }, [fitMode]);

  return { fitMode, scaleStyle, toggleFit, probeAspect };
}
