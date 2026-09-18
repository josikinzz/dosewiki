/**
 * Remove Markush/R-group dummy atoms from a MOL block without inventing a new
 * layout. OpenChemLib represents the `R`, `*`, and `?` spellings used by the
 * class-structure pipeline as atomic number 0.
 */
type OclModule = typeof import("openchemlib");

let oclPromise: Promise<OclModule> | null = null;

function loadOcl(): Promise<OclModule> {
  if (!oclPromise) {
    oclPromise = import("openchemlib").then((mod) =>
      "Molecule" in mod ? (mod as OclModule) : (mod as { default: OclModule }).default,
    );
  }
  return oclPromise;
}

/**
 * Deletes atomic-number-zero pseudoatoms and their attached bonds. The OCL
 * deletion API retains the original coordinates of all surviving atoms.
 * Invalid or dummy-free input is left untouched.
 */
export async function stripDummyAtoms(molblock: string): Promise<string> {
  if (!molblock.trim()) return molblock;

  try {
    const OCL = await loadOcl();
    const molecule = OCL.Molecule.fromMolfile(molblock);
    const dummyAtoms = Array.from(
      { length: molecule.getAllAtoms() },
      (_, atom) => atom,
    ).filter((atom) => molecule.getAtomicNo(atom) === 0);

    if (dummyAtoms.length === 0) return molblock;

    molecule.deleteAtoms(dummyAtoms);
    return molecule.toMolfile();
  } catch {
    return molblock;
  }
}
