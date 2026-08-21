import type { ReplicationType } from '@/types/replications';
import { hasKnownCreator } from '@/features/effects/components/replicationCredit';
import { publicHref } from '@/utils/publicHref';
import type { ReplicationViewerItem } from './viewerModel';

/**
 * The pure decisions behind the replication viewer — crop math, URL grammar,
 * mode defaults — kept out of the component so each can be tested without a
 * DOM and read without wading through event handlers.
 */

export type FitMode = 'fit' | 'fill';

/** sessionStorage key remembering the reader's explicit fit/fill choice. */
export const FIT_MODE_STORAGE_KEY = 'replication-viewer-fit';

/**
 * Ceiling on the fill-mode zoom. A 16:9 loop on a portrait phone would need
 * roughly 2–3× to truly cover the stage, which discards most of the frame; a
 * bounded zoom crops enough that the media reads as filling the stage rather
 * than floating in letterbox, while still showing the bulk of the work. Past
 * the ceiling the residual letterbox is accepted instead of the crop growing.
 */
export const FILL_SCALE_LIMIT = 1.35;

/**
 * The transform that moves an `object-contain` element toward covering its
 * stage. Contained media is scaled so its limiting dimension fits, so the
 * scale that would exactly cover the stage is the ratio of the two aspects —
 * whichever way the mismatch runs. The transform origin stays centered, which
 * is what makes the crop symmetric. Degenerate aspects (unloaded metadata,
 * zero-sized stage) return 1: never crop on a guess.
 */
export function computeFillScale(
  mediaAspect: number,
  stageAspect: number,
  maxScale: number = FILL_SCALE_LIMIT,
): number {
  if (
    !Number.isFinite(mediaAspect) ||
    !Number.isFinite(stageAspect) ||
    mediaAspect <= 0 ||
    stageAspect <= 0
  ) {
    return 1;
  }

  const coverScale =
    mediaAspect > stageAspect ? mediaAspect / stageAspect : stageAspect / mediaAspect;

  return Math.min(coverScale, maxScale);
}

/**
 * The crop rule every immersive stage shares (permalink viewer, swipe deck,
 * playlist stages): only landscape media may zoom-crop toward covering the
 * stage, bounded by {@link FILL_SCALE_LIMIT}. Portrait and square media never
 * crop — a vertical work shown whole *is* the presentation, and cropping it
 * to fill a landscape stage would cut the subject, not letterbox bars.
 */
export function computeStageScale(
  mediaAspect: number,
  stageAspect: number,
  maxScale: number = FILL_SCALE_LIMIT,
): number {
  if (!Number.isFinite(mediaAspect) || mediaAspect <= 1) return 1;
  return computeFillScale(mediaAspect, stageAspect, maxScale);
}

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
  if (probed !== undefined && Number.isFinite(probed) && probed > 0) return probed;
  if (width && height && width > 0 && height > 0) return width / height;
  return type === 'video' ? FALLBACK_VIDEO_RATIO : FALLBACK_IMAGE_RATIO;
}

/**
 * A `?set=` scope the URL opted into. The entry context emits it — an effect
 * article scopes to that effect, a substance showcase to that substance, an
 * artist listing to that artist — and the viewer walks the named set instead
 * of the server default (the work's own effect walk).
 */
export interface ViewerSetParam {
  kind: 'effect' | 'substance' | 'artist';
  /**
   * URL key of the scope's subject: an effect or substance slug, or the
   * gallery artist URL key (`artistUrlKey` — same charset, including the
   * `unknown`/`unknown-<hash>` segments of the Unattributed bucket).
   */
  slug: string;
}

/**
 * The slug is interpolated straight into a same-origin fetch path, so it is
 * held to the site's slug charset rather than trusted as free text — anything
 * else (path traversal, query smuggling, plain typos) parses as "no scope"
 * and the viewer keeps the server-chosen walk.
 */
const SET_PARAM_PATTERN = /^(effect|substance|artist):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Parse `location.search` for a viewer scope, e.g. `?set=effect:tracers`. */
export function parseViewerSetParam(search: string): ViewerSetParam | null {
  const value = new URLSearchParams(search).get('set');
  if (!value) return null;

  const match = SET_PARAM_PATTERN.exec(value);
  return match
    ? { kind: match[1] as ViewerSetParam['kind'], slug: match[2] }
    : null;
}

/**
 * The canonical path pushed on client-side navigation. The scope param rides
 * along only while a scoped walk is actually live, so a copied URL always
 * reproduces the sequence the copier was moving through — and never claims a
 * scope the viewer silently fell back from.
 */
export function buildViewerPath(slug: string, setParam: ViewerSetParam | null): string {
  const path = publicHref.replication(slug);
  return setParam ? `${path}?set=${setParam.kind}:${setParam.slug}` : path;
}

/**
 * Videos default to fill: replications are loops shot for motion, and a wide
 * loop letterboxed into a portrait stage plays as a small strip. Images
 * default to fit because a crop misrepresents a still — the whole frame is
 * the claim. A reader's explicit toggle overrides both for the session.
 */
export function resolveFitMode(type: ReplicationType, stored: string | null): FitMode {
  if (stored === 'fit' || stored === 'fill') return stored;
  return type === 'video' ? 'fill' : 'fit';
}

/**
 * Mirrors the server metadata title (routeLoaders.replications) so the tab
 * and history entries name the item actually shown after a client-side move.
 */
export function viewerDocumentTitle(item: ReplicationViewerItem): string {
  const { title, artist } = item.replication;
  return hasKnownCreator(artist) ? `${title} by ${artist.trim()}` : title;
}
