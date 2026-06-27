"use client";

/**
 * Generate an automatic-layout MOL block from a SMILES string, in the browser.
 *
 * On the deployed admin host there are no committed base `.mol` files (that
 * directory is gitignored and built locally by `molecules:generate`), so the
 * editor derives the starting structure the same way the Python pipeline does —
 * `Molecule.fromSmiles(s).inventCoordinates()` — via the OpenChemLib bundle that
 * is already dynamically imported for the canvas editor.
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

/** Returns a MOL block for the SMILES, or null when it is empty / unparseable. */
export async function smilesToMolblock(smiles: string): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const OCL = await loadOcl();
    const mol = OCL.Molecule.fromSmiles(trimmed);
    mol.inventCoordinates();
    return mol.toMolfile();
  } catch {
    return null;
  }
}
