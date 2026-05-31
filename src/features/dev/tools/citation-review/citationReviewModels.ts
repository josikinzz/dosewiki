import type { SubstanceArticle } from "@/schema";
import { buildEditorReferenceDiagnostics } from "@/lib/citations/editorReferenceDiagnostics";

export type CitationEvidenceStatus =
  | "supported"
  | "needs_source"
  | "needs_review"
  | "approved"
  | "rejected";

export type CitationEvidenceSeverity = "blocking" | "non_blocking";

export type CitationEvidenceSupport = {
  sourceId: string;
  sourceName: string;
  referenceId: string;
  sourceType?: string | null;
  quality?: string | null;
  supportingQuote: string;
  rationale: string;
  verifiedQuote: {
    sourceId: string;
    matchType: "exact" | "normalized_whitespace";
    startOffset: number | null;
    endOffset: number | null;
  };
};

export type CitationEvidenceDiagnostic = {
  code: string;
  message: string;
  severity: "error" | "warning";
  claimKey?: string | null;
};

export type CitationEvidenceRow = {
  _id?: string;
  slug: string;
  articleId?: number | null;
  section: string;
  claimKey: string;
  claimText?: string;
  fieldPath?: string;
  referenceIds: string[];
  sourceName?: string;
  sourceType?: string;
  quality?: string;
  status: CitationEvidenceStatus;
  statusReason?: string;
  severity: CitationEvidenceSeverity;
  confidence?: number;
  supportingSnippet?: string;
  supportRationale?: string;
  supports?: CitationEvidenceSupport[];
  diagnostics?: CitationEvidenceDiagnostic[];
  provenance?: unknown;
  createdAt?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type CitationReviewQueueSummary = {
  slug: string;
  articleId: number | null;
  totalRows: number;
  supportedCount: number;
  needsSourceCount: number;
  needsReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  blockingCount: number;
  blockingNeedsSourceCount: number;
  blockingNeedsReviewCount: number;
  blockingSupportedCount: number;
  blockingRejectedCount: number;
  diagnosticErrorCount: number;
  diagnosticWarningCount: number;
  sectionIds: string[];
  updatedAt: string | null;
};

export type CitationReviewChecklistItem = {
  id: string;
  label: string;
  detail: string;
  tone: "complete" | "pending" | "attention";
};

export type CitationReviewApproveCommand = {
  claimKeys: string[];
  disabled: boolean;
};

export type CitationReviewRowCommand = {
  canApprove: boolean;
  isPending: boolean;
  approveDisabled: boolean;
  rejectDisabled: boolean;
};

export type CitationReviewCommands = {
  bulkApprove: CitationReviewApproveCommand;
  sections: Record<string, { approve: CitationReviewApproveCommand }>;
  rows: Record<string, CitationReviewRowCommand>;
};

export const CITATION_STATUS_META: Record<
  CitationEvidenceStatus,
  { label: string; className: string }
> = {
  supported: {
    label: "Ready to approve",
    className: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  },
  needs_source: {
    label: "Needs source",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  },
  needs_review: {
    label: "Needs review",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  },
  rejected: {
    label: "Rejected",
    className: "border-rose-500/30 bg-rose-500/15 text-rose-100",
  },
};

export const CITATION_SEVERITY_META: Record<
  CitationEvidenceSeverity,
  { label: string; className: string }
> = {
  blocking: {
    label: "Blocking",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  },
  non_blocking: {
    label: "Non-blocking",
    className: "border-white/10 bg-white/5 text-white/70",
  },
};

export function formatCitationSectionLabel(section: string): string {
  return section
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function canApproveCitationEvidence(row: CitationEvidenceRow): boolean {
  return (row.supports?.length ?? 0) > 0;
}

function isReadyCitationEvidence(row: CitationEvidenceRow): boolean {
  return row.status === "supported" && canApproveCitationEvidence(row);
}

export function buildCitationReviewCommands({
  rows,
  pendingClaimKeys,
  isBulkUpdating,
}: {
  rows: CitationEvidenceRow[];
  pendingClaimKeys: string[];
  isBulkUpdating: boolean;
}): CitationReviewCommands {
  const pending = new Set(pendingClaimKeys);
  const readyClaimKeys = rows.filter(isReadyCitationEvidence).map((row) => row.claimKey);
  const sectionReadyClaimKeys = new Map<string, string[]>();
  const rowCommands: CitationReviewCommands["rows"] = {};

  for (const row of rows) {
    if (isReadyCitationEvidence(row)) {
      const existing = sectionReadyClaimKeys.get(row.section) ?? [];
      existing.push(row.claimKey);
      sectionReadyClaimKeys.set(row.section, existing);
    }

    const isPending = pending.has(row.claimKey);
    const canApprove = canApproveCitationEvidence(row);
    rowCommands[row.claimKey] = {
      canApprove,
      isPending,
      approveDisabled: !canApprove || isPending,
      rejectDisabled: isPending,
    };
  }

  const sectionCommands = Object.fromEntries(
    [...new Set(rows.map((row) => row.section))].map((section) => {
      const claimKeys = sectionReadyClaimKeys.get(section) ?? [];
      return [
        section,
        {
          approve: {
            claimKeys,
            disabled: claimKeys.length === 0 || isBulkUpdating,
          },
        },
      ];
    }),
  );

  return {
    bulkApprove: {
      claimKeys: readyClaimKeys,
      disabled: readyClaimKeys.length === 0 || isBulkUpdating,
    },
    sections: sectionCommands,
    rows: rowCommands,
  };
}

export function groupCitationEvidenceBySection(rows: CitationEvidenceRow[]) {
  const groups = new Map<string, CitationEvidenceRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.section) ?? [];
    existing.push(row);
    groups.set(row.section, existing);
  }

  return [...groups.entries()]
    .map(([section, sectionRows]) => ({
      section,
      label: formatCitationSectionLabel(section),
      rows: [...sectionRows].sort((left, right) => (
        Number(left.severity !== "blocking") - Number(right.severity !== "blocking") ||
        Number(left.status === "approved") - Number(right.status === "approved") ||
        left.claimKey.localeCompare(right.claimKey)
      )),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildCitationReviewChecklist(
  article: SubstanceArticle | null,
  rows: CitationEvidenceRow[],
): CitationReviewChecklistItem[] {
  const blockingIssues = rows.filter(
    (row) =>
      row.severity === "blocking" &&
      (row.status === "needs_source" || row.status === "needs_review" || row.status === "rejected"),
  ).length;
  const pendingApprovals = rows.filter((row) => row.status === "supported").length;
  const nonBlockingIssues = rows.filter(
    (row) =>
      row.severity === "non_blocking" &&
      (row.status === "needs_source" || row.status === "needs_review" || row.status === "rejected"),
  ).length;

  if (!article) {
    return [
      {
        id: "blocking-gaps",
        label: "Blocking evidence gaps",
        detail:
          blockingIssues === 0
            ? "No blocking citation gaps are open."
            : `${blockingIssues} blocking row(s) still need source or reviewer resolution.`,
        tone: blockingIssues === 0 ? "complete" : "attention",
      },
      {
        id: "approvals",
        label: "Ready approvals",
        detail:
          pendingApprovals === 0
            ? "No supported rows are waiting for approval."
            : `${pendingApprovals} supported row(s) are waiting for reviewer approval.`,
        tone: pendingApprovals === 0 ? "complete" : "pending",
      },
      {
        id: "article-diagnostics",
        label: "Article linkage diagnostics",
        detail: "The current dev draft is not loaded, so inline and route reference diagnostics are unavailable.",
        tone: "pending",
      },
    ];
  }

  const diagnostics = buildEditorReferenceDiagnostics(article);
  const linkageProblems =
    diagnostics.unknownInlineReferenceIds.length +
    diagnostics.unknownStructuredReferenceIds.length +
    diagnostics.orphanedReferenceIds.length +
    diagnostics.duplicateAdjacentTokenIds.length;

  return [
    {
      id: "blocking-gaps",
      label: "Blocking evidence gaps",
      detail:
        blockingIssues === 0
          ? "No blocking citation gaps are open."
          : `${blockingIssues} blocking row(s) still need source or reviewer resolution.`,
      tone: blockingIssues === 0 ? "complete" : "attention",
    },
    {
      id: "approvals",
      label: "Ready approvals",
      detail:
        pendingApprovals === 0
          ? "No supported rows are waiting for approval."
          : `${pendingApprovals} supported row(s) are waiting for reviewer approval.`,
      tone: pendingApprovals === 0 ? "complete" : "pending",
    },
    {
      id: "non-blocking-gaps",
      label: "Non-blocking gaps",
      detail:
        nonBlockingIssues === 0
          ? "No non-blocking citation gaps are open."
          : `${nonBlockingIssues} non-blocking row(s) still need cleanup.`,
      tone: nonBlockingIssues === 0 ? "complete" : "pending",
    },
    {
      id: "article-diagnostics",
      label: "Article linkage diagnostics",
      detail:
        linkageProblems === 0
          ? "Inline citation tokens and route reference IDs are aligned with structured references."
          : `${linkageProblems} reference-linking warning(s) remain in the current article draft.`,
      tone: linkageProblems === 0 ? "complete" : "attention",
    },
  ];
}
