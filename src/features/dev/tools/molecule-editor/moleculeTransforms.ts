type OclModule = typeof import("openchemlib");

export type MoleculeMirrorDirection = "left-right" | "up-down";

type CoordinateMolecule = Pick<
  InstanceType<OclModule["Molecule"]>,
  "getAllAtoms" | "getAtomX" | "getAtomY" | "setAtomX" | "setAtomY"
> & Partial<Pick<InstanceType<OclModule["Molecule"]>, "getAllBonds" | "getBondType" | "setBondType">>;

type StereoBondTypes = Pick<OclModule["Molecule"], "cBondTypeDown" | "cBondTypeUp">;

type BondGeometryMolecule = CoordinateMolecule &
  Pick<InstanceType<OclModule["Molecule"]>, "getAllBonds" | "getBondAtom" | "isSelectedBond">;

type BoldBondMolecule = Pick<
  InstanceType<OclModule["Molecule"]>,
  "getAllBonds" | "isBondBold" | "setBondBold"
>;

/** The current bold-bond indices of a molecule, in ascending order. */
export function readBoldBonds(molecule: BoldBondMolecule): number[] {
  const bold: number[] = [];
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    if (molecule.isBondBold(bond)) bold.push(bond);
  }
  return bold;
}

/** Apply a persisted bold-bond index list to a freshly loaded molecule. */
export function applyBoldBonds(
  molecule: BoldBondMolecule,
  boldBonds: readonly number[] | undefined,
): void {
  const wanted = new Set(boldBonds ?? []);
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    molecule.setBondBold(bond, wanted.has(bond));
  }
}

export type MoleculeSnapKind = "bond-vertical" | "straighten";

export type MoleculeSnapOutcome =
  | { kind: MoleculeSnapKind; status: "applied"; degrees: number }
  | { kind: MoleculeSnapKind; status: "already-aligned" }
  | { kind: "bond-vertical"; status: "no-bond-selected" }
  | { kind: "bond-vertical"; status: "multiple-bonds-selected" }
  | { kind: "bond-vertical"; status: "canceled" }
  | { kind: "straighten"; status: "no-bonds" }
  | { kind: MoleculeSnapKind; status: "failed" };

/** Below this rotation the depiction is treated as already aligned (~0.03°). */
const ALIGNED_EPSILON_RADIANS = 0.0005;

/** Bonds on the standard drawing grid sit at multiples of 30°, i.e. π/6. */
const GRID_PERIODS_PER_TURN = 12;

/** Map an angle onto (-π/2, π/2] — vertical is the same line whichever end points up. */
function normalizeHalfTurn(radians: number): number {
  return radians - Math.PI * Math.round(radians / Math.PI);
}

/** Rigidly rotate every atom about the depiction's bounds centre. */
export function rotateMoleculeCoordinates(molecule: CoordinateMolecule, radians: number): boolean {
  const atomCount = molecule.getAllAtoms();
  if (atomCount === 0) return false;

  const coordinates = Array.from({ length: atomCount }, (_, atom) => ({
    atom,
    x: molecule.getAtomX(atom),
    y: molecule.getAtomY(atom),
  }));
  const xs = coordinates.map((coordinate) => coordinate.x);
  const ys = coordinates.map((coordinate) => coordinate.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);

  for (const coordinate of coordinates) {
    const dx = coordinate.x - centerX;
    const dy = coordinate.y - centerY;
    molecule.setAtomX(coordinate.atom, centerX + dx * cos - dy * sin);
    molecule.setAtomY(coordinate.atom, centerY + dx * sin + dy * cos);
  }

  return true;
}

/** How many bonds are currently lasso-selected (a bond counts when both atoms are). */
export function countSelectedBonds(molecule: BondGeometryMolecule): number {
  let count = 0;
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    if (molecule.isSelectedBond(bond)) count += 1;
  }
  return count;
}

function bondAngle(molecule: BondGeometryMolecule, bond: number): number {
  const atom0 = molecule.getBondAtom(0, bond);
  const atom1 = molecule.getBondAtom(1, bond);
  return Math.atan2(
    molecule.getAtomY(atom1) - molecule.getAtomY(atom0),
    molecule.getAtomX(atom1) - molecule.getAtomX(atom0),
  );
}

/**
 * The two one-shot alignment actions, as a pure coordinate transform:
 *
 * - `bond-vertical`: rigidly rotate the whole depiction (by the smaller of the two
 *   possible turns) so the single lasso-selected bond becomes exactly vertical.
 * - `straighten`: rigidly rotate by the circular mean of every bond's deviation from
 *   the 30° drawing grid — the one-click fix for a slightly askew depiction.
 *
 * A rigid rotation cannot invert a stereocentre, so unlike mirroring there is no
 * wedge/hash compensation to apply.
 */
export function applyMoleculeSnap(
  molecule: BondGeometryMolecule,
  kind: MoleculeSnapKind,
): MoleculeSnapOutcome {
  if (kind === "bond-vertical") {
    let selectedBond = -1;
    let count = 0;
    for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
      if (molecule.isSelectedBond(bond)) {
        selectedBond = bond;
        count += 1;
      }
    }
    if (count === 0) return { kind, status: "no-bond-selected" };
    if (count > 1) return { kind, status: "multiple-bonds-selected" };
    return applyBondVertical(molecule, selectedBond);
  }

  const bondCount = molecule.getAllBonds();
  if (bondCount === 0) return { kind, status: "no-bonds" };

  // Circular mean of the deviations: multiplying each angle by 12 collapses the 30°
  // grid onto a full turn, so wraparound (+14° vs −14°) averages correctly.
  let sumSin = 0;
  let sumCos = 0;
  for (let bond = 0; bond < bondCount; bond += 1) {
    const scaled = bondAngle(molecule, bond) * GRID_PERIODS_PER_TURN;
    sumSin += Math.sin(scaled);
    sumCos += Math.cos(scaled);
  }
  const delta = -Math.atan2(sumSin, sumCos) / GRID_PERIODS_PER_TURN;
  if (Math.abs(delta) < ALIGNED_EPSILON_RADIANS) return { kind, status: "already-aligned" };
  rotateMoleculeCoordinates(molecule, delta);
  return { kind, status: "applied", degrees: (delta * 180) / Math.PI };
}

/** Rigidly rotate the whole depiction (by the smaller turn) so one explicit bond is vertical. */
export function applyBondVertical(
  molecule: BondGeometryMolecule,
  bond: number,
): MoleculeSnapOutcome {
  const kind = "bond-vertical" as const;
  if (bond < 0 || bond >= molecule.getAllBonds()) return { kind, status: "failed" };

  const atom0 = molecule.getBondAtom(0, bond);
  const atom1 = molecule.getBondAtom(1, bond);
  const dx = molecule.getAtomX(atom1) - molecule.getAtomX(atom0);
  const dy = molecule.getAtomY(atom1) - molecule.getAtomY(atom0);
  if (Math.hypot(dx, dy) < 1e-9) return { kind, status: "already-aligned" };

  const delta = normalizeHalfTurn(Math.PI / 2 - Math.atan2(dy, dx));
  if (Math.abs(delta) < ALIGNED_EPSILON_RADIANS) return { kind, status: "already-aligned" };
  rotateMoleculeCoordinates(molecule, delta);
  return { kind, status: "applied", degrees: (delta * 180) / Math.PI };
}

/** Reflect a depiction around its own bounds while preserving wedge/hash stereo encoding. */
export function mirrorMoleculeCoordinates(
  molecule: CoordinateMolecule,
  direction: MoleculeMirrorDirection,
  stereoBondTypes?: StereoBondTypes,
): boolean {
  const atomCount = molecule.getAllAtoms();
  if (atomCount === 0) return false;

  const coordinates = Array.from({ length: atomCount }, (_, atom) => ({
    atom,
    x: molecule.getAtomX(atom),
    y: molecule.getAtomY(atom),
  }));
  const horizontal = direction === "left-right";
  const values = coordinates.map((coordinate) => (horizontal ? coordinate.x : coordinate.y));
  const axis = Math.min(...values) + Math.max(...values);

  for (const coordinate of coordinates) {
    if (horizontal) {
      molecule.setAtomX(coordinate.atom, axis - coordinate.x);
    } else {
      molecule.setAtomY(coordinate.atom, axis - coordinate.y);
    }
  }

  if (stereoBondTypes && molecule.getAllBonds && molecule.getBondType && molecule.setBondType) {
    for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
      const type = molecule.getBondType(bond);
      if (type === stereoBondTypes.cBondTypeUp) {
        molecule.setBondType(bond, stereoBondTypes.cBondTypeDown);
      } else if (type === stereoBondTypes.cBondTypeDown) {
        molecule.setBondType(bond, stereoBondTypes.cBondTypeUp);
      }
    }
  }

  return true;
}
