import { useId, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon, type IconName } from "@/components/common/Icon";
import type { EditorStatusPillTone } from "@/features/dev/components";
import {
  EditorActionGroup,
  EditorField,
  EditorPanel,
  EditorPanelBody,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import {
  CITATION_REJECT_REASONS,
  CITATION_REJECT_REASON_LABEL,
  CITATION_SEVERITY_LABEL,
  CITATION_STATUS_LABEL,
  citationTone,
  formatCitationCount,
  formatCitationRejectReason,
  formatCitationSectionLabel,
  type CitationEvidenceRow,
  type CitationEvidenceStatus,
  type CitationRejectReason,
  type CitationReviewApproveCommand,
  type CitationReviewChecklistItem,
  type CitationReviewCommands,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";

/**
 * Tokenized callout-tile surface for a semantic tone. Shares the same
 * {@link EditorStatusPillTone} switchboard as the status pills so a tile, its
 * badge, and its diagnostic chip always agree. No baked navy/cyan hex, and the
 * fills flip correctly in light mode via the --theme-*-bg/-border families.
 */
const TONE_TILE_SURFACE: Record<EditorStatusPillTone, { tile: string; icon: string }> = {
  neutral: {
    tile: "border-[color:var(--theme-border-subtle)] bg-[var(--theme-frosted-control-on-panel-bg)]",
    icon: "theme-text-faint",
  },
  info: {
    tile: "border-[color:var(--theme-semantic-info-badge-border)] bg-[var(--theme-info-bg,var(--theme-semantic-info-badge-bg))]",
    icon: "text-[color:var(--theme-semantic-info-badge-text)]",
  },
  success: {
    tile: "border-[color:var(--theme-success-border)] bg-[var(--theme-success-bg)]",
    icon: "text-[color:var(--theme-success-text)]",
  },
  caution: {
    tile: "border-[color:var(--theme-warning-border)] bg-[var(--theme-warning-bg)]",
    icon: "text-[color:var(--theme-warning-text)]",
  },
  warning: {
    tile: "border-[color:var(--theme-warning-border)] bg-[var(--theme-warning-bg)]",
    icon: "text-[color:var(--theme-warning-text)]",
  },
  danger: {
    tile: "border-[color:var(--theme-danger-border)] bg-[var(--theme-danger-bg)]",
    icon: "text-[color:var(--theme-danger-text)]",
  },
};

function toneTileClass(tone: EditorStatusPillTone): string {
  return `rounded-xl border p-3 ${TONE_TILE_SURFACE[tone].tile}`;
}

function toneIconClass(tone: EditorStatusPillTone): string {
  return TONE_TILE_SURFACE[tone].icon;
}

/** Row-level decisions raised from an evidence row or a section. */
export type CitationEvidenceDecisionHandlers = {
  /** Approve rows that already carry a verified quote. */
  onApprove: (claimKeys: string[]) => void;
  /** Reject one row with the reviewer's note for the next editor. */
  onReject: (claimKey: string, statusReason: string | undefined) => void;
  /** A row was opened, so its quote has been on screen. */
  onRowExpanded: (claimKey: string) => void;
};

export function CitationSelectedSummary({
  selectedSummary,
  articleTitle,
}: {
  selectedSummary: CitationReviewQueueSummary;
  articleTitle: string | null;
}) {
  return (
    <EditorSection
      title={articleTitle}
      description="Evidence rows, their quotes, and reviewer decisions for this article."
    >
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <SummaryMetric
          label="Blocking gaps"
          value={
            selectedSummary.blockingNeedsSourceCount +
            selectedSummary.blockingNeedsReviewCount +
            selectedSummary.blockingRejectedCount
          }
        />
        <SummaryMetric
          label="Ready approvals"
          value={selectedSummary.supportedCount}
          valueClassName="text-[color:var(--theme-evidence-text)]"
        />
        <SummaryMetric
          label="Approved"
          value={selectedSummary.approvedCount}
          valueClassName="text-[color:var(--theme-success-text)]"
        />
        <SummaryMetric
          label="Row diagnostics"
          value={selectedSummary.diagnosticErrorCount + selectedSummary.diagnosticWarningCount}
        />
      </div>
    </EditorSection>
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName = "theme-text-primary",
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className={`text-2xl font-semibold ${valueClassName}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] theme-text-faint">{label}</p>
    </div>
  );
}

const CHECKLIST_TONE_ICON: Record<CitationReviewChecklistItem["tone"], IconName> = {
  complete: "lucide:badge-check",
  attention: "lucide:triangle-alert",
  pending: "lucide:clock-3",
};

export function CitationChecklistPanel({ checklist }: { checklist: CitationReviewChecklistItem[] }) {
  return (
    <EditorSection
      icon="lucide:clipboard-check"
      title="Review checklist"
      description="Pre-flight checks for marker integrity, source support, and reviewer decisions."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {checklist.map((item) => (
          <div
            key={item.id}
            className={toneTileClass(citationTone({ kind: "checklist", value: item.tone }))}
          >
            <div className="flex items-center gap-2">
              <Icon
                icon={CHECKLIST_TONE_ICON[item.tone]}
                size={16}
                className={toneIconClass(citationTone({ kind: "checklist", value: item.tone }))}
              />
              <p className="text-sm font-medium theme-text-primary">{item.label}</p>
            </div>
            <p className="mt-2 text-sm theme-text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </EditorSection>
  );
}

/**
 * The article-wide approval, placed after every evidence section so it is the
 * last thing the reviewer reaches. It stays locked until a row has been opened
 * in this session; the confirmation lives in the tab.
 */
export function CitationBulkApprovePanel({
  command,
  hasReadRow,
  onApproveAll,
}: {
  command: CitationReviewApproveCommand;
  hasReadRow: boolean;
  onApproveAll: (claimKeys: string[]) => void;
}) {
  const readyCount = command.claimKeys.length;
  const locked = readyCount > 0 && !hasReadRow;

  return (
    <EditorSection
      icon="lucide:badge-check"
      title="Approve the ready rows"
      description="Approves every row above that has a verified quote and is still waiting. Rejected rows are left alone."
      actions={(
        <Button
          variant="outline"
          size="pill"
          className="rounded-full"
          disabled={command.disabled || locked}
          onClick={() => onApproveAll(command.claimKeys)}
        >
          <Icon icon="lucide:badge-check" size={16} />
          {readyCount > 0 ? `Approve ${formatCitationCount(readyCount, "ready row")}` : "No ready rows"}
        </Button>
      )}
    >
      <p className="text-sm theme-text-muted">
        {locked
          ? "Open at least one row above before approving the set. Each approval publishes that quote as the article's evidence."
          : readyCount > 0
            ? "You will be asked to confirm, with the sections this touches listed."
            : "Every row with a verified quote has already been decided."}
      </p>
    </EditorSection>
  );
}

export function CitationEvidenceSection({
  group,
  commands,
  handlers,
  onApproveSection,
}: {
  group: { section: string; label: string; rows: CitationEvidenceRow[] };
  commands: CitationReviewCommands;
  handlers: CitationEvidenceDecisionHandlers;
  onApproveSection: (section: string, claimKeys: string[]) => void;
}) {
  const sectionCommand = commands.sections[group.section]?.approve ?? { claimKeys: [], disabled: true };

  return (
    <EditorSection
      title={formatCitationSectionLabel(group.section)}
      description={`${formatCitationCount(group.rows.length, "evidence row")} for this section.`}
      actions={(
        <Button
          variant="outline"
          size="pill"
          className="rounded-full"
          disabled={sectionCommand.disabled}
          onClick={() => onApproveSection(group.section, sectionCommand.claimKeys)}
        >
          <Icon icon="lucide:badge-check" size={16} />
          Approve section-ready rows
        </Button>
      )}
    >
      <div className="space-y-3">
        {group.rows.map((row) => (
          <CitationEvidenceRow
            key={`${row.section}-${row.claimKey}`}
            row={row}
            command={commands.rows[row.claimKey] ?? {
              canApprove: false,
              isPending: false,
              approveDisabled: true,
              rejectDisabled: true,
            }}
            handlers={handlers}
          />
        ))}
      </div>
    </EditorSection>
  );
}

const UNRESOLVED_CITATION_STATUSES: readonly CitationEvidenceStatus[] = [
  "needs_source",
  "needs_review",
  "rejected",
];

function formatCitationConfidence(value: number): string {
  const display = value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : `${value}`;
  return `${display} confidence`;
}

const REFERENCE_ID_BADGE_CLASS = "max-w-full break-all font-mono normal-case tracking-normal";

const REJECT_REASON_OPTIONS = CITATION_REJECT_REASONS.map((value) => ({
  value,
  label: CITATION_REJECT_REASON_LABEL[value],
}));

const MAX_REJECT_DETAIL_LENGTH = 500;

function CitationSupportQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="theme-quote-accent-border border-l-2 pl-3 text-sm leading-6 theme-text-secondary">
      {children}
    </blockquote>
  );
}

/**
 * Inline reason capture that sits between the Reject button and the write.
 * The note is saved on the row so the next editor does not redo the research.
 */
function CitationRejectForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (statusReason: string | undefined) => void;
}) {
  const [reason, setReason] = useState<CitationRejectReason>("quote_does_not_support_claim");
  const [detail, setDetail] = useState("");
  const reasonId = useId();
  const detailId = useId();
  const detailRequired = reason === "other";
  const detailMissing = detailRequired && detail.trim().length === 0;

  return (
    <div className={`mt-4 space-y-3 ${toneTileClass("danger")}`}>
      <EditorField
        id={reasonId}
        label="Why is this row rejected?"
        description="Saved with the row so the next editor sees it."
      >
        {(fieldProps) => (
          <EditorSelect
            {...fieldProps}
            selectSize="sm"
            options={REJECT_REASON_OPTIONS}
            value={reason}
            onChange={(event) => setReason(event.target.value as CitationRejectReason)}
          />
        )}
      </EditorField>
      <EditorField
        id={detailId}
        label={detailRequired ? "Reason" : "Detail (optional)"}
        required={detailRequired}
        counter={`${detail.length}/${MAX_REJECT_DETAIL_LENGTH}`}
        error={detailMissing ? "Write the reason before rejecting." : undefined}
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            textareaSize="sm"
            className="min-h-[72px] resize-y"
            value={detail}
            maxLength={MAX_REJECT_DETAIL_LENGTH}
            placeholder="What the next editor should check."
            onChange={(event) => setDetail(event.target.value)}
          />
        )}
      </EditorField>
      <EditorActionGroup label="Reject confirmation actions">
        <Button
          variant="destructivePill"
          size="pill"
          className="rounded-full"
          disabled={detailMissing || pending}
          onClick={() => onConfirm(formatCitationRejectReason(reason, detail))}
        >
          <Icon icon="lucide:x-circle" size={16} />
          Reject row
        </Button>
        <Button variant="quiet" size="quiet" onClick={onCancel} disabled={pending}>
          Keep reviewing
        </Button>
      </EditorActionGroup>
    </div>
  );
}

export function CitationEvidenceRow({
  row,
  command,
  handlers,
}: {
  row: CitationEvidenceRow;
  command: CitationReviewCommands["rows"][string];
  handlers: CitationEvidenceDecisionHandlers;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const isUnresolved = UNRESOLVED_CITATION_STATUSES.includes(row.status);
  const referenceIds = [...new Set(row.referenceIds)];
  const supports = row.supports ?? [];
  const reviewerNote = row.statusReason?.trim() ?? "";
  // Legacy flat snippet/rationale fields usually duplicate the structured
  // supports[] verbatim; only render them when they carry unique text.
  const legacySnippet = row.supportingSnippet?.trim() ?? "";
  const showLegacySnippet =
    legacySnippet.length > 0 &&
    !supports.some((support) => support.supportingQuote.trim() === legacySnippet);
  const legacyRationale = row.supportRationale?.trim() ?? "";
  const showLegacyRationale =
    legacyRationale.length > 0 &&
    !supports.some((support) => support.rationale.trim() === legacyRationale);

  return (
    <EditorPanel variant="inset">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (!expanded) {
            handlers.onRowExpanded(row.claimKey);
          }
          setExpanded(!expanded);
        }}
        className="theme-focus-ring-inset flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <Icon
          icon="lucide:chevron-right"
          size={16}
          className={`theme-text-faint shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium theme-text-primary">
          {row.claimText?.trim() || row.fieldPath || row.claimKey}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {typeof row.confidence === "number" ? (
            <span className="text-xs theme-text-faint">
              {formatCitationConfidence(row.confidence)}
            </span>
          ) : null}
          {row.severity === "blocking" ? (
            <EditorStatusPill
              tone={isUnresolved ? citationTone({ kind: "severity", value: row.severity }) : "neutral"}
              title="Blocks publication if left unresolved"
            >
              {CITATION_SEVERITY_LABEL[row.severity]}
            </EditorStatusPill>
          ) : null}
          <EditorStatusPill tone={citationTone({ kind: "status", value: row.status })}>
            {CITATION_STATUS_LABEL[row.status]}
          </EditorStatusPill>
        </span>
      </button>

      {expanded ? (
      <EditorPanelBody className="border-t border-[color:var(--editor-panel-border)]">
      <div className="min-w-0">
        <p className="text-sm font-semibold theme-text-primary">
          {row.claimText?.trim() || row.fieldPath || row.claimKey}
        </p>
        <p className="mt-1 break-all text-xs theme-text-faint">
          {row.claimKey}
          {row.fieldPath ? ` · ${row.fieldPath}` : ""}
        </p>
      </div>

      {reviewerNote ? (
        <div className={`mt-3 ${toneTileClass(citationTone({ kind: "status", value: row.status }))}`}>
          <p className="text-xs font-medium uppercase tracking-[0.2em] theme-text-faint">Reviewer note</p>
          <p className="mt-1 text-sm theme-text-secondary">{reviewerNote}</p>
        </div>
      ) : null}

      {referenceIds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {referenceIds.map((referenceId) => (
            <Badge
              key={`${row.claimKey}-${referenceId}`}
              variant="secondary"
              className={REFERENCE_ID_BADGE_CLASS}
            >
              {referenceId}
            </Badge>
          ))}
        </div>
      ) : null}

      {showLegacySnippet ? (
        <div className="mt-4">
          <CitationSupportQuote>{row.supportingSnippet}</CitationSupportQuote>
        </div>
      ) : null}

      {showLegacyRationale ? (
        <p className="mt-3 text-sm theme-text-muted">{row.supportRationale}</p>
      ) : null}

      {supports.length > 0 ? (
        <div className="mt-4 space-y-4">
          {supports.map((support, index) => (
            <div key={`${row.claimKey}-${support.referenceId}-${index}`} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium theme-text-primary">{support.sourceName}</p>
                <Badge variant="secondary" className={REFERENCE_ID_BADGE_CLASS}>
                  {support.referenceId}
                </Badge>
                {support.sourceType && support.sourceType !== "unknown" ? (
                  <Badge variant="secondary">{support.sourceType}</Badge>
                ) : null}
                {support.quality ? (
                  <Badge variant="secondary" className="normal-case tracking-normal">
                    Quality: {support.quality}
                  </Badge>
                ) : null}
              </div>
              <CitationSupportQuote>{support.supportingQuote}</CitationSupportQuote>
              <p className="text-sm theme-text-muted">{support.rationale}</p>
            </div>
          ))}
        </div>
      ) : null}

      {(row.diagnostics?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-2">
          {(row.diagnostics ?? []).map((diagnostic, index) => {
            const tone = citationTone({ kind: "diagnostic", value: diagnostic.severity });
            return (
              <div
                key={`${row.claimKey}-diagnostic-${index}`}
                className={`text-sm theme-text-secondary ${toneTileClass(tone)}`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    icon={diagnostic.severity === "error" ? "lucide:triangle-alert" : "lucide:badge-alert"}
                    size={15}
                    className={toneIconClass(tone)}
                  />
                  <span className="font-medium theme-text-primary">{diagnostic.code}</span>
                </div>
                <p className="mt-1">{diagnostic.message}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {rejecting ? (
        <CitationRejectForm
          pending={command.isPending}
          onCancel={() => setRejecting(false)}
          onConfirm={(statusReason) => {
            setRejecting(false);
            handlers.onReject(row.claimKey, statusReason);
          }}
        />
      ) : (
        <EditorActionGroup label="Evidence row decision actions" className="mt-4">
          <Button
            variant="success"
            size="pill"
            className="rounded-full"
            disabled={command.approveDisabled}
            onClick={() => handlers.onApprove([row.claimKey])}
          >
            <Icon
              icon={command.isPending ? "lucide:loader-2" : "lucide:badge-check"}
              size={16}
              className={command.isPending ? "animate-spin" : undefined}
            />
            Approve
          </Button>
          <Button
            variant="destructivePill"
            size="pill"
            className="rounded-full"
            disabled={command.rejectDisabled}
            onClick={() => setRejecting(true)}
          >
            <Icon
              icon={command.isPending ? "lucide:loader-2" : "lucide:x-circle"}
              size={16}
              className={command.isPending ? "animate-spin" : undefined}
            />
            Reject
          </Button>
        </EditorActionGroup>
      )}
      </EditorPanelBody>
      ) : null}
    </EditorPanel>
  );
}
