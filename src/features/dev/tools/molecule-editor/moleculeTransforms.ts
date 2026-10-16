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

export function readBoldBonds(molecule: BoldBondMolecule): number[] {
  const bold: number[] = [];
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    if (molecule.isBondBold(bond)) bold.push(bond);
  }
  return bold;
}

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

const ALIGNED_EPSILON_RADIANS = 0.0005;

const GRID_PERIODS_PER_TURN = 12;

function normalizeHalfTurn(radians: number): number {
  return radians - Math.PI * Math.round(radians / Math.PI);
}

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
