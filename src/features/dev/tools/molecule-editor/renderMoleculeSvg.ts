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
interface OclMoleculeLike { getAllAtoms(): number;
getAllBonds(): number;
setAtomCustomLabel(atom: number, label: string | null): boolean;
setBondBold(bond: number, bold: boolean): void;
toSVG(width: number, height: number, id?: string, options?: object): string; }
export interface OclModuleLike {
  Molecule: {
    fromMolfile(molfile: string): OclMoleculeLike;
  };
}

// fuchsia-300 — carbon skeleton / bonds / default (retired Python renderer's CARBON).
export const CARBON_COLOR = "#f0abfc";

/** violet-400 — class-mode R-group labels, matching the legacy class artwork. */
export const R_LABEL_COLOR = "#c084fc";

/**
 * OpenChemLib hardcodes CPK atom-label colors (AbstractDepictor). Map each
 * emitted `rgb(...)` string to the brand palette decoded from the retired
 * Python renderer. Bonds and carbon labels come out `rgb(0,0,0)` and share
 * the carbon color.
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

/**
 * The same OCL CPK keys mapped to the RDKit standard textbook palette (black
 * skeleton, blue N, red O — the `--palette standard` block in
 * moleculePalette.ts). Used by the download-pack builder's standard colourway.
 */
export const OCL_COLOR_TO_STANDARD: Record<string, string> = {
  "rgb(0,0,0)": "#000000", //        C / bonds / custom labels
  "rgb(48,80,248)": "#0000ff", //    N
  "rgb(255,13,13)": "#ff0000", //    O
  "rgb(144,224,80)": "#33cccc", //   F
  "rgb(255,128,0)": "#ff7f00", //    P
  "rgb(205,205,38)": "#cccc00", //   S
  "rgb(31,240,31)": "#00cc00", //    Cl
  "rgb(166,41,41)": "#7f4c19", //    Br
  "rgb(148,0,148)": "#a01eef", //    I
};

const BOND_LENGTH = 28
const FLOOR_MULT = 2.0
/** viewBox floor so 2–3 atom molecules don't over-zoom (retired Python renderer's floor). */
export const VIEWBOX_FLOOR = BOND_LENGTH * FLOOR_MULT; // 56

/** Brand stroke width for standard bonds (retired Python renderer's bondLineWidth). */
const BRAND_STROKE_WIDTH = 1.1
/** OCL's own standard line width at our pinned 28 px bond length (AVBL × 0.06). */
export const OCL_BASE_STROKE_WIDTH = BOND_LENGTH * 0.06; // 1.68

// Bold-bond ribbon spec, tuned by Lyrea on the slider tool (revised 7 Aug 2026):
/** Bold body width in px at the 28 px bond length (~3 × the brand line). */
export const BOLD_BODY_WIDTH = 3.25;
/** See-through halo where a bold line crosses another bond; wedges cast none. */
export const BOLD_CROSSING_GAP = 3.3;
/** Hairline edge shared by every ribbon piece so joints render as one shape. */
export const RIBBON_HAIRLINE = 0.5;
/** Free bold ends are rounded: every non-joint endpoint carries a join disc. */
const BOLD_ROUNDED_ENDS = true

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
 * Map OCL's CPK colors to a display palette (brand by default). Colors outside
 * the map (exotic elements) fall back to the map's carbon/bond entry
 * (`rgb(0,0,0)`), mirroring the old renderer's default palette entry.
 * Class-mode R-group labels — matched by their exact injected text — are
 * recolored to the R-label violet regardless of the element they sit on.
 */
export function applyBrandColors(
  svg: string,
  rGroupLabels?: string[],
  colorMap: Record<string, string> = OCL_COLOR_TO_BRAND,
): string {
  let out = svg.replace(RGB_RE, (color) => colorMap[color] ?? colorMap["rgb(0,0,0)"]);
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

type Point = [number, number];

/** Drawn (device-space) endpoints of every bond, read from the event hit layer. */
function parseEventBondGeometry(svg: string): Map<number, [Point, Point]> { const map = new Map<number, [Point, Point]>();
const re =
  /<line id="[^"]*:Bond:(\d+)" class="event" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g;
for (const m of svg.matchAll(re)) {
  map.set(Number(m[1]), [
    [Number(m[2]), Number(m[3])],
    [Number(m[4]), Number(m[5])],
  ]);
}
return map; }

/**
 * Thin the engine's fat rounded outline on wedge polygons to the ribbon
 * hairline. The stroke otherwise bulges past the wedge's geometric corners,
 * which both widens the wedge beyond its tuned size and breaks the shared-edge
 * joint with bold bonds.
 */
export function thinWedgeOutlines(svg: string): string {
  return svg.replace(/(<polygon [^>]*?stroke-width=")([^"]+)("[^>]*\/>)/g, (m, pre, w, post) => {
    const width = Number(w);
    return Math.abs(width - OCL_BASE_STROKE_WIDTH) <= OCL_BASE_STROKE_WIDTH * 0.05
      ? `${pre}${RIBBON_HAIRLINE}${post}`
      : m;
  });
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Draw the bold-bond ribbon per the tuned spec: each bold bond becomes a
 * filled trapezoid at {@link BOLD_BODY_WIDTH}; an end that butts a solid
 * wedge's broad end takes the wedge's own two drawn corners (one connected
 * shape); bold-to-bold elbows get a join disc; free ends are squared off.
 * Every plain line then renders through a mask that opens a
 * {@link BOLD_CROSSING_GAP} halo around the ribbon — a genuinely transparent
 * gap wherever a bold line crosses another bond. Wedges cast no gap and are
 * never cut. Runs on the raw SVG (event layer still present) and leaves the
 * event layer for `stripEventLayer`.
 */
function applyBoldRibbon(
  svg: string,
  boldBonds: readonly number[],
  maskId: string,
): string {
  if (boldBonds.length === 0) return svg;
  const eventGeometry = parseEventBondGeometry(svg);

  // Visible (label-clipped) geometry per bold bond: the plain line lying on
  // that bond's event segment. Collinearity within a small band, endpoints
  // inside the segment span; the longest candidate wins.
  const lineRe = /[ \t]*<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*\/>\n?/g;
  const visible = [...svg.matchAll(lineRe)].map((m) => ({
    text: m[0],
    p1: [Number(m[1]), Number(m[2])] as Point,
    p2: [Number(m[3]), Number(m[4])] as Point,
  }));
  interface BoldPiece {
    p1: Point;
    p2: Point;
    joint1: [Point, Point] | null;
    joint2: [Point, Point] | null;
    e1: Point;
    e2: Point;
  }
  const pieces: BoldPiece[] = [];
  const removed = new Set<string>();
  for (const bond of boldBonds) {
    const ev = eventGeometry.get(bond);
    if (!ev) continue;
    const [a, b] = ev;
    const len = dist(a, b);
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let best: { text: string; p1: Point; p2: Point; span: number } | null = null;
    for (const line of visible) {
      if (removed.has(line.text)) continue;
      const offAxis = (p: Point) =>
        Math.abs((p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]);
      const along = (p: Point) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
      if (offAxis(line.p1) > 1 || offAxis(line.p2) > 1) continue;
      const t1 = along(line.p1);
      const t2 = along(line.p2);
      if (Math.min(t1, t2) < -1 || Math.max(t1, t2) > len + 1) continue;
      const span = Math.abs(t2 - t1);
      if (!best || span > best.span) best = { text: line.text, p1: line.p1, p2: line.p2, span };
    }
    if (!best) continue;
    removed.add(best.text);
    pieces.push({ p1: best.p1, p2: best.p2, joint1: null, joint2: null, e1: a, e2: b });
  }
  if (pieces.length === 0) return svg;
  for (const text of removed) svg = svg.replace(text, "");

  // Wedges: consecutive (triangle, quad) polygon pairs; a wedge whose drawn
  // broad end sits at a bold endpoint donates its corners to that end.
  const polyRe = /<polygon points="([^"]+)"[^>]*\/>/g;
  const polys = [...svg.matchAll(polyRe)].map((m) =>
    m[1]
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number) as Point),
  );
  for (let i = 0; i + 1 < polys.length; i += 2) {
    const quad = polys[i + 1];
    if (polys[i].length !== 3 || quad.length !== 4) continue;
    const corners: [Point, Point] = [quad[2], quad[3]];
    const mid: Point = [(quad[2][0] + quad[3][0]) / 2, (quad[2][1] + quad[3][1]) / 2];
    for (const piece of pieces) {
      if (dist(mid, piece.e1) < 3) piece.joint1 = corners;
      else if (dist(mid, piece.e2) < 3) piece.joint2 = corners;
    }
  }

  // Ribbon shapes. Colors stay in OCL's rgb() vocabulary so the brand pass
  // recolors them exactly like every other bond.
  const half = BOLD_BODY_WIDTH / 2;
  const shapeAttrs = `fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="${RIBBON_HAIRLINE}" stroke-linejoin="round"`;
  const shapes: string[] = [];
  const fmt = (n: number) => n.toFixed(2);
  for (const piece of pieces) {
    const dx = piece.p2[0] - piece.p1[0];
    const dy = piece.p2[1] - piece.p1[1];
    const len = Math.hypot(dx, dy);
    const n: Point = [-dy / len, dx / len];
    const side = (corners: [Point, Point], at: Point): [Point, Point] => {
      const d0 = (corners[0][0] - at[0]) * n[0] + (corners[0][1] - at[1]) * n[1];
      return d0 >= 0 ? corners : [corners[1], corners[0]];
    };
    let c1: [Point, Point] = [
      [piece.p1[0] + n[0] * half, piece.p1[1] + n[1] * half],
      [piece.p1[0] - n[0] * half, piece.p1[1] - n[1] * half],
    ];
    let c2: [Point, Point] = [
      [piece.p2[0] + n[0] * half, piece.p2[1] + n[1] * half],
      [piece.p2[0] - n[0] * half, piece.p2[1] - n[1] * half],
    ];
    if (piece.joint1) c1 = side(piece.joint1, piece.p1);
    if (piece.joint2) c2 = side(piece.joint2, piece.p2);
    const pts = [c1[0], c2[0], c2[1], c1[1]].map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(" ");
    shapes.push(`<polygon points="${pts}" ${shapeAttrs}/>`);
  }
  // Join discs: always where two bold bonds share an endpoint; with rounded
  // ends, every non-joint endpoint gets one. Joint (wedge-flush) ends never do.
  const discAt: Point[] = [];
  const wantDisc = (end: Point, shared: boolean) =>
    (shared || BOLD_ROUNDED_ENDS) && !discAt.some((p) => dist(p, end) < 0.5);
  const endpoints: Point[] = [];
  for (const piece of pieces) {
    const ends: Array<[Point, boolean]> = [
      [piece.e1, piece.joint1 !== null],
      [piece.e2, piece.joint2 !== null],
    ];
    for (const [end, isJoint] of ends) {
      if (isJoint) continue;
      const shared = endpoints.some((p) => dist(p, end) < 0.5);
      if (wantDisc(end, shared)) {
        discAt.push(end);
        // The disc caps the VISIBLE (label-clipped) end of this piece, which
        // is whichever drawn endpoint sits nearest this bond end.
        const at = dist(piece.p1, end) <= dist(piece.p2, end) ? piece.p1 : piece.p2;
        shapes.push(
          `<circle cx="${fmt(at[0])}" cy="${fmt(at[1])}" r="${fmt(half)}" ${shapeAttrs}/>`,
        );
      }
      endpoints.push(end);
    }
  }

  // Crossing-gap mask over every plain line: white field, black halo-stroked
  // ribbon copies. Only lines are masked — wedges are never cut.
  const dims = SVG_DIMS_RE.exec(svg);
  const [, , , vx, vy, vw, vh] = dims ? dims.map(Number) : [0, 0, 0, 0, 0, 0, 0];
  const haloAttrs = `fill="black" stroke="black" stroke-width="${(BOLD_CROSSING_GAP * 2).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`;
  const maskShapes = shapes
    .map((shape) =>
      shape
        .replace(/fill="[^"]*" stroke="[^"]*" stroke-width="[^"]*" stroke-linejoin="round"/, haloAttrs),
    )
    .join("");
  const defs =
    `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="${fmt(vx)}" y="${fmt(vy)}" width="${fmt(vw)}" height="${fmt(vh)}">` +
    `<rect x="${fmt(vx)}" y="${fmt(vy)}" width="${fmt(vw)}" height="${fmt(vh)}" fill="white"/>` +
    maskShapes +
    `</mask></defs>`;

  // Wrap the remaining plain lines in the masked group, preserving z-order,
  // and paint the ribbon after everything else.
  const remaining = [...svg.matchAll(lineRe)].map((m) => m[0]);
  const first = svg.indexOf(remaining[0] ?? "</svg>");
  for (const text of remaining) svg = svg.replace(text, "");
  const group = `<g mask="url(#${maskId})">\n${remaining.join("")}</g>\n`;
  svg = svg.slice(0, first) + defs + group + svg.slice(first);
  return svg.replace("</svg>", `${shapes.join("\n")}\n</svg>`);
}

/** Stable per-molblock SVG id (FNV-1a) so identical input renders byte-identical output. */
export function svgIdFor(
  molblock: string,
  atomLabels?: Record<number, string>,
  boldBonds?: readonly number[],
): string {
  // An empty bold list contributes nothing, so bold-free renders keep the ids
  // (and therefore the exact bytes) of renders made before bold bonds existed.
  const input =
    molblock +
    JSON.stringify(atomLabels ?? {}) +
    (boldBonds && boldBonds.length > 0 ? JSON.stringify(boldBonds) : "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `mol-${(hash >>> 0).toString(16)}`;
}

/**
 * Render a skeletal SVG from an explicit MOL block, brand-styled by default.
 * Returns null when the MOL block can't be parsed into a non-empty molecule.
 */
export function renderMoleculeSvg(
  ocl: OclModuleLike,
  molblock: string,
  /** Class-mode R-group display labels, atom index -> "R2"/"Rα"/"RN". */
  atomLabels?: Record<number, string>,
  /** Bond indices to draw with the bold (thicker) line weight. */
  boldBonds?: readonly number[],
  /** OCL `rgb(...)` -> display hex; defaults to the brand palette. */
  colorMap: Record<string, string> = OCL_COLOR_TO_BRAND,
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
  // Bold is NOT drawn by the engine here: the molecule renders plain and the
  // ribbon (tapered joints, join discs, crossing-gap mask) is composed in the
  // post-processing passes below, where the halo can be genuinely transparent.
  const bondCount = mol.getAllBonds();
  const bold = (boldBonds ?? []).filter(
    (bond) => Number.isInteger(bond) && bond >= 0 && bond < bondCount,
  );
  const id = svgIdFor(molblock, atomLabels, boldBonds);
  let raw: string;
  try {
    raw = mol.toSVG(RENDER_CANVAS, RENDER_CANVAS, id, buildRenderOptions());
  } catch {
    return null;
  }
  let out = applyBoldRibbon(raw, bold, `${id}-halo`);
  out = stripEventLayer(out);
  out = thinWedgeOutlines(out);
  out = rebaseStrokeWidths(out);
  out = applyBrandColors(out, labels, colorMap);
  return floorViewBox(out);
}
