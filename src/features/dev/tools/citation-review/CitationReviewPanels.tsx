import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/common/Icon";
import type { EditorStatusPillTone } from "@/features/dev/components";
import {
  EditorSection,
} from "@/features/dev/components";
import {
  citationTone,
  formatCitationCount,
  type CitationReviewApproveCommand,
  type CitationReviewChecklistItem,
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
    tile: "border-[color:var(--theme-border-subtle)] [background:var(--theme-frosted-control-on-panel-bg)]",
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

export function toneTileClass(tone: EditorStatusPillTone): string {
  return `rounded-xl border p-3 ${TONE_TILE_SURFACE[tone].tile}`;
}

export function toneIconClass(tone: EditorStatusPillTone): string {
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

