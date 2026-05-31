import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/SectionCard";
import { Icon } from "@/components/common/Icon";
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
    <SectionCard delay={0.05}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
            <Icon icon="lucide:list-checks" size={20} className="text-fuchsia-300" />
            Citation review queue
          </h2>
          <p className="mt-1 text-sm text-white/55">
            Evidence snippets, gap states, and reviewer decisions stay inside protected `/dev` routes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>
    </SectionCard>
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
    <SectionCard delay={0.1} className="h-fit">
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
              className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                selectedSlug === entry.slug
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/85">
                    {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                  </p>
                  <p className="mt-1 text-xs text-white/45">{entry.slug}</p>
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
              <div className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-2">
                <span>{entry.totalRows} total rows</span>
                <span>{entry.sectionIds.length} sections</span>
                <span>{entry.needsSourceCount} need source</span>
                <span>{entry.needsReviewCount} need review</span>
              </div>
              <p className="mt-3 text-xs text-white/40">Updated {formatUpdatedAt(entry.updatedAt)}</p>
            </button>
          );
        })}
      </div>
    </SectionCard>
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
    <SectionCard delay={0.15}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white/90">{articleTitle}</h3>
            <Badge variant="secondary">{selectedSummary.slug}</Badge>
          </div>
          <p className="mt-2 text-sm text-white/55">
            Review-only evidence rows, snippets, and reviewer decisions for this article.
          </p>
        </div>
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
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
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
    </SectionCard>
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName = "text-white/90",
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

export function CitationChecklistPanel({ checklist }: { checklist: CitationReviewChecklistItem[] }) {
  return (
    <SectionCard delay={0.2}>
      <div className="flex items-center gap-2">
        <Icon icon="lucide:clipboard-check" size={18} className="text-fuchsia-300" />
        <h3 className="text-lg font-semibold text-white/90">Review checklist</h3>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
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
              <p className="text-sm font-medium text-white/85">{item.label}</p>
            </div>
            <p className="mt-2 text-sm text-white/60">{item.detail}</p>
          </div>
        ))}
      </div>
    </SectionCard>
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
    <SectionCard delay={0.25}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white/90">
            {formatCitationSectionLabel(group.section)}
          </h3>
          <p className="mt-1 text-sm text-white/55">
            {group.rows.length} evidence row(s) for this section.
          </p>
        </div>
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
      </div>

      <div className="mt-4 space-y-3">
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
    </SectionCard>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/90">
            {row.claimText?.trim() || row.fieldPath || row.claimKey}
          </p>
          <p className="mt-1 text-xs text-white/45">{row.claimKey}</p>
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
        <p className="mt-3 text-xs text-white/50">Field path: {row.fieldPath}</p>
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
          <p className="mt-2 text-sm leading-6 text-white/80">{row.supportingSnippet}</p>
        </div>
      ) : null}

      {row.supportRationale ? (
        <p className="mt-3 text-sm text-white/65">{row.supportRationale}</p>
      ) : null}

      {(row.supports?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-3">
          {(row.supports ?? []).map((support, index) => (
            <div
              key={`${row.claimKey}-${support.referenceId}-${index}`}
              className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white/85">{support.sourceName}</p>
                <Badge variant="secondary">{support.referenceId}</Badge>
                {support.sourceType ? <Badge variant="secondary">{support.sourceType}</Badge> : null}
                {support.quality ? <Badge variant="secondary">{support.quality}</Badge> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/75">{support.supportingQuote}</p>
              <p className="mt-2 text-sm text-white/55">{support.rationale}</p>
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

      <div className="mt-4 flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}
