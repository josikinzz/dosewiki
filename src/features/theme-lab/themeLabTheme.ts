import type { LabLook } from "./themeLabLook";
import { lookKey } from "./themeLabLook";
import { emptyOverrides, isEmptyOverrides, type PaletteOverrides } from "./themeLabStorage";

export type ThemeLabState = {
  look: LabLook;
  editsByLook: Record<string, PaletteOverrides>;
};

export function activeEdits(state: ThemeLabState): PaletteOverrides {
  return state.editsByLook[lookKey(state.look)] ?? emptyOverrides();
}

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

export function activeEditCount(state: ThemeLabState): number {
  const edits = activeEdits(state);
  return Object.keys(edits.dark).length + Object.keys(edits.light).length;
}

export function userLayerOverrides(state: ThemeLabState): PaletteOverrides {
  return activeEdits(state);
}

export function effectiveOverrides(state: ThemeLabState): PaletteOverrides {
  return activeEdits(state);
}
