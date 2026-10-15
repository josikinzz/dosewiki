export type MoleculeDepictionSource = "seeded" | "editor" | "template" | undefined;

export interface TemplateApplicationMember {
  slug: string;
  molblock: string;
  source: MoleculeDepictionSource;
}

interface TemplateApplicationMol {
  generate_aligned_coords(templateMol: TemplateApplicationMol, options: string): string;
  get_molblock(): string;
  get_smiles(): string;
  delete?(): void;
}

export interface TemplateApplicationRdkitModule {
  get_mol(input: string, details?: string): TemplateApplicationMol | null;
}

export type TemplateApplicationOutcome =
  | {
      slug: string;
      outcome: "aligned";
      molblock: string;
      relaxedBonds?: boolean;
    }
  | {
      slug: string;
      outcome: "no-match" | "protected-hand-edit" | "error";
      reason?: string;
    };

const ALIGNMENT_OPTIONS = JSON.stringify({
  acceptFailure: false,
});

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function flattenBondOrders(molblock: string): string {
  const lines = molblock.split(/\r?\n/);
  const countsIndex = lines.findIndex((line) => line.includes("V2000"));
  if (countsIndex === -1) return molblock;
  const atomCount = Number.parseInt(lines[countsIndex]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[countsIndex]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) return molblock;
  const bondStart = countsIndex + 1 + atomCount;
  for (let i = bondStart; i < bondStart + bondCount && i < lines.length; i++) {
    const line = lines[i];
    if (line.length >= 9) {
      lines[i] = `${line.slice(0, 6)}  1${line.slice(9)}`;
    }
  }
  return lines.join("\n");
}

export function restoreBondOrders(
  alignedMolblock: string,
  originalMolblock: string,
): string | null {
  const aligned = alignedMolblock.split(/\r?\n/);
  const original = originalMolblock.split(/\r?\n/);
  const alignedCounts = aligned.findIndex((line) => line.includes("V2000"));
  const originalCounts = original.findIndex((line) => line.includes("V2000"));
  if (alignedCounts === -1 || originalCounts === -1) return null;

  const parseCounts = (line: string | undefined): [number, number] => [
    Number.parseInt(line?.slice(0, 3).trim() ?? "", 10),
    Number.parseInt(line?.slice(3, 6).trim() ?? "", 10),
  ];
  const [alignedAtoms, alignedBonds] = parseCounts(aligned[alignedCounts]);
  const [originalAtoms, originalBonds] = parseCounts(original[originalCounts]);
  if (
    !Number.isFinite(alignedAtoms) ||
    alignedAtoms !== originalAtoms ||
    alignedBonds !== originalBonds
  ) {
    return null;
  }

  const pairKey = (line: string): string => {
    const a = Number.parseInt(line.slice(0, 3).trim(), 10);
    const b = Number.parseInt(line.slice(3, 6).trim(), 10);
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  };
  const orderByPair = new Map<string, string>();
  for (let bond = 0; bond < originalBonds; bond++) {
    const line = original[originalCounts + 1 + originalAtoms + bond];
    if (!line || line.length < 9) return null;
    orderByPair.set(pairKey(line), line.slice(6, 9));
  }
  for (let bond = 0; bond < alignedBonds; bond++) {
    const index = alignedCounts + 1 + alignedAtoms + bond;
    const line = aligned[index];
    if (!line || line.length < 9) return null;
    const order = orderByPair.get(pairKey(line));
    if (order === undefined) return null;
    aligned[index] = `${line.slice(0, 6)}${order}${line.slice(9)}`;
  }
  return aligned.join("\n");
}

function canonicalSmiles(
  rdkit: TemplateApplicationRdkitModule,
  molblock: string,
): string | null {
  let mol: TemplateApplicationMol | null = null;
  try {
    mol = rdkit.get_mol(molblock);
    return mol ? mol.get_smiles() : null;
  } catch {
    return null;
  } finally {
    mol?.delete?.();
  }
}

function parseForMatching(
  rdkit: TemplateApplicationRdkitModule,
  molblock: string,
): TemplateApplicationMol | null {
  try {
    const mol = rdkit.get_mol(molblock);
    if (mol) return mol;
  } catch {
  }
  try {
    return rdkit.get_mol(molblock, JSON.stringify({ sanitize: false }));
  } catch {
    return null;
  }
}

export function buildTemplateApplicationPlan(
  rdkit: TemplateApplicationRdkitModule,
  templateMolblock: string,
  members: readonly TemplateApplicationMember[],
): TemplateApplicationOutcome[] {
  let templateMol: TemplateApplicationMol | null = null;
  let plainTemplateMol: TemplateApplicationMol | null = null;
  let templateError: string | null = null;

  try {
    templateMol = rdkit.get_mol(templateMolblock);
    if (!templateMol) {
      templateError = "Template MOL block could not be parsed.";
    }
  } catch (error) {
    templateError = errorReason(error);
  }
  if (templateMol) {
    plainTemplateMol = parseForMatching(rdkit, flattenBondOrders(templateMolblock));
  }

  const relaxedAlignment = (member: TemplateApplicationMember): TemplateApplicationOutcome => {
    if (!plainTemplateMol) return { slug: member.slug, outcome: "no-match" };
    let plainMemberMol: TemplateApplicationMol | null = null;
    try {
      plainMemberMol = parseForMatching(rdkit, flattenBondOrders(member.molblock));
      if (!plainMemberMol) return { slug: member.slug, outcome: "no-match" };

      const matched = plainMemberMol.generate_aligned_coords(plainTemplateMol, ALIGNMENT_OPTIONS);
      if (!matched) return { slug: member.slug, outcome: "no-match" };

      const merged = restoreBondOrders(plainMemberMol.get_molblock(), member.molblock);
      if (!merged) {
        return {
          slug: member.slug,
          outcome: "error",
          reason: "Relaxed alignment produced a MOL block whose bonds no longer line up.",
        };
      }

      const before = canonicalSmiles(rdkit, member.molblock);
      const after = canonicalSmiles(rdkit, merged);
      if (!before || !after || before !== after) {
        return {
          slug: member.slug,
          outcome: "error",
          reason: "Relaxed alignment would change the depicted molecule; skipped for safety.",
        };
      }

      return { slug: member.slug, outcome: "aligned", molblock: merged, relaxedBonds: true };
    } catch (error) {
      return { slug: member.slug, outcome: "error", reason: errorReason(error) };
    } finally {
      plainMemberMol?.delete?.();
    }
  };

  try {
    return members.map((member) => {
      if (member.source !== "seeded" && member.source !== "template") {
        return { slug: member.slug, outcome: "protected-hand-edit" };
      }
      if (!templateMol) {
        return { slug: member.slug, outcome: "error", reason: templateError ?? "Unknown template error." };
      }

      let memberMol: TemplateApplicationMol | null = null;
      try {
        memberMol = rdkit.get_mol(member.molblock);
        if (!memberMol) {
          return {
            slug: member.slug,
            outcome: "error",
            reason: "Member MOL block could not be parsed.",
          };
        }

        const matchedAtoms = memberMol.generate_aligned_coords(templateMol, ALIGNMENT_OPTIONS);
        if (!matchedAtoms) {
          return relaxedAlignment(member);
        }

        return {
          slug: member.slug,
          outcome: "aligned",
          molblock: memberMol.get_molblock(),
        };
      } catch (error) {
        return { slug: member.slug, outcome: "error", reason: errorReason(error) };
      } finally {
        memberMol?.delete?.();
      }
    });
  } finally {
    templateMol?.delete?.();
    plainTemplateMol?.delete?.();
  }
}
