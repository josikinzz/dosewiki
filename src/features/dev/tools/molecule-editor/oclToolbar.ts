const OCL_BUTTONS_PER_COLUMN = 17;

export type OclToolId = "select" | "bond" | "wedge" | "hash" | "atom" | "erase";

export interface OclToolDefinition {
  id: OclToolId;
  label: string;
  hint: string;
  button: number;
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

export const OCL_UNDO_BUTTON = 17;

const TOOL_BY_BUTTON: Record<number, OclToolId> = Object.fromEntries(
  OCL_TOOLS.map((tool) => [tool.button, tool.id]),
);

function toolbarMetrics(width: number, height: number) {
  const size = (height - width) / (OCL_BUTTONS_PER_COLUMN - 2);
  const border = (width - 2 * size) / 2;
  return { size, border };
}

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

export function oclToolForButton(button: number): OclToolId | null {
  return TOOL_BY_BUTTON[button] ?? null;
}

const UNTRUSTED_TOOL_KEYS: Record<string, true> = {
  "2": true, "3": true, "4": true, "5": true, "6": true, "7": true, "-": true, "+": true,
  u: true, d: true, z: true, t: true, m: true, a: true, c: true, n: true, p: true,
  o: true, s: true, f: true, l: true, b: true, i: true,
};

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

export interface OclKeyLegendGroup {
  target: string;
  keys: ReadonlyArray<{ key: string; action: string }>;
}

export const OCL_KEY_LEGEND: readonly OclKeyLegendGroup[] = [
  {
    target: "Over a bond",
    keys: [
      { key: "1 2 3", action: "single, double or triple bond" },
      { key: "u", action: "wedge (toward the viewer)" },
      { key: "d", action: "hash (away from the viewer)" },
      { key: "c", action: "crossed double bond" },
      { key: "m", action: "metal-ligand bond" },
      { key: "4 to 7", action: "fuse a ring of that size" },
      { key: "v", action: "fuse a three-membered ring" },
      { key: "a b", action: "fuse a benzene ring" },
    ],
  },
  {
    target: "Over an atom",
    keys: [
      { key: "letters", action: "type an element symbol, then Enter" },
      { key: "l", action: "chlorine" },
      { key: "+ -", action: "raise or lower the charge" },
      { key: "1 to 9", action: "grow a chain of that many bonds" },
    ],
  },
  {
    target: "Over empty canvas",
    keys: [
      { key: "h", action: "flip left/right" },
      { key: "v", action: "flip up/down" },
      { key: "?", action: "OpenChemLib help" },
    ],
  },
];
