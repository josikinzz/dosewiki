/**
 * Stereo guardrail for the Molecule Depiction Editor.
 *
 * The editor only changes how a molecule is *drawn* (atom positions, which bond is
 * a wedge/hash). It must never change *which molecule* it is. But moving a wedge can
 * silently invert a stereocenter — turning an R into an S, i.e. a different compound.
 *
 * `compareInchi` re-derives the canonical InChI of both the original (from its SMILES)
 * and the edited depiction (from its MOL block) via RDKit.js, so the UI can warn when
 * an edit crossed from "re-drawing" into "re-chemistry".
 */
/** Minimal structural shape of the RDKit.js objects we use (decouples from the lib). */
interface RdkitMolLike { get_svg_with_highlights(details: string): string;
get_inchi(): string;
get_smiles(): string;
get_molblock(): string;
delete?(): void; }
export interface RdkitModuleLike {
  get_mol(input: string, details?: string): RdkitMolLike | null;
}

export interface InchiComparison {
  /** true only when both parsed and the InChIs are identical. */
  match: boolean;
  inchiOriginal: string;
  inchiEdited: string;
}

function inchiOf(rdkit: RdkitModuleLike, input: string): string {
  const mol = rdkit.get_mol(input);
  if (!mol) return "";
  try {
    return mol.get_inchi() || "";
  } catch {
    return "";
  } finally {
    mol.delete?.();
  }
}

/**
 * Compare the original molecule (by SMILES) against an edited depiction (by MOL block).
 * A depiction-only edit keeps the InChI identical (`match: true`); an edit that altered
 * the stereochemistry yields differing InChIs (`match: false`). Unparseable input yields
 * an empty InChI and `match: false` rather than throwing.
 */
export function compareInchi(
  rdkit: RdkitModuleLike,
  originalSmiles: string,
  editedMolblock: string,
): InchiComparison {
  const inchiOriginal = inchiOf(rdkit, originalSmiles);
  const inchiEdited = inchiOf(rdkit, editedMolblock);
  return {
    match:
      inchiOriginal !== "" &&
      inchiEdited !== "" &&
      inchiOriginal === inchiEdited,
    inchiOriginal,
    inchiEdited,
  };
}

function canonicalSmilesOf(rdkit: RdkitModuleLike, molblock: string): string {
  const mol = rdkit.get_mol(molblock);
  if (!mol) return "";
  try {
    return mol.get_smiles() || "";
  } catch {
    return "";
  } finally {
    mol.delete?.();
  }
}

/**
 * Compare class Markush structures by canonical SMILES. InChI does not support
 * dummy atoms, so class mode uses RDKit's canonical SMILES as the edit guard.
 */
export function compareCanonicalSmiles(
  rdkit: RdkitModuleLike,
  baseMolblock: string,
  editedMolblock: string,
): InchiComparison {
  const inchiOriginal = canonicalSmilesOf(rdkit, baseMolblock);
  const inchiEdited = canonicalSmilesOf(rdkit, editedMolblock);
  return {
    match:
      inchiOriginal !== "" &&
      inchiEdited !== "" &&
      inchiOriginal === inchiEdited,
    inchiOriginal,
    inchiEdited,
  };
}
