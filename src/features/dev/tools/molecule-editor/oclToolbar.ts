/**
 * OpenChemLib's editor toolbar is a canvas inside a shadow root: two columns of
 * seventeen square buttons behind one uniform border, painted from a sprite and
 * driven by pointer events, with no API for choosing a tool. dose.wiki's labeled
 * strip chooses a tool by synthesising the same press and release at a button's
 * centre, and reads native toolbar clicks back through the inverse mapping.
 *
 * Button numbers are `GenericEditorToolbar`'s constants: column-major, so button
 * `b` sits in column `b / 17`, row `b % 17`.
 */
const OCL_BUTTONS_PER_COLUMN = 17;

export type OclToolId = "select" | "bond" | "wedge" | "hash" | "atom" | "erase";

export interface OclToolDefinition {
  id: OclToolId;
  label: string;
  /** Plain-language tooltip; the shortcut is appended by the strip. */
  hint: string;
  /** `GenericEditorToolbar` button number. */
  button: number;
  /** The key OpenChemLib itself binds to this tool while the canvas has focus. */
  key: string;
}

export const OCL_TOOLS: readonly OclToolDefinition[] = [
  {
    id: "select",
    label: "Select",
    hint: "Drag an atom, or lasso a group to move it together",
    button: 2,
    key: "Space",
  },
  {
    id: "bond",
    label: "Bond",
    hint: "Draw a bond; click an existing bond to change its order",
    button: 5,
    key: "1",
  },
  {
    id: "wedge",
    label: "Wedge",
    hint: "Solid wedge: the bond points toward the viewer",
    button: 6,
    key: "U",
  },
  {
    id: "hash",
    label: "Hash",
    hint: "Hashed wedge: the bond points away from the viewer",
    button: 23,
    key: "D",
  },
  {
    id: "atom",
    label: "Atom",
    hint: "Type an element symbol or an R label, then click where it goes",
    button: 33,
    key: ".",
  },
  {
    id: "erase",
    label: "Erase",
    hint: "Click an atom or bond to remove it",
    button: 4,
    key: "0",
  },
];

/** `GenericEditorToolbar.cButtonUndo`: an action button, not a tool. */
export const OCL_UNDO_BUTTON = 17;

const TOOL_BY_BUTTON: Record<number, OclToolId> = Object.fromEntries(
  OCL_TOOLS.map((tool) => [tool.button, tool.id]),
);

/**
 * Square button size and border in the toolbar canvas's CSS pixels, from its
 * CSS box alone: the canvas is `2 * border + 2 * size` wide and
 * `2 * border + 17 * size` tall, so the difference is fifteen buttons.
 */
function toolbarMetrics(width: number, height: number) {
  const size = (height - width) / (OCL_BUTTONS_PER_COLUMN - 2);
  const border = (width - 2 * size) / 2;
  return { size, border };
}

/** CSS-pixel centre of a toolbar button, relative to the toolbar canvas. */
export function oclToolbarButtonCentre(
  width: number,
  height: number,
  button: number,
): { x: number; y: number } {
  const { size, border } = toolbarMetrics(width, height);
  const column = Math.floor(button / OCL_BUTTONS_PER_COLUMN);
  const row = button % OCL_BUTTONS_PER_COLUMN;
  return { x: border + size * (column + 0.5), y: border + size * (row + 0.5) };
}

/** The button under a toolbar-canvas CSS-pixel position, or -1 outside the grid. */
export function oclToolbarButtonAt(width: number, height: number, x: number, y: number): number {
  const { size, border } = toolbarMetrics(width, height);
  const localX = x - border;
  const localY = y - border;
  if (
    !(size > 0) ||
    localX < 0 ||
    localX >= 2 * size ||
    localY < 0 ||
    localY >= OCL_BUTTONS_PER_COLUMN * size
  ) {
    return -1;
  }
  return OCL_BUTTONS_PER_COLUMN * Math.floor(localX / size) + Math.floor(localY / size);
}

/** The strip tool a toolbar button selects; `null` for every tool outside the strip. */
export function oclToolForButton(button: number): OclToolId | null {
  return TOOL_BY_BUTTON[button] ?? null;
}

/**
 * Keys OpenChemLib binds to tools outside the strip. Digits and signs are
 * definitive; letters only ever clear the highlight, because OpenChemLib routes
 * a letter to the hovered atom's label before its toolbar sees it, so a letter
 * can never confirm a tool change.
 */
const UNTRUSTED_TOOL_KEYS: Record<string, true> = {
  "2": true, "3": true, "4": true, "5": true, "6": true, "7": true, "-": true, "+": true,
  u: true, d: true, z: true, t: true, m: true, a: true, c: true, n: true, p: true,
  o: true, s: true, f: true, l: true, b: true, i: true,
};

/**
 * What a bare key pressed on the canvas does to the strip's highlight: a strip
 * tool, `null` when the highlight can no longer be trusted (a tool outside the
 * strip, or a letter that may have gone to an atom label instead), `undefined`
 * when OpenChemLib does not change tools for it.
 */
export function oclToolForShortcutKey(key: string): OclToolId | null | undefined {
  switch (key) {
    case " ":
      return "select";
    case "1":
      return "bond";
    case ".":
      return "atom";
    case "0":
      return "erase";
    default:
      return UNTRUSTED_TOOL_KEYS[key] ? null : undefined;
  }
}
