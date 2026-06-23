import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/common/Icon";
import type { EditorStatusPillTone } from "@/features/dev/components";
import {
  CodeSurface,
  EditorActionGroup,
  EditorListItem,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import {
  CITATION_SEVERITY_LABEL,
  CITATION_STATUS_LABEL,
  citationTone,
  formatCitationSectionLabel,
  type CitationEvidenceRow,
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
    <EditorPanel>
      <EditorPanelHeader
        icon="lucide:list-checks"
        title="Citation review queue"
        description="Evidence snippets, gap states, and reviewer decisions stay inside protected `/dev` routes."
        meta={(
          <>
            <EditorStatusPill tone="neutral">{queue.length} articles</EditorStatusPill>
            <EditorStatusPill tone="success">{readyApprovalCount} ready approvals</EditorStatusPill>
            <EditorStatusPill tone={blockingGapCount > 0 ? "danger" : "neutral"}>
              {blockingGapCount} blocking gaps
            </EditorStatusPill>
          </>
        )}
        actions={(
          <EditorToolbar label="Citation queue actions" variant="compact">
            <Button variant="outline" size="pill" className="rounded-full" onClick={onRefreshQueue}>
              <Icon icon="lucide:refresh-cw" size={16} />
              Refresh queue
            </Button>
          </EditorToolbar>
        )}
      />
    </EditorPanel>
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
    <EditorPanel variant="subtle" className="h-fit">
      <EditorPanelHeader
        icon="lucide:files"
        title="Articles"
        description="Select an article, then approve or reject ready evidence rows on the right."
        meta={<EditorStatusPill tone="neutral">{queue.length} queued</EditorStatusPill>}
      />
      <EditorPanelBody>
        <div className="space-y-3">
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
                className="flex-col items-stretch gap-0 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-semibold ${
                        isSelected ? "theme-accent-heading" : "theme-text-primary"
                      }`}
                    >
                      {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                    </p>
                    <p className="mt-1 text-xs theme-text-faint">{entry.slug}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {unresolvedBlocking > 0 ? (
                      <EditorStatusPill tone="danger">{unresolvedBlocking} blocking</EditorStatusPill>
                    ) : null}
                    {entry.supportedCount > 0 ? (
                      <EditorStatusPill tone="success">{entry.supportedCount} ready</EditorStatusPill>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <QueueRowMetric label="Rows" value={entry.totalRows} />
                  <QueueRowMetric label="Sections" value={entry.sectionIds.length} />
                  <QueueRowMetric label="Approved" value={entry.approvedCount} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs theme-text-faint">
                  <span>{entry.needsSourceCount} need source</span>
                  <span>{entry.needsReviewCount} need review</span>
                  <span>Updated {formatUpdatedAt(entry.updatedAt)}</span>
                </div>
              </EditorListItem>
            );
          })}
        </div>
      </EditorPanelBody>
    </EditorPanel>
  );
}

function QueueRowMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.2em] theme-text-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold theme-text-primary">{value}</p>
    </div>
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
    <EditorPanel>
      <EditorPanelHeader
        title={articleTitle}
        description="Review-only evidence rows, snippets, and reviewer decisions for this article."
        meta={<Badge variant="secondary">{selectedSummary.slug}</Badge>}
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
      />
      <EditorPanelBody>
      <div className="grid gap-3 md:grid-cols-4">
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
          label="Diagnostics"
          value={selectedSummary.diagnosticErrorCount + selectedSummary.diagnosticWarningCount}
        />
      </div>
      </EditorPanelBody>
    </EditorPanel>
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
    <div className="rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-3">
      <p className="text-xs uppercase tracking-[0.2em] theme-text-faint">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
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
    <EditorPanel>
      <EditorPanelHeader
        icon="lucide:clipboard-check"
        title="Review checklist"
        description="Pre-flight checks for marker integrity, source support, and reviewer decisions."
      />
      <EditorPanelBody>
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
      </EditorPanelBody>
    </EditorPanel>
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
    <EditorPanel>
      <EditorPanelHeader
        title={formatCitationSectionLabel(group.section)}
        description={`${group.rows.length} evidence row(s) for this section.`}
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
      />
      <EditorPanelBody>
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
      </EditorPanelBody>
    </EditorPanel>
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
  return (
    <EditorPanel variant="inset">
      <EditorPanelBody>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold theme-text-primary">
            {row.claimText?.trim() || row.fieldPath || row.claimKey}
          </p>
          <p className="mt-1 text-xs theme-text-faint">{row.claimKey}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditorStatusPill tone={citationTone({ kind: "severity", value: row.severity })}>
            {CITATION_SEVERITY_LABEL[row.severity]}
          </EditorStatusPill>
          <EditorStatusPill tone={citationTone({ kind: "status", value: row.status })}>
            {CITATION_STATUS_LABEL[row.status]}
          </EditorStatusPill>
        </div>
      </div>

      {row.fieldPath ? (
        <p className="mt-3 text-xs theme-text-faint">Field path: {row.fieldPath}</p>
      ) : null}

      {row.referenceIds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.referenceIds.map((referenceId) => (
            <Badge key={`${row.claimKey}-${referenceId}`} variant="secondary">
              {referenceId}
            </Badge>
          ))}
        </div>
      ) : null}

      {row.supportingSnippet ? (
        <div className="mt-4 rounded-xl border border-[color:var(--theme-frosted-control-on-panel-border)] bg-[var(--theme-frosted-control-on-panel-bg)] p-3">
          <p className="text-xs uppercase tracking-[0.2em] theme-text-faint">Snippet</p>
          <p className="mt-2 text-sm leading-6 theme-text-secondary">{row.supportingSnippet}</p>
        </div>
      ) : null}

      {row.supportRationale ? (
        <p className="mt-3 text-sm theme-text-muted">{row.supportRationale}</p>
      ) : null}

      {(row.supports?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-3">
          {(row.supports ?? []).map((support, index) => (
            <div
              key={`${row.claimKey}-${support.referenceId}-${index}`}
              className="rounded-xl border border-[color:var(--theme-frosted-control-on-panel-border)] bg-[var(--theme-frosted-control-on-panel-bg)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium theme-text-primary">{support.sourceName}</p>
                <Badge variant="secondary">{support.referenceId}</Badge>
                {support.sourceType ? <Badge variant="secondary">{support.sourceType}</Badge> : null}
                {support.quality ? <Badge variant="secondary">{support.quality}</Badge> : null}
              </div>
              <CodeSurface className="mt-2" value={support.supportingQuote} />
              <p className="mt-2 text-sm theme-text-faint">{support.rationale}</p>
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
    </EditorPanel>
  );
}
