/**
 * Plans a class-template depiction application without rendering or persisting it.
 *
 * RDKit mutates the member JSMol when `generate_aligned_coords` succeeds, so each
 * member gets its own short-lived molecule and the aligned MOL block is read only
 * after a successful match. This keeps skipped source molblocks untouched.
 */

export type MoleculeDepictionSource = "seeded" | "editor" | "template" | undefined;

export interface TemplateApplicationMember {
  slug: string;
  molblock: string;
  source: MoleculeDepictionSource;
}

export interface TemplateApplicationMol {
  generate_aligned_coords(templateMol: TemplateApplicationMol, options: string): string;
  get_molblock(): string;
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
  let templateError: string | null = null;

  try {
    templateMol = rdkit.get_mol(templateMolblock);
    if (!templateMol) {
      templateError = "Template MOL block could not be parsed.";
    }
  } catch (error) {
    templateError = errorReason(error);
  }

  try {
    return members.map((member) => {
      if (member.source === "editor") {
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
          return { slug: member.slug, outcome: "no-match" };
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
  }
}
