/**
 * The Library's view state as URL search params, so a filtered, grouped
 * Library link opens the same view for whoever follows it.
 *
 * Defaults are left out of the URL: a plain `/dev/replications` is the
 * default view, and only what someone changed shows up in a shared link.
 * Facets repeat their key (`?artist=A&artist=B`) because artist names can
 * hold commas.
 */

import type { StudioGridDensity, StudioGridView } from "./ReplicationGrid";
import {
  EMPTY_STUDIO_FACETS,
  type StudioFacetKind,
  type StudioFacets,
  type StudioGroupBy,
} from "./replicationStudioModel";

export type LibraryViewState = {
  query: string;
  group: StudioGroupBy;
  facets: StudioFacets;
  view: StudioGridView;
  density: StudioGridDensity;
};

export const DEFAULT_LIBRARY_VIEW: LibraryViewState = {
  query: "",
  group: "none",
  facets: EMPTY_STUDIO_FACETS,
  view: "grid",
  density: "comfortable",
};

const FACET_KINDS: readonly StudioFacetKind[] = ["type", "role", "artist", "effect"];
const GROUPS: readonly StudioGroupBy[] = ["none", "effect", "artist", "type"];
const VIEWS: readonly StudioGridView[] = ["grid", "list"];
const DENSITIES: readonly StudioGridDensity[] = ["compact", "comfortable", "large"];

/** Every param this module owns; anything else in the URL is left alone. */
const LIBRARY_PARAMS = ["q", "group", "view", "density", ...FACET_KINDS] as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Reads the Library view from a search string; unknown values fall back to the defaults. */
export function readLibraryView(search: string): LibraryViewState {
  const params = new URLSearchParams(search);
  const facets = { ...EMPTY_STUDIO_FACETS };
  for (const kind of FACET_KINDS) {
    facets[kind] = [...new Set(params.getAll(kind).filter(Boolean))];
  }
  return {
    query: params.get("q") ?? "",
    group: oneOf(params.get("group"), GROUPS, DEFAULT_LIBRARY_VIEW.group),
    facets,
    view: oneOf(params.get("view"), VIEWS, DEFAULT_LIBRARY_VIEW.view),
    density: oneOf(params.get("density"), DENSITIES, DEFAULT_LIBRARY_VIEW.density),
  };
}

/** Writes `state` into `params`, replacing only the Library's own keys. */
export function writeLibraryView(params: URLSearchParams, state: LibraryViewState): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of LIBRARY_PARAMS) next.delete(key);
  if (state.query.trim()) next.set("q", state.query);
  if (state.group !== DEFAULT_LIBRARY_VIEW.group) next.set("group", state.group);
  for (const kind of FACET_KINDS) {
    for (const value of state.facets[kind]) next.append(kind, value);
  }
  if (state.view !== DEFAULT_LIBRARY_VIEW.view) next.set("view", state.view);
  if (state.density !== DEFAULT_LIBRARY_VIEW.density) next.set("density", state.density);
  return next;
}
