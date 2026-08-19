import type { LabLook } from "./themeLabLook";
import { lookKey } from "./themeLabLook";
import { emptyOverrides, isEmptyOverrides, type PaletteOverrides } from "./themeLabStorage";

/**
 * Derivation helpers for the lab's theme state: which look is active, and which
 * of the visitor's edit maps that selects.
 *
 * Pure functions over a plain state object, kept out of both the store and the
 * runtime so the same derivations serve the panel, the persistence path and the
 * DOM application path without any of them owning the rules.
 */

/** The persisted half of the lab's state — everything except storage health.
 *  Which look is worn comes from the appearance context, not from storage. */
export type ThemeLabState = {
  look: LabLook;
  editsByLook: Record<string, PaletteOverrides>;
};

/** The active look's own edit map (never shared with any other look). */
export function activeEdits(state: ThemeLabState): PaletteOverrides {
  return state.editsByLook[lookKey(state.look)] ?? emptyOverrides();
}

/** Replace the active look's edit map, pruning it away when it empties out. */
export function withActiveEdits(
  state: ThemeLabState,
  next: PaletteOverrides,
): Record<string, PaletteOverrides> {
  const key = lookKey(state.look);
  const result = { ...state.editsByLook };
  if (isEmptyOverrides(next)) delete result[key];
  else result[key] = next;
  return result;
}

/** How many tokens the visitor has changed on the active look — the panel's
 *  "changed" indicator, scoped to the look they are on. */
export function activeEditCount(state: ThemeLabState): number {
  const edits = activeEdits(state);
  return Object.keys(edits.dark).length + Object.keys(edits.light).length;
}

/**
 * The layer the lab injects into the document.
 *
 * There is no JS-side base layer any more. The look underneath the visitor's
 * edits is whatever the surface, accent, visual-style and colour-scheme
 * stylesheets resolve to — CSS the browser already has before any of this code
 * runs — so the only thing left for the lab to inject is the edits themselves.
 */
export function userLayerOverrides(state: ThemeLabState): PaletteOverrides {
  return activeEdits(state);
}

/**
 * What actually renders on top of the stylesheets.
 *
 * Identical to {@link userLayerOverrides} for the same reason: with the base
 * layer living entirely in CSS, "what we inject" and "what the visitor changed"
 * are the same set of declarations. Both names are kept because the callers mean
 * different things — the runtime injects the *user layer*, while the font-face
 * and blur derivations ask what the page *effectively* renders — and a future
 * layer would land in exactly one of them.
 */
export function effectiveOverrides(state: ThemeLabState): PaletteOverrides {
  return activeEdits(state);
}
