/**
 * Plans a class-template depiction application without rendering or persisting it.
 *
 * RDKit mutates the member JSMol when `generate_aligned_coords` succeeds, so each
 * member gets its own short-lived molecule and the aligned MOL block is read only
 * after a successful match. This keeps skipped source molblocks untouched.
 *
 * Matching runs in two passes:
 *   1. strict — the template must match atoms AND bond orders exactly;
 *   2. relaxed — bond orders on both sides are flattened to single so the ring
 *      framework alone decides the match (a codeine Δ7,8 double bond no longer
 *      breaks a plain morphinan template). The member's real bond orders are
 *      then restored into the aligned output, and a canonical-SMILES comparison
 *      guarantees the relaxation changed the drawing only, never the molecule.
 */

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
      /** true when only the relaxed (bond-order-blind) pass matched. */
      relaxedBonds?: boolean;
    }
  | {
      slug: string;
      outcome: "no-match" | "protected-hand-edit" | "error";
      reason?: string;
    };

const ALIGNMENT_OPTIONS = JSON.stringify({
  // An unmatched template is reported by RDKit as an empty match string. Keeping
  // this false is essential: it must not quietly produce an unrelated layout.
  acceptFailure: false,
});

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rewrite every V2000 bond to order 1, keeping atoms, coordinates, wedge flags,
 * and properties untouched. The flattened copy exists only for topology-level
 * substructure matching; it is never rendered or persisted.
 */
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

/**
 * Restore the original bond orders into an aligned, bond-flattened MOL block.
 *
 * The aligned block carries the new coordinates AND freshly derived wedge
 * flags (RDKit re-wedges on write, so stereo stays consistent with the new
 * layout); only its bond orders are the flattened 1s. Each order is looked up
 * from the original block by unordered atom pair, so the two blocks may list
 * bonds in different orders or directions. Returns null when the bond sets
 * don't line up.
 */
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

/** Canonical SMILES of a MOL block, or null when it cannot be parsed. */
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

/** Parse leniently: sanitized first, then with sanitization off (flattened
 * copies of hypervalent groups can fail valence checks). */
function parseForMatching(
  rdkit: TemplateApplicationRdkitModule,
  molblock: string,
): TemplateApplicationMol | null {
  try {
    const mol = rdkit.get_mol(molblock);
    if (mol) return mol;
  } catch {
    // fall through to the unsanitized attempt
  }
  try {
    return rdkit.get_mol(molblock, JSON.stringify({ sanitize: false }));
  } catch {
    return null;
  }
}

/**
 * Align eligible member depictions to a template scaffold.
 *
 * An empty `generate_aligned_coords` return is RDKit.js's no-match signal when
 * `acceptFailure` is false. Throws and unparseable MOL blocks are surfaced as
 * errors per member; neither can leak a partially aligned depiction.
 */
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

  /** Relaxed retry after a strict no-match; returns a final outcome. */
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

      // The relaxation may only move the drawing. If re-deriving the molecule
      // from the merged depiction changes its canonical SMILES (e.g. a wedge
      // now reads as the other enantiomer), refuse the alignment.
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
      // Only rows explicitly marked as machine-produced may be re-laid-out.
      // Hand edits are "editor"; rows predating the source marker have unknown
      // provenance (e.g. pre-unification editor saves) and are protected too.
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
