"use client";

import { loadOcl } from "./loadOcl";

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
