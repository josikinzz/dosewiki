import type { SubstanceArticle } from "@/schema";
import type { EditorStatusPillTone } from "@/features/dev/components";
import { CITATION_INTAKE_STATUS, INTAKE_STATUS_LABEL } from "@/features/intake/intakeStatus";
import { buildEditorReferenceDiagnostics } from "@/lib/citations/editorReferenceDiagnostics";
import { getCatalogSectionPromptDescriptors } from "@/schema/substance/sectionManifest";

export type CitationEvidenceStatus =
  | "supported"
  | "needs_source"
  | "needs_review"
  | "approved"
  | "rejected";

const CITATION_EVIDENCE_STATUSES: readonly CitationEvidenceStatus[] = [
  "supported",
  "needs_source",
  "needs_review",
  "approved",
  "rejected",
]

export function isCitationEvidenceStatus(value: string): value is CitationEvidenceStatus {
  return (CITATION_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

export type CitationEvidenceSeverity = "blocking" | "non_blocking";

export type CitationReviewQueueFilter = "open" | "approved" | "rejected" | "all";

export const CITATION_QUEUE_FILTERS: readonly CitationReviewQueueFilter[] = [
  "open",
  "approved",
  "rejected",
  "all",
];

export const CITATION_QUEUE_FILTER_LABEL: Record<CitationReviewQueueFilter, string> = {
  open: "Open",
  approved: INTAKE_STATUS_LABEL[CITATION_INTAKE_STATUS.approved],
  rejected: INTAKE_STATUS_LABEL[CITATION_INTAKE_STATUS.rejected],
  all: "All",
};

export function isCitationReviewQueueFilter(value: string): value is CitationReviewQueueFilter {
  return (CITATION_QUEUE_FILTERS as readonly string[]).includes(value);
}

export type CitationReviewQueueLoadCause = "query";

export type CitationReviewQueueLoadFailure = {
  error: string;
  cause?: CitationReviewQueueLoadCause;
  requestId?: string;
};

export const CITATION_QUEUE_LOAD_CAUSE_LABEL: Record<CitationReviewQueueLoadCause, string> = {
  query: "The data server could not run the queue summary.",
};

export type CitationReviewDecisionStatus = "approved" | "rejected";

export type CitationRejectReason =
  | "wrong_source"
  | "quote_does_not_support_claim"
  | "source_unreliable"
  | "other";

export const CITATION_REJECT_REASONS: readonly CitationRejectReason[] = [
  "wrong_source",
  "quote_does_not_support_claim",
  "source_unreliable",
  "other",
];

export const CITATION_REJECT_REASON_LABEL: Record<CitationRejectReason, string> = {
  wrong_source: "Wrong source",
  quote_does_not_support_claim: "Quote does not support the claim",
  source_unreliable: "Source unreliable",
  other: "Other",
};

export function formatCitationRejectReason(
  reason: CitationRejectReason,
  detail: string,
): string | undefined {
  const note = detail.trim();
  if (reason === "other") {
    return note || undefined;
  }
  return note ? `${CITATION_REJECT_REASON_LABEL[reason]}: ${note}` : CITATION_REJECT_REASON_LABEL[reason];
}

export type CitationReviewPriorRow = {
  claimKey: string;
  status: CitationEvidenceStatus;
  statusReason?: string;
};

export type CitationReviewDecisionRecord = {
  status: CitationReviewDecisionStatus;
  slug: string;
  prior: CitationReviewPriorRow[];
};

export function groupPriorRowsForRestore(
  prior: readonly CitationReviewPriorRow[],
): Array<{ status: CitationEvidenceStatus; statusReason?: string; claimKeys: string[] }> {
  const groups = new Map<string, { status: CitationEvidenceStatus; statusReason?: string; claimKeys: string[] }>();
  for (const row of prior) {
    const key = `${row.status}\u0000${row.statusReason ?? ""}`;
    const group = groups.get(key) ?? { status: row.status, statusReason: row.statusReason, claimKeys: [] };
    group.claimKeys.push(row.claimKey);
    groups.set(key, group);
  }
  return [...groups.values()];
}

type CitationEvidenceSupport = {
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
}

type CitationEvidenceDiagnostic = {
  code: string;
  message: string;
  severity: "error" | "warning";
  claimKey?: string | null;
}

export type CitationEvidenceRow = {
  section: string;
  claimKey: string;
  claimText?: string;
  fieldPath?: string;
  referenceIds: string[];
  status: CitationEvidenceStatus;
  statusReason?: string;
  severity: CitationEvidenceSeverity;
  confidence?: number;
  supportingSnippet?: string;
  supportRationale?: string;
  supports?: CitationEvidenceSupport[];
  diagnostics?: CitationEvidenceDiagnostic[];
  updatedAt: string;
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

type CitationReviewRowCommand = {
  canApprove: boolean;
  isPending: boolean;
  approveDisabled: boolean;
  rejectDisabled: boolean;
}

export type CitationReviewCommands = {
  bulkApprove: CitationReviewApproveCommand;
  sections: Record<string, { approve: CitationReviewApproveCommand }>;
  rows: Record<string, CitationReviewRowCommand>;
};

export type CitationReviewChecklistTone = CitationReviewChecklistItem["tone"];

export type CitationReviewDiagnosticSeverity = CitationEvidenceDiagnostic["severity"];

const CITATION_STATUS_TONE: Record<CitationEvidenceStatus, EditorStatusPillTone> = {
  supported: "success",
  needs_source: "danger",
  needs_review: "caution",
  approved: "success",
  rejected: "danger",
}

export const CITATION_STATUS_LABEL: Record<CitationEvidenceStatus, string> = {
  supported: "Ready to approve",
  needs_source: "Needs source",
  needs_review: "Needs review",
  approved: INTAKE_STATUS_LABEL[CITATION_INTAKE_STATUS.approved],
  rejected: INTAKE_STATUS_LABEL[CITATION_INTAKE_STATUS.rejected],
};

const CITATION_SEVERITY_TONE: Record<CitationEvidenceSeverity, EditorStatusPillTone> = {
  blocking: "danger",
  non_blocking: "neutral",
}

export const CITATION_SEVERITY_LABEL: Record<CitationEvidenceSeverity, string> = {
  blocking: "Blocking",
  non_blocking: "Non-blocking",
};

const CITATION_CHECKLIST_TONE: Record<CitationReviewChecklistTone, EditorStatusPillTone> = {
  complete: "success",
  pending: "caution",
  attention: "danger",
}

const CITATION_DIAGNOSTIC_TONE: Record<
  CitationReviewDiagnosticSeverity,
  EditorStatusPillTone
> = {
  error: "danger",
  warning: "caution",
}

export function citationTone(
  input:
    | { kind: "status"; value: CitationEvidenceStatus }
    | { kind: "severity"; value: CitationEvidenceSeverity }
    | { kind: "checklist"; value: CitationReviewChecklistTone }
    | { kind: "diagnostic"; value: CitationReviewDiagnosticSeverity },
): EditorStatusPillTone {
  switch (input.kind) {
    case "status":
      return CITATION_STATUS_TONE[input.value];
    case "severity":
      return CITATION_SEVERITY_TONE[input.value];
    case "checklist":
      return CITATION_CHECKLIST_TONE[input.value];
    case "diagnostic":
      return CITATION_DIAGNOSTIC_TONE[input.value];
  }
}

export function formatCitationCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const ARTICLE_SECTION_RANK = new Map<string, number>(
  getCatalogSectionPromptDescriptors().map((descriptor, index) => [descriptor.sectionKey, index]),
);

function citationSectionRank(section: string): number {
  return ARTICLE_SECTION_RANK.get(section) ?? Number.MAX_SAFE_INTEGER;
}

const ARTICLE_SECTION_LABEL = new Map<string, string>(
  getCatalogSectionPromptDescriptors().map((descriptor) => [descriptor.sectionKey, descriptor.label]),
);

export function formatCitationSectionLabel(section: string): string {
  const label =
    ARTICLE_SECTION_LABEL.get(section) ??
    section
      .split(/[_-]/g)
      .filter(Boolean)
      .join(" ");
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function canApproveCitationEvidence(row: CitationEvidenceRow): boolean {
  return (row.supports ?? []).some(
    (support) => support.supportingQuote.trim().length > 0 && Boolean(support.verifiedQuote?.sourceId),
  );
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
      approveDisabled: !canApprove || isPending || row.status === "approved",
      rejectDisabled: isPending || row.status === "rejected",
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
    .sort(
      (left, right) =>
        citationSectionRank(left.section) - citationSectionRank(right.section) ||
        left.label.localeCompare(right.label),
    );
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

  const blockingDetail =
    blockingIssues === 0
      ? "No blocking citation gaps are open."
      : `${formatCitationCount(blockingIssues, "blocking row")} still ${
          blockingIssues === 1 ? "needs" : "need"
        } a source or a decision before the article's citations are complete.`;
  const approvalsDetail =
    pendingApprovals === 0
      ? "No row with a verified quote is waiting."
      : `${formatCitationCount(pendingApprovals, "row")} with a verified quote ${
          pendingApprovals === 1 ? "waits" : "wait"
        } for your decision.`;

  if (!article) {
    return [
      {
        id: "blocking-gaps",
        label: "Blocking evidence gaps",
        detail: blockingDetail,
        tone: blockingIssues === 0 ? "complete" : "attention",
      },
      {
        id: "approvals",
        label: "Ready to approve",
        detail: approvalsDetail,
        tone: pendingApprovals === 0 ? "complete" : "pending",
      },
      {
        id: "article-diagnostics",
        label: "Markers in the article text",
        detail: "The article has not loaded yet, so its markers cannot be checked.",
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
      detail: blockingDetail,
      tone: blockingIssues === 0 ? "complete" : "attention",
    },
    {
      id: "approvals",
      label: "Ready to approve",
      detail: approvalsDetail,
      tone: pendingApprovals === 0 ? "complete" : "pending",
    },
    {
      id: "non-blocking-gaps",
      label: "Other gaps",
      detail:
        nonBlockingIssues === 0
          ? "No non-blocking gaps are open."
          : `${formatCitationCount(nonBlockingIssues, "non-blocking row")} still ${
              nonBlockingIssues === 1 ? "needs" : "need"
            } a source, without blocking the article.`,
      tone: nonBlockingIssues === 0 ? "complete" : "pending",
    },
    {
      id: "article-diagnostics",
      label: "Markers in the article text",
      detail:
        linkageProblems === 0
          ? "Every citation marker and route reference points at a stored reference."
          : `${formatCitationCount(linkageProblems, "marker warning")} in the article text.`,
      tone: linkageProblems === 0 ? "complete" : "attention",
    },
  ];
}
