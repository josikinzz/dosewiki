import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/common/Icon";
import type { EditorStatusPillTone } from "@/features/dev/components";
import {
  EditorActionGroup,
  EditorListItem,
  EditorPanel,
  EditorPanelBody,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";
import {
  CITATION_SEVERITY_LABEL,
  CITATION_STATUS_LABEL,
  citationTone,
  formatCitationCount,
  formatCitationSectionLabel,
  type CitationEvidenceRow,
  type CitationEvidenceStatus,
  type CitationReviewApproveCommand,
  type CitationReviewChecklistItem,
  type CitationReviewCommands,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No review activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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

export function CitationQueueHeader({
  queue,
  onRefreshQueue,
}: {
  queue: CitationReviewQueueSummary[];
  onRefreshQueue: () => void;
}) {
  const readyApprovalCount = queue.reduce((total, entry) => total + entry.supportedCount, 0);
  const blockingGapCount = queue.reduce(
    (total, entry) =>
      total +
      entry.blockingNeedsSourceCount +
      entry.blockingNeedsReviewCount +
      entry.blockingRejectedCount,
    0,
  );

  return (
    <EditorSection
      icon="lucide:list-checks"
      title="Citation review queue"
      description="Evidence snippets, gap states, and reviewer decisions never leave the protected dev area."
      actions={(
        <Button variant="outline" size="pill" className="rounded-full" onClick={onRefreshQueue}>
          <Icon icon="lucide:refresh-cw" size={16} />
          Refresh queue
        </Button>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EditorStatusPill tone="neutral">{queue.length} articles</EditorStatusPill>
        <EditorStatusPill tone="success">{readyApprovalCount} ready approvals</EditorStatusPill>
        <EditorStatusPill tone={blockingGapCount > 0 ? "danger" : "neutral"}>
          {blockingGapCount} blocking gaps
        </EditorStatusPill>
      </div>
    </EditorSection>
  );
}

export function CitationQueuePanel({
  queue,
  selectedSlug,
  articleTitleBySlug,
  onSelectSlug,
}: {
  queue: CitationReviewQueueSummary[];
  selectedSlug: string | null;
  articleTitleBySlug: Map<string, string>;
  onSelectSlug: (slug: string) => void;
}) {
  return (
    <EditorSection
      icon="lucide:files"
      title="Articles"
      description="Select an article, then approve or reject ready evidence rows on the right."
      actions={<EditorStatusPill tone="neutral">{queue.length} queued</EditorStatusPill>}
      className="h-fit lg:sticky lg:top-6"
    >
      <div className="space-y-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
        {queue.map((entry) => {
          const unresolvedBlocking =
            entry.blockingNeedsSourceCount +
            entry.blockingNeedsReviewCount +
            entry.blockingRejectedCount;
          const isSelected = selectedSlug === entry.slug;
          return (
            <EditorListItem
              key={entry.slug}
              active={isSelected}
              onSelect={() => onSelectSlug(entry.slug)}
              className="flex-col items-stretch gap-1 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className={`min-w-0 truncate text-sm font-semibold ${
                    isSelected ? "theme-accent-heading" : "theme-text-primary"
                  }`}
                >
                  {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                </p>
                <span className="flex shrink-0 flex-wrap justify-end gap-2">
                  {unresolvedBlocking > 0 ? (
                    <EditorStatusPill tone="danger">{unresolvedBlocking} blocking</EditorStatusPill>
                  ) : null}
                  {entry.supportedCount > 0 ? (
                    <EditorStatusPill tone="success">{entry.supportedCount} ready</EditorStatusPill>
                  ) : null}
                </span>
              </div>
              <p className="truncate text-xs theme-text-faint">
                {entry.slug} · {formatCitationCount(entry.totalRows, "row")} ·{" "}
                {entry.approvedCount} approved · Updated {formatUpdatedAt(entry.updatedAt)}
              </p>
            </EditorListItem>
          );
        })}
      </div>
    </EditorSection>
  );
}

export function CitationSelectedSummary({
  selectedSummary,
  articleTitle,
  command,
  onUpdateStatuses,
}: {
  selectedSummary: CitationReviewQueueSummary;
  articleTitle: string | null;
  command: CitationReviewApproveCommand;
  onUpdateStatuses: (claimKeys: string[], status: "approved" | "rejected") => void;
}) {
  return (
    <EditorSection
      title={articleTitle}
      description="Review-only evidence rows, snippets, and reviewer decisions for this article."
      actions={(
        <Button
          variant="success"
          size="pill"
          className="rounded-full"
          disabled={command.disabled}
          onClick={() => onUpdateStatuses(command.claimKeys, "approved")}
        >
          <Icon icon="lucide:badge-check" size={16} />
          Approve ready rows
        </Button>
      )}
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

export function CitationEvidenceSection({
  group,
  commands,
  onUpdateStatuses,
}: {
  group: { section: string; label: string; rows: CitationEvidenceRow[] };
  commands: CitationReviewCommands;
  onUpdateStatuses: (claimKeys: string[], status: "approved" | "rejected") => void;
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
          onClick={() => onUpdateStatuses(sectionCommand.claimKeys, "approved")}
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
            onUpdateStatuses={onUpdateStatuses}
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

function CitationSupportQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="theme-quote-accent-border border-l-2 pl-3 text-sm leading-6 theme-text-secondary">
      {children}
    </blockquote>
  );
}

export function CitationEvidenceRow({
  row,
  command,
  onUpdateStatuses,
}: {
  row: CitationEvidenceRow;
  command: CitationReviewCommands["rows"][string];
  onUpdateStatuses: (claimKeys: string[], status: "approved" | "rejected") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUnresolved = UNRESOLVED_CITATION_STATUSES.includes(row.status);
  const referenceIds = [...new Set(row.referenceIds)];
  const supports = row.supports ?? [];
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
        onClick={() => setExpanded((value) => !value)}
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

      <EditorActionGroup label="Evidence row decision actions" className="mt-4">
        <Button
          variant="success"
          size="pill"
          className="rounded-full"
          disabled={command.approveDisabled}
          onClick={() => onUpdateStatuses([row.claimKey], "approved")}
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
          onClick={() => onUpdateStatuses([row.claimKey], "rejected")}
        >
          <Icon
            icon={command.isPending ? "lucide:loader-2" : "lucide:x-circle"}
            size={16}
            className={command.isPending ? "animate-spin" : undefined}
          />
          Reject
        </Button>
      </EditorActionGroup>
      </EditorPanelBody>
      ) : null}
    </EditorPanel>
  );
}
