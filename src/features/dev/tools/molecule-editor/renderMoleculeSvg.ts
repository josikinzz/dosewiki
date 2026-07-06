/**
 * In-browser TS port of the draw layer of `scripts/chemistry/render_molecules.py`.
 *
 * Given an explicit MOL block (atom coords + wedge/hash bonds authored in the
 * editor), produce the same brand-styled skeletal SVG the Python pipeline emits,
 * by driving RDKit.js (`@rdkit/rdkit`) with the same draw options and applying the
 * same two pure post-processing passes (`roundStrokes`, `floorViewBox`).
 *
 * This renders the LIVE PREVIEW only. The canonical public asset is still produced
 * by Python on `npm run molecules:generate` (which uses a real FreeType font for
 * atom labels — RDKit.js MinimalLib bakes labels as vector glyphs instead, the one
 * known fidelity gap; see molecule-flow.prototype.ts).
 */

/** Minimal structural shape of the RDKit.js objects we use (decouples from the lib). */
export interface RdkitMolLike {
  get_svg_with_highlights(details: string): string;
  get_inchi(): string;
  get_smiles(): string;
  get_molblock(): string;
  delete?(): void;
}
export interface RdkitModuleLike {
  get_mol(input: string, details?: string): RdkitMolLike | null;
}

export type Rgb = [number, number, number];

const hex = (h: string): Rgb => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];

// fuchsia-300 — carbon skeleton / bonds / default (render_molecules.py CARBON).
const CARBON = hex("f0abfc");

/** element atomic-number → RGB (0..1), mirroring render_molecules.py PALETTE. */
export const BRAND_PALETTE: Record<number, Rgb> = {
  [-1]: CARBON, // default
  0: hex("c084fc"), // dummy / pseudo atoms, matching class R-label violet
  1: CARBON, //  H
  6: CARBON, //  C
  7: hex("c4b5fd"), //  N  violet-300
  8: hex("fda4af"), //  O  rose-300
  9: hex("fbbf24"), //  F  amber-400
  15: hex("fbbf24"), // P  amber-400
  16: hex("bef264"), // S  lime-300
  17: hex("6ee7b7"), // Cl emerald-300
  35: hex("fb7185"), // Br rose-400
  53: hex("e879f9"), // I  fuchsia-400
};

export const BOND_LENGTH = 28;
export const FLOOR_MULT = 2.0;
/** viewBox floor so 2–3 atom molecules don't over-zoom (render_molecules.py floor). */
export const VIEWBOX_FLOOR = BOND_LENGTH * FLOOR_MULT; // 56

export interface MoleculeDrawDetails {
  width: number;
  height: number;
  bondLineWidth: number;
  fixedBondLength: number;
  scaleBondWidth: boolean;
  padding: number;
  backgroundColour: [number, number, number, number];
  atomColourPalette: Record<number, Rgb>;
  annotationFontScale: number;
  addStereoAnnotation: boolean;
  /** draw the wedges exactly as stored in the MOL block (do not re-wedge). */
  useMolBlockWedging: boolean;
  /** draw the supplied 2D coords as-is (do not regenerate a layout). */
  prepareMolsBeforeDrawing: boolean;
}

/** Assemble the `get_svg_with_highlights` options matching render_molecules.py. */
export function buildDrawDetails(): MoleculeDrawDetails {
  return {
    width: -1, // tight, flexible canvas — viewBox hugs the molecule
    height: -1,
    bondLineWidth: 1.1,
    fixedBondLength: BOND_LENGTH,
    scaleBondWidth: false,
    padding: 0.06,
    backgroundColour: [1, 1, 1, 0], // transparent (alpha 0)
    atomColourPalette: BRAND_PALETTE,
    annotationFontScale: 0.7,
    addStereoAnnotation: true,
    useMolBlockWedging: true,
    prepareMolsBeforeDrawing: false,
  };
}

/**
 * Soften the skeletal lines: RDKit hardcodes butt caps + miter joins which read as
 * sharp/chonky. Rounding lets bonds meeting at a vertex blend into a soft corner —
 * the modern ChemDraw/PubChem look. Atom labels are filled paths, untouched.
 */
export function roundStrokes(svg: string): string {
  return svg
    .replace(/stroke-linecap:butt/g, "stroke-linecap:round")
    .replace(/stroke-linejoin:miter/g, "stroke-linejoin:round");
}

const SVG_DIMS_RE =
  /width='(\d+(?:\.\d+)?)px'\s+height='(\d+(?:\.\d+)?)px'\s+viewBox='0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)'/;

/** Format like Python's `%g`: up to 6 significant digits, trailing zeros stripped. */
function fmtG(n: number): string {
  return parseFloat(n.toPrecision(6)).toString();
}

/**
 * Pad the viewBox of a tight SVG up to `floor` so a tiny molecule (2–3 atoms) does
 * not zoom to fill the whole card with cartoonishly heavy strokes. Molecules already
 * larger than `floor` in both dimensions are returned untouched.
 */
export function floorViewBox(svg: string, floor: number = VIEWBOX_FLOOR): string {
  const m = SVG_DIMS_RE.exec(svg);
  if (!m) return svg;
  const [w, h, vw, vh] = m.slice(1).map(Number);
  const tw = Math.max(w, floor);
  const th = Math.max(h, floor);
  if (tw === w && th === h) return svg;
  const ox = (tw - vw) / 2;
  const oy = (th - vh) / 2;
  const replacement =
    `width='${fmtG(tw)}px' height='${fmtG(th)}px' ` +
    `viewBox='${fmtG(-ox)} ${fmtG(-oy)} ${fmtG(tw)} ${fmtG(th)}'`;
  return svg.slice(0, m.index) + replacement + svg.slice(m.index + m[0].length);
}

/**
 * Render a brand-styled skeletal SVG from an explicit MOL block. Returns null when
 * the MOL block can't be parsed. Caller owns nothing — the JSMol is freed here.
 */
export function renderMoleculeSvg(
  rdkit: RdkitModuleLike,
  molblock: string,
  /** Class-mode R-group display labels, atom index -> "R2"/"Ra"/"RN". */
  atomLabels?: Record<number, string>,
): string | null {
  const mol = rdkit.get_mol(molblock, JSON.stringify({ removeHs: false }));
  if (!mol) return null;
  try {
    const details: Record<string, unknown> = { ...buildDrawDetails() };
    if (atomLabels && Object.keys(atomLabels).length > 0) {
      details.atomLabels = atomLabels;
    }
    const raw = mol.get_svg_with_highlights(JSON.stringify(details));
    return floorViewBox(roundStrokes(raw));
  } finally {
    mol.delete?.();
  }
}
