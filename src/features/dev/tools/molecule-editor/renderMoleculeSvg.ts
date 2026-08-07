/**
 * Brand-styled skeletal SVG renderer on OpenChemLib — the same engine that
 * drives the editing canvas (`OclEditor.tsx`).
 *
 * One engine end to end means the preview, the saved public asset, and the
 * canvas all draw from the same MOL block interpretation: no phantom stereo
 * hydrogens (RDKit's `addChiralHs`), no re-kekulized double bonds, and real
 * `<text>` atom labels (Greek included) instead of baked glyph paths.
 *
 * Pipeline: `Molecule.fromMolfile` (verbatim coords, wedges, and Kekulé
 * pattern) → optional per-atom custom labels → `toSVG` → three pure
 * post-processing passes:
 *   1. `stripEventLayer`  — drop OCL's invisible hit-target elements.
 *   2. `applyBrandColors` — map OCL's fixed CPK colors to the brand palette.
 *   3. `floorViewBox`     — pad tiny molecules so they don't over-zoom.
 */

/** Minimal structural shape of the OpenChemLib objects we use (decouples from the lib). */
export interface OclMoleculeLike {
  getAllAtoms(): number;
  getAllBonds(): number;
  setAtomCustomLabel(atom: number, label: string | null): boolean;
  setBondBold(bond: number, bold: boolean): void;
  toSVG(width: number, height: number, id?: string, options?: object): string;
}
export interface OclModuleLike {
  Molecule: {
    fromMolfile(molfile: string): OclMoleculeLike;
  };
}

// fuchsia-300 — carbon skeleton / bonds / default (render_molecules.py CARBON).
export const CARBON_COLOR = "#f0abfc";

/** violet-400 — class-mode R-group labels, matching the legacy class artwork. */
export const R_LABEL_COLOR = "#c084fc";

/**
 * OpenChemLib hardcodes CPK atom-label colors (AbstractDepictor). Map each
 * emitted `rgb(...)` string to the brand palette from render_molecules.py.
 * Bonds and carbon labels come out `rgb(0,0,0)` and share the carbon color.
 */
export const OCL_COLOR_TO_BRAND: Record<string, string> = {
  "rgb(0,0,0)": CARBON_COLOR, //     C / bonds / custom labels
  "rgb(48,80,248)": "#c4b5fd", //    N  violet-300
  "rgb(255,13,13)": "#fda4af", //    O  rose-300
  "rgb(144,224,80)": "#fbbf24", //   F  amber-400
  "rgb(255,128,0)": "#fbbf24", //    P  amber-400
  "rgb(205,205,38)": "#bef264", //   S  lime-300
  "rgb(31,240,31)": "#6ee7b7", //    Cl emerald-300
  "rgb(166,41,41)": "#fb7185", //    Br rose-400
  "rgb(148,0,148)": "#e879f9", //    I  fuchsia-400
};

export const BOND_LENGTH = 28;
export const FLOOR_MULT = 2.0;
/** viewBox floor so 2–3 atom molecules don't over-zoom (render_molecules.py floor). */
export const VIEWBOX_FLOOR = BOND_LENGTH * FLOOR_MULT; // 56

/** Brand stroke width for standard bonds (render_molecules.py bondLineWidth). */
export const BRAND_STROKE_WIDTH = 1.1;
/** OCL's own standard line width at our pinned 28 px bond length (AVBL × 0.06). */
export const OCL_BASE_STROKE_WIDTH = BOND_LENGTH * 0.06; // 1.68
/** Bold bonds draw as wide as a solid wedge's broad end (AVBL × 2/9). */
export const BOLD_STROKE_WIDTH = (BOND_LENGTH * 2) / 9;

/**
 * Canvas passed to `toSVG`. `inflateToMaxAVBL` (default true) scales the
 * depiction up to `maxAVBL` px per bond but never past the canvas, so the
 * canvas must comfortably exceed any real molecule at 28 px/bond; `autoCrop`
 * then trims the result to a tight viewBox.
 */
const RENDER_CANVAS = 4000;

/**
 * `toSVG` options shared by every brand render. The stroke width is NOT set
 * here: the wrapper's strokeWidth option cannot tell base strokes from bold
 * ones, so `rebaseStrokeWidths` rewrites the (deterministic, maxAVBL-pinned)
 * base width after the fact and leaves bold strokes at wedge width.
 */
export function buildRenderOptions(): Record<string, unknown> {
  return {
    autoCrop: true,
    autoCropMargin: 6,
    maxAVBL: BOND_LENGTH,
    fontWeight: 400,
    suppressChiralText: true,
    suppressESR: true,
    suppressCIPParity: true,
    noStereoProblem: true,
  };
}

/**
 * Thin OCL's standard line width down to the brand width. Only strokes at the
 * engine's base width (±2 %) are rewritten; bold-bond strokes keep their
 * absolute width so they stay exactly as wide as a solid wedge's broad end —
 * wedges are filled polygons a stroke rewrite cannot touch. Deterministic
 * because the render canvas is large enough that `maxAVBL` always pins the
 * drawn bond length to {@link BOND_LENGTH}.
 */
export function rebaseStrokeWidths(
  svg: string,
  base: number = OCL_BASE_STROKE_WIDTH,
  target: number = BRAND_STROKE_WIDTH,
): string {
  return svg.replace(/stroke-width="([^"]+)"/g, (match, value: string) => {
    const width = Number(value);
    return Number.isFinite(width) && Math.abs(width - base) <= base * 0.02
      ? `stroke-width="${target}"`
      : match;
  });
}

/**
 * Remove OpenChemLib's interaction layer: invisible `class="event"` hit
 * elements (per-atom circles, per-bond lines) and the `pointer-events` style
 * rules that exist only to serve them. The visible drawing keeps its scoped
 * `stroke-linecap:round` / `stroke-linejoin:round` rules.
 */
export function stripEventLayer(svg: string): string {
  return svg
    .replace(/[ \t]*<(?:line|circle|rect|polygon)[^>]*class="event"[^>]*\/>\s*\n?/g, "")
    .replace(/#[\w:-]+ \{ pointer-events:none; \}\s*/g, "")
    .replace(/#[\w:-]+ \.event\s+\{ pointer-events:all; \}\s*/g, "");
}

const RGB_RE = /rgb\(\d+,\d+,\d+\)/g;

/**
 * Map OCL's CPK colors to the brand palette. Colors outside the map (exotic
 * elements) fall back to the carbon color, mirroring the old renderer's
 * default palette entry. Class-mode R-group labels — matched by their exact
 * injected text — are recolored to the R-label violet regardless of the
 * element they sit on.
 */
export function applyBrandColors(svg: string, rGroupLabels?: string[]): string {
  let out = svg.replace(RGB_RE, (color) => OCL_COLOR_TO_BRAND[color] ?? CARBON_COLOR);
  if (rGroupLabels && rGroupLabels.length > 0) {
    const labels = new Set(rGroupLabels);
    out = out.replace(
      /(<text[^>]*fill=")([^"]+)("[^>]*>)([^<]+)(<\/text>)/g,
      (full, pre: string, _fill: string, mid: string, content: string, post: string) =>
        labels.has(content) ? `${pre}${R_LABEL_COLOR}${mid}${content}${post}` : full,
    );
  }
  return out;
}

const SVG_DIMS_RE =
  /width="(\d+(?:\.\d+)?)px" height="(\d+(?:\.\d+)?)px" viewBox="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/;

/** Format like Python's `%g`: up to 6 significant digits, trailing zeros stripped. */
function fmtG(n: number): string {
  return parseFloat(n.toPrecision(6)).toString();
}

/**
 * Pad the viewBox of a tight SVG up to `floor` so a tiny molecule (2–3 atoms)
 * does not zoom to fill the whole card with cartoonishly heavy strokes. The
 * padding is centered, and OCL's non-zero autoCrop origin is preserved.
 * Molecules already larger than `floor` in both dimensions are untouched.
 */
export function floorViewBox(svg: string, floor: number = VIEWBOX_FLOOR): string {
  const m = SVG_DIMS_RE.exec(svg);
  if (!m) return svg;
  const [w, h, vx, vy, vw, vh] = m.slice(1).map(Number);
  const tw = Math.max(w, floor);
  const th = Math.max(h, floor);
  if (tw === w && th === h) return svg;
  const nx = vx - (tw - vw) / 2;
  const ny = vy - (th - vh) / 2;
  const replacement =
    `width="${fmtG(tw)}px" height="${fmtG(th)}px" ` +
    `viewBox="${fmtG(nx)} ${fmtG(ny)} ${fmtG(tw)} ${fmtG(th)}"`;
  return svg.slice(0, m.index) + replacement + svg.slice(m.index + m[0].length);
}

/** Stable per-molblock SVG id (FNV-1a) so identical input renders byte-identical output. */
export function svgIdFor(
  molblock: string,
  atomLabels?: Record<number, string>,
  boldBonds?: readonly number[],
): string {
  const input =
    molblock + JSON.stringify(atomLabels ?? {}) + JSON.stringify(boldBonds ?? []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `mol-${(hash >>> 0).toString(16)}`;
}

/**
 * Render a brand-styled skeletal SVG from an explicit MOL block. Returns null
 * when the MOL block can't be parsed into a non-empty molecule.
 */
export function renderMoleculeSvg(
  ocl: OclModuleLike,
  molblock: string,
  /** Class-mode R-group display labels, atom index -> "R2"/"Rα"/"RN". */
  atomLabels?: Record<number, string>,
  /** Bond indices to draw with the bold (thicker) line weight. */
  boldBonds?: readonly number[],
): string | null {
  let mol: OclMoleculeLike;
  try {
    mol = ocl.Molecule.fromMolfile(molblock);
  } catch {
    return null;
  }
  if (mol.getAllAtoms() === 0) return null;
  const labels = atomLabels ? Object.values(atomLabels) : undefined;
  if (atomLabels) {
    for (const [index, label] of Object.entries(atomLabels)) {
      mol.setAtomCustomLabel(Number(index), label);
    }
  }
  if (boldBonds) {
    const bondCount = mol.getAllBonds();
    for (const bond of boldBonds) {
      if (Number.isInteger(bond) && bond >= 0 && bond < bondCount) {
        mol.setBondBold(bond, true);
      }
    }
  }
  let raw: string;
  try {
    raw = mol.toSVG(
      RENDER_CANVAS,
      RENDER_CANVAS,
      svgIdFor(molblock, atomLabels, boldBonds),
      buildRenderOptions(),
    );
  } catch {
    return null;
  }
  return floorViewBox(applyBrandColors(rebaseStrokeWidths(stripEventLayer(raw)), labels));
}
