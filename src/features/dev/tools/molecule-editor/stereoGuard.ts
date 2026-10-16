interface RdkitMolLike { get_svg_with_highlights(details: string): string;
get_inchi(): string;
get_smiles(): string;
get_molblock(): string;
delete?(): void; }
export interface RdkitModuleLike {
  get_mol(input: string, details?: string): RdkitMolLike | null;
}

export interface InchiComparison {
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
