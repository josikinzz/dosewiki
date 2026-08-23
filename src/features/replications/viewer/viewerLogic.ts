import type { ReplicationType } from "@/types/replications";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import { publicHref } from "@/utils/publicHref";
import type { ReplicationViewerItem } from "./viewerModel";

/**
 * Pure URL, media, and document-title decisions kept out of components so
 * each contract can be tested without a DOM.
 */

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

/** Loop GIF-like motion and ordinary videos whose known duration is under one minute. */
export function shouldLoopReplicationMotion(
  format: string,
  duration: number | null | undefined,
): boolean {
  return (
    format.toLowerCase() === "gif" ||
    (Number.isFinite(duration) &&
      duration !== undefined &&
      duration !== null &&
      duration < 60)
  );
}

/**
 * A `?set=` scope the URL opted into. The entry context emits it — an effect
 * article scopes to that effect, a substance showcase to that substance, an
 * artist listing to that artist — and the viewer walks the named set instead
 * of the server default (the work's own effect walk).
 */
export interface ViewerSetParam {
  kind: "effect" | "substance" | "artist";
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
const SET_PARAM_PATTERN =
  /^(effect|substance|artist):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Parse `location.search` for a viewer scope, e.g. `?set=effect:tracers`. */
export function parseViewerSetParam(search: string): ViewerSetParam | null {
  const value = new URLSearchParams(search).get("set");
  if (!value) return null;

  const match = SET_PARAM_PATTERN.exec(value);
  return match
    ? { kind: match[1] as ViewerSetParam["kind"], slug: match[2] }
    : null;
}

/**
 * The canonical path pushed on client-side navigation. The scope param rides
 * along only while a scoped walk is actually live, so a copied URL always
 * reproduces the sequence the copier was moving through — and never claims a
 * scope the viewer silently fell back from.
 */
export function buildViewerPath(
  slug: string,
  setParam: ViewerSetParam | null,
): string {
  const path = publicHref.replication(slug);
  return setParam ? `${path}?set=${setParam.kind}:${setParam.slug}` : path;
}

/**
 * Mirrors the server metadata title (routeLoaders.replications) so the tab
 * and history entries name the item actually shown after a client-side move.
 */
export function viewerDocumentTitle(item: ReplicationViewerItem): string {
  const { title, artist } = item.replication;
  return hasKnownCreator(artist) ? `${title} by ${artist.trim()}` : title;
}
