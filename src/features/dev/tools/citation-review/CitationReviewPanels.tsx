import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  EditorActionGroup,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorToolbar,
} from "@/features/dev/components";
import {
  CITATION_SEVERITY_META,
  CITATION_STATUS_META,
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

export function CitationQueueHeader({
  queue,
  onRefreshQueue,
}: {
  queue: CitationReviewQueueSummary[];
  onRefreshQueue: () => void;
}) {
  return (
    <EditorPanel>
      <EditorPanelHeader
        icon="lucide:list-checks"
        title="Citation review queue"
        description="Evidence snippets, gap states, and reviewer decisions stay inside protected `/dev` routes."
        actions={(
          <EditorToolbar label="Citation queue actions" variant="compact">
          <Badge variant="secondary">{queue.length} articles</Badge>
          <Badge variant="secondary">
            {queue.reduce((total, entry) => total + entry.supportedCount, 0)} ready approvals
          </Badge>
          <Badge variant="secondary">
            {queue.reduce(
              (total, entry) =>
                total +
                entry.blockingNeedsSourceCount +
                entry.blockingNeedsReviewCount +
                entry.blockingRejectedCount,
              0,
            )}{" "}
            blocking gaps
          </Badge>
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
      <EditorPanelBody>
      <div className="space-y-3">
        {queue.map((entry) => {
          const unresolvedBlocking =
            entry.blockingNeedsSourceCount +
            entry.blockingNeedsReviewCount +
            entry.blockingRejectedCount;
          return (
            <button
              key={entry.slug}
              type="button"
              onClick={() => onSelectSlug(entry.slug)}
              className={`w-full rounded-xl border px-4 py-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300 ${
                selectedSlug === entry.slug
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] hover:border-[color:var(--editor-panel-border-strong)] hover:bg-[var(--editor-panel-bg)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold theme-text-primary">
                    {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                  </p>
                  <p className="mt-1 text-xs theme-text-faint">{entry.slug}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {unresolvedBlocking > 0 ? (
                    <Badge variant="destructive">{unresolvedBlocking} blocking</Badge>
                  ) : null}
                  {entry.supportedCount > 0 ? (
                    <Badge variant="secondary">{entry.supportedCount} ready</Badge>
                  ) : null}
                  {entry.approvedCount > 0 ? (
                    <Badge variant="success">{entry.approvedCount} approved</Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs theme-text-faint sm:grid-cols-2">
                <span>{entry.totalRows} total rows</span>
                <span>{entry.sectionIds.length} sections</span>
                <span>{entry.needsSourceCount} need source</span>
                <span>{entry.needsReviewCount} need review</span>
              </div>
              <p className="mt-3 text-xs theme-text-faint">Updated {formatUpdatedAt(entry.updatedAt)}</p>
            </button>
          );
        })}
      </div>
      </EditorPanelBody>
    </EditorPanel>
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
          valueClassName="text-cyan-200"
        />
        <SummaryMetric
          label="Approved"
          value={selectedSummary.approvedCount}
          valueClassName="text-emerald-200"
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

export function CitationChecklistPanel({ checklist }: { checklist: CitationReviewChecklistItem[] }) {
  return (
    <EditorPanel>
      <EditorPanelHeader icon="lucide:clipboard-check" title="Review checklist" />
      <EditorPanelBody>
      <div className="grid gap-3 md:grid-cols-2">
        {checklist.map((item) => (
          <div
            key={item.id}
            className={`rounded-xl border p-3 ${
              item.tone === "complete"
                ? "border-emerald-400/25 bg-emerald-500/8"
                : item.tone === "attention"
                  ? "border-rose-400/25 bg-rose-500/10"
                  : "border-amber-400/20 bg-amber-500/10"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                icon={
                  item.tone === "complete"
                    ? "lucide:badge-check"
                    : item.tone === "attention"
                      ? "lucide:triangle-alert"
                      : "lucide:clock-3"
                }
                size={16}
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
          <Badge className={CITATION_SEVERITY_META[row.severity].className}>
            {CITATION_SEVERITY_META[row.severity].label}
          </Badge>
          <Badge className={CITATION_STATUS_META[row.status].className}>
            {CITATION_STATUS_META[row.status].label}
          </Badge>
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
        <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Snippet</p>
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
              className="rounded-xl border border-[color:var(--editor-panel-border)] bg-slate-950/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium theme-text-primary">{support.sourceName}</p>
                <Badge variant="secondary">{support.referenceId}</Badge>
                {support.sourceType ? <Badge variant="secondary">{support.sourceType}</Badge> : null}
                {support.quality ? <Badge variant="secondary">{support.quality}</Badge> : null}
              </div>
              <p className="mt-2 text-sm leading-6 theme-text-secondary">{support.supportingQuote}</p>
              <p className="mt-2 text-sm theme-text-faint">{support.rationale}</p>
            </div>
          ))}
        </div>
      ) : null}

      {(row.diagnostics?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-2">
          {(row.diagnostics ?? []).map((diagnostic, index) => (
            <div
              key={`${row.claimKey}-diagnostic-${index}`}
              className={`rounded-xl border px-3 py-2 text-sm ${
                diagnostic.severity === "error"
                  ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                  : "border-amber-400/20 bg-amber-500/10 text-amber-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  icon={diagnostic.severity === "error" ? "lucide:triangle-alert" : "lucide:badge-alert"}
                  size={15}
                />
                <span className="font-medium">{diagnostic.code}</span>
              </div>
              <p className="mt-1">{diagnostic.message}</p>
            </div>
          ))}
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
