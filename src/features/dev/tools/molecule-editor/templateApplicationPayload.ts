import type {
  MoleculeDepictionSource,
  TemplateApplicationMember,
} from "./templateApplicationPlan";

/** Shared client/server ceiling for one preview or apply request. */
export const TEMPLATE_APPLY_MEMBER_LIMIT = 50;

export interface ClassTemplateMemberOption {
  slug: string;
  title: string;
}

export interface CurrentTemplateDepiction {
  slug: string;
  molblock: string;
  source: MoleculeDepictionSource;
  /** Bond indices drawn bold — carried so preview thumbnails stay faithful. */
  boldBonds?: number[];
}

export interface MissingTemplateDepiction {
  slug: string;
  title: string;
}

export interface TemplateApplyPreviewRow {
  slug: string;
  title: string;
  beforeSvg: string | null;
  outcome: "aligned" | "no-match" | "protected-hand-edit" | "error";
  reason?: string;
  alignedMolblock?: string;
  afterSvg?: string;
  /** true when only the relaxed (bond-order-blind) template pass matched. */
  relaxedBonds?: boolean;
}

export interface TemplateApplyPayloadMember {
  slug: string;
  molblock: string;
  svg: string;
}

export function chunkTemplateApplyMembers<T>(
  members: readonly T[],
  limit = TEMPLATE_APPLY_MEMBER_LIMIT,
): T[][] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Template apply chunk size must be a positive integer.");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < members.length; index += limit) {
    chunks.push(members.slice(index, index + limit));
  }
  return chunks;
}

/**
 * Join rolled membership to the guarded depiction read without changing order.
 * Missing rows stay explicit so the preview can report every targeted member.
 */
export function mapMembersToTemplatePlanInput(
  members: readonly ClassTemplateMemberOption[],
  depictions: readonly CurrentTemplateDepiction[],
): {
  planMembers: TemplateApplicationMember[];
  missingMembers: MissingTemplateDepiction[];
} {
  const depictionBySlug = new Map(depictions.map((depiction) => [depiction.slug, depiction]));
  const planMembers: TemplateApplicationMember[] = [];
  const missingMembers: MissingTemplateDepiction[] = [];

  for (const member of members) {
    const depiction = depictionBySlug.get(member.slug);
    if (!depiction) {
      missingMembers.push(member);
      continue;
    }
    planMembers.push({
      slug: member.slug,
      molblock: depiction.molblock,
      source: depiction.source,
    });
  }

  return { planMembers, missingMembers };
}

/** Build the confirmed batch while preserving plan-produced MOL blocks exactly. */
export function buildTemplateApplyPayload(
  classKey: string,
  rows: readonly TemplateApplyPreviewRow[],
  includedSlugs: ReadonlySet<string>,
): { classKey: string; members: TemplateApplyPayloadMember[] } {
  return {
    classKey,
    members: rows.flatMap((row) =>
      row.outcome === "aligned" &&
      includedSlugs.has(row.slug) &&
      row.alignedMolblock &&
      row.afterSvg
        ? [{ slug: row.slug, molblock: row.alignedMolblock, svg: row.afterSvg }]
        : [],
    ),
  };
}

export function summarizeTemplatePreview(rows: readonly TemplateApplyPreviewRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.outcome === "aligned") summary.aligned += 1;
      if (row.outcome === "no-match") summary.noMatch += 1;
      if (row.outcome === "protected-hand-edit") summary.protected += 1;
      if (row.outcome === "error") summary.errors += 1;
      return summary;
    },
    { aligned: 0, noMatch: 0, protected: 0, errors: 0 },
  );
}
