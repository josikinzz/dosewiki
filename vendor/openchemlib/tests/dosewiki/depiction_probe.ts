import { Molecule } from '#lib';

/**
 * Shared fixture for the DoseWiki depiction tests. Every geometry assertion is
 * expressed relative to this bond length so the expected numbers can be read
 * straight off the AbstractDepictor factors.
 */
export const AVBL = 300;

export interface Point {
  x: number;
  y: number;
}

export interface Line {
  from: Point;
  to: Point;
  strokeWidth: number;
}

/**
 * A central carbon with three axis-aligned bonds of length 1.5 (molecule
 * units): bond `up` is a solid wedge towards +x, bond `down` a hashed wedge
 * towards -x, bond `plain` a single bond towards +y. Carbons carry no label,
 * so the depictor draws every bond from atom centre to atom centre.
 */
export function buildStereoProbe() {
  const molecule = new Molecule(0, 0);
  const center = molecule.addAtom(6);
  const right = molecule.addAtom(6);
  const left = molecule.addAtom(6);
  const below = molecule.addAtom(6);
  const coordinates: Array<[number, number, number]> = [
    [center, 0, 0],
    [right, 1.5, 0],
    [left, -1.5, 0],
    [below, 0, 1.5],
  ];
  for (const [atom, x, y] of coordinates) {
    molecule.setAtomX(atom, x);
    molecule.setAtomY(atom, y);
  }
  const up = molecule.addBond(center, right);
  const down = molecule.addBond(center, left);
  const plain = molecule.addBond(center, below);
  molecule.setBondType(up, Molecule.cBondTypeUp);
  molecule.setBondType(down, Molecule.cBondTypeDown);
  return { molecule, up, down, plain };
}

/** Renders on a canvas large enough that `maxAVBL` pins the bond length to {@link AVBL}. */
export function depict(molecule: Molecule, id = 'probe', options = {}) {
  return molecule.toSVG(1000, 1000, id, { maxAVBL: AVBL, ...options });
}

function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  if (!match) throw new Error(`Missing ${name} in ${tag}`);
  return match[1];
}

function parseLine(tag: string): Line {
  return {
    from: { x: Number(attribute(tag, 'x1')), y: Number(attribute(tag, 'y1')) },
    to: { x: Number(attribute(tag, 'x2')), y: Number(attribute(tag, 'y2')) },
    strokeWidth: Number(attribute(tag, 'stroke-width')),
  };
}

/** Drawn bond strokes: every `<line>` that is not an invisible hit target. */
export function visibleLines(svg: string): Line[] {
  return [...svg.matchAll(/<line [^>]*\/>/g)]
    .map((match) => match[0])
    .filter((tag) => !tag.includes('class="event"'))
    .map(parseLine);
}

/** The invisible hit-target line the depictor emits for a bond, in SVG pixels. */
export function bondSegment(svg: string, id: string, bond: number): Line {
  const tag = svg.match(new RegExp(`<line id="${id}:Bond:${bond}" [^>]*/>`));
  if (!tag) throw new Error(`No hit target for bond ${bond}`);
  return parseLine(tag[0]);
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Signed perpendicular distance of `point` from the infinite line through `segment`. */
export function offsetFromAxis(segment: Line, point: Point) {
  const length = distance(segment.from, segment.to);
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  return (dx * (point.y - segment.from.y) - dy * (point.x - segment.from.x)) / length;
}

function projection(segment: Line, point: Point) {
  const length = distance(segment.from, segment.to);
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  return (dx * (point.x - segment.from.x) + dy * (point.y - segment.from.y)) / length;
}

function onSegment(segment: Line, point: Point, tolerance: number) {
  const along = projection(segment, point);
  return (
    Math.abs(offsetFromAxis(segment, point)) <= tolerance &&
    along >= -tolerance &&
    along <= distance(segment.from, segment.to) + tolerance
  );
}

/** Visible strokes drawn along a bond (single bonds may be split per atom colour). */
export function strokesAlongBond(svg: string, id: string, bond: number): Line[] {
  const segment = bondSegment(svg, id, bond);
  return visibleLines(svg).filter(
    (line) => onSegment(segment, line.from, 0.5) && onSegment(segment, line.to, 0.5),
  );
}

/** Visible strokes crossing a bond perpendicularly, i.e. the hashes of a down wedge. */
export function hashesAcrossBond(svg: string, id: string, bond: number): Line[] {
  const segment = bondSegment(svg, id, bond);
  return visibleLines(svg).filter((line) => {
    const midpoint = {
      x: (line.from.x + line.to.x) / 2,
      y: (line.from.y + line.to.y) / 2,
    };
    return (
      onSegment(segment, midpoint, 0.5) &&
      Math.abs(offsetFromAxis(segment, line.from)) > 0.5
    );
  });
}

/** Every point of every `<polygon>` in the SVG. */
export function polygonPoints(svg: string): Point[] {
  return [...svg.matchAll(/<polygon points="([^"]*)"/g)].flatMap((match) =>
    match[1]
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number);
        return { x, y };
      }),
  );
}

export function strokeWidths(svg: string): number[] {
  return [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((match) =>
    Number(match[1]),
  );
}
