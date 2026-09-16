import type { SubstanceArticle } from "@/schema";
import type { EditorStatusPillTone } from "@/features/dev/components";
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

/**
 * Queue membership filter shared by the tab, the queue route, and the Postgres
 * summary query. `open` is the default: an article stays queued while at least
 * one row is not approved, so fully approved articles drain out of the queue.
 * `approved` brings those drained articles back; `rejected` narrows to
 * articles holding at least one rejected row; `all` lifts the filter.
 */
export type CitationReviewQueueFilter = "open" | "approved" | "rejected" | "all";

export const CITATION_QUEUE_FILTERS: readonly CitationReviewQueueFilter[] = [
  "open",
  "approved",
  "rejected",
  "all",
];

export const CITATION_QUEUE_FILTER_LABEL: Record<CitationReviewQueueFilter, string> = {
  open: "Open",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};

export function isCitationReviewQueueFilter(value: string): value is CitationReviewQueueFilter {
  return (CITATION_QUEUE_FILTERS as readonly string[]).includes(value);
}

/** What the queue route could tell about a failed native summary query. */
export type CitationReviewQueueLoadCause = "query";

export type CitationReviewQueueLoadFailure = {
  error: string;
  cause?: CitationReviewQueueLoadCause;
  requestId?: string;
};

export const CITATION_QUEUE_LOAD_CAUSE_LABEL: Record<CitationReviewQueueLoadCause, string> = {
  query: "The data server could not run the queue summary.",
};

/** Reviewer decision written to a row; `statusReason` is the note the next editor reads. */
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

/**
 * The text stored on the row for a rejection. Fixed reasons store their label;
 * `other` stores the reviewer's own words, or nothing when they left it blank.
 */
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

/** A write the reviewer can undo: the rows as they were before the decision. */
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

/**
 * Groups prior rows into the fewest status writes that restore them. The
 * status route writes one status and one note per call, so rows that shared a
 * status and note before the decision travel together.
 */
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

/**
 * Single source of truth that resolves every citation-review semantic onto a
 * shared {@link EditorStatusPillTone}. Status badges, checklist tiles, and
 * diagnostic chips all route through these maps so a status, its tile fill, and
 * its diagnostic chip can never drift out of sync. No raw palette classes, no
 * forbidden cyan: `supported` (ready-to-approve) maps to the green/info family
 * via `success`, never cyan.
 */
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
  approved: "Approved",
  rejected: "Rejected",
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

/**
 * Resolve the {@link EditorStatusPillTone} for any citation-review surface
 * (badge, checklist tile, diagnostic chip) from a single switchboard so the
 * three surfaces never diverge.
 */
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

/** Pluralize a count + noun pair for reviewer-facing copy ("1 row" / "3 rows"). */
export function formatCitationCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Canonical article order for evidence section keys, derived from the section
 * catalog so the review page reads top-to-bottom like the public article.
 * Unknown sections sort last, alphabetically.
 */
const ARTICLE_SECTION_RANK = new Map<string, number>(
  getCatalogSectionPromptDescriptors().map((descriptor, index) => [descriptor.sectionKey, index]),
);

function citationSectionRank(section: string): number {
  return ARTICLE_SECTION_RANK.get(section) ?? Number.MAX_SAFE_INTEGER;
}

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
    // A verdict button is inert once the row already holds that verdict, so
    // the disabled state reads as the current decision.
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
        } source or reviewer resolution.`;
  const approvalsDetail =
    pendingApprovals === 0
      ? "No supported rows are waiting for approval."
      : `${formatCitationCount(pendingApprovals, "supported row")} ${
          pendingApprovals === 1 ? "is" : "are"
        } waiting for reviewer approval.`;

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
        label: "Ready approvals",
        detail: approvalsDetail,
        tone: pendingApprovals === 0 ? "complete" : "pending",
      },
      {
        id: "article-diagnostics",
        label: "Draft reference linkage",
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
      detail: blockingDetail,
      tone: blockingIssues === 0 ? "complete" : "attention",
    },
    {
      id: "approvals",
      label: "Ready approvals",
      detail: approvalsDetail,
      tone: pendingApprovals === 0 ? "complete" : "pending",
    },
    {
      id: "non-blocking-gaps",
      label: "Non-blocking gaps",
      detail:
        nonBlockingIssues === 0
          ? "No non-blocking citation gaps are open."
          : `${formatCitationCount(nonBlockingIssues, "non-blocking row")} still ${
              nonBlockingIssues === 1 ? "needs" : "need"
            } cleanup.`,
      tone: nonBlockingIssues === 0 ? "complete" : "pending",
    },
    {
      id: "article-diagnostics",
      label: "Draft reference linkage",
      detail:
        linkageProblems === 0
          ? "Inline citation tokens and route reference IDs are aligned with structured references."
          : `${formatCitationCount(linkageProblems, "reference-linking warning")} ${
              linkageProblems === 1 ? "remains" : "remain"
            } in the current article draft.`,
      tone: linkageProblems === 0 ? "complete" : "attention",
    },
  ];
}
