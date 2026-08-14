"use client";

/**
 * Generate an automatic-layout MOL block from a SMILES string, in the browser.
 *
 * There are no committed base `.mol` files (the static substance pipeline is
 * retired), so the editor derives the starting structure itself —
 * `Molecule.fromSmiles(s).inventCoordinates()` — via the OpenChemLib bundle that
 * is already dynamically imported for the canvas editor.
 */
import { loadOcl } from "./loadOcl";

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
