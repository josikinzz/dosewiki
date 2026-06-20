"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  EmptyStateSurface,
  NestedContentCard,
} from "@/components/ui/surface";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import type {
  ConvexTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import {
  CodeSurface,
  EditorNotice,
  EditorPanel,
  EditorListItem,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
  EditorToolbar,
  type EditorStatusPillTone,
} from "@/features/dev/components";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type QueueFilter = TripReportSubmissionStatus | "all";

const QUEUE_STATUSES: QueueFilter[] = [
  "all",
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "spam",
  "exported",
];

const STATUS_LABELS: Record<QueueFilter, string> = {
  all: "All",
  submitted: "Submitted",
  reviewing: "Reviewing",
  accepted: "Accepted",
  rejected: "Rejected",
  spam: "Spam",
  exported: "Exported",
};

const QUEUE_FILTER_TABS: PublicSegmentedTabItem<QueueFilter>[] = QUEUE_STATUSES.map(
  (status) => ({ id: status, label: STATUS_LABELS[status] }),
);

export function TripReportSubmissionReviewTab() {
  const [submissions, setSubmissions] = useState<TripReportSubmissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [promotionPayload, setPromotionPayload] = useState<ConvexTripReportImportPayload | null>(null);

  useEffect(() => {
    void loadQueue(statusFilter, setSubmissions, setSelectedId, setLoadState);
  }, [statusFilter]);

  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? submissions[0] ?? null,
    [selectedId, submissions],
  );

  async function updateStatus(status: TripReportSubmissionStatus, notes: string) {
    if (!selected) {
      return;
    }

    setActionMessage(null);
    const response = await fetch(`/api/trip-report-submissions/${selected.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionMessage(typeof payload.error === "string" ? payload.error : "Unable to update submission.");
      return;
    }

    setActionMessage(`Moved ${selected.id} to ${status}.`);
    setPromotionPayload(null);
    await loadQueue(statusFilter, setSubmissions, setSelectedId, setLoadState, selected.id);
  }

  async function runPromotion(publish: boolean) {
    if (!selected) {
      return;
    }

    setActionMessage(null);
    const response = await fetch(`/api/trip-report-submissions/${selected.id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionMessage(typeof payload.error === "string" ? payload.error : "Unable to promote submission.");
      return;
    }

    setPromotionPayload(payload.payload ?? null);
    setActionMessage(publish ? "Submission published to public trip reports." : "Promotion preview built.");
    if (publish) {
      await loadQueue(statusFilter, setSubmissions, setSelectedId, setLoadState, selected.id);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <EditorPanel>
        <EditorPanelHeader
          icon="lucide:inbox"
          title="Trip Report Submissions"
          description="Private Convex intake queue for public trip report drafts."
        />
        <EditorPanelBody className="space-y-4">
          <PublicSegmentedTabs<QueueFilter>
            ariaLabel="Filter submissions by status"
            className="justify-start"
            value={statusFilter}
            onValueChange={setStatusFilter}
            items={QUEUE_FILTER_TABS}
          />
          {loadState.status === "loading" ? (
            <EditorStatusPill tone="info" loading live>
              Loading submissions...
            </EditorStatusPill>
          ) : null}
          {loadState.status === "error" ? (
            <EditorNotice notice={{ tone: "danger", title: "Unable to load submissions", message: loadState.message }} />
          ) : null}
          {actionMessage ? (
            <EditorNotice notice={{ tone: "info", title: "Submission action", message: actionMessage }} />
          ) : null}
        </EditorPanelBody>
      </EditorPanel>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
        <EditorPanel>
          <EditorPanelHeader icon="lucide:list" title="Queue" description={`${submissions.length} loaded`} />
          <EditorPanelBody className="space-y-3">
            {submissions.length === 0 && loadState.status === "ready" ? (
              <EmptyStateSurface padding="md" radius="lg" className="theme-text-muted text-sm">
                No private submissions match this filter.
              </EmptyStateSurface>
            ) : null}
            {submissions.map((submission) => (
              <EditorListRow
                key={submission.id}
                submission={submission}
                active={selected?.id === submission.id}
                onSelect={() => {
                  setSelectedId(submission.id);
                  setPromotionPayload(null);
                }}
              />
            ))}
          </EditorPanelBody>
        </EditorPanel>

        <EditorPanel>
          <EditorPanelHeader icon="lucide:file-search" title="Review" description={selected ? selected.id : "No submission selected"} />
          <EditorPanelBody>
            {selected ? (
              <SubmissionDetail
                submission={selected}
                promotionPayload={promotionPayload}
                onStatusChange={updateStatus}
                onPromotion={runPromotion}
              />
            ) : (
              <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
                Select a submission to review.
              </EmptyStateSurface>
            )}
          </EditorPanelBody>
        </EditorPanel>
      </div>
    </div>
  );
}

async function loadQueue(
  status: QueueFilter,
  setSubmissions: (submissions: TripReportSubmissionRow[]) => void,
  setSelectedId: (id: string | null) => void,
  setLoadState: (state: LoadState) => void,
  preferredId?: string,
) {
  setLoadState({ status: "loading" });
  const suffix = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  const response = await fetch(`/api/trip-report-submissions/queue${suffix}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    setLoadState({
      status: "error",
      message: typeof payload.error === "string" ? payload.error : "Unable to load submissions.",
    });
    return;
  }

  const nextSubmissions = Array.isArray(payload.submissions) ? payload.submissions : [];
  setSubmissions(nextSubmissions);
  setSelectedId(preferredId && nextSubmissions.some((submission) => submission.id === preferredId)
    ? preferredId
    : nextSubmissions[0]?.id ?? null);
  setLoadState({ status: "ready" });
}

function EditorListRow({
  active,
  onSelect,
  submission,
}: {
  active: boolean;
  onSelect: () => void;
  submission: TripReportSubmissionRow;
}) {
  return (
    <EditorListItem active={active} onSelect={onSelect} className="items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className={`block truncate text-sm font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>
              {submission.title}
            </span>
            <span className="theme-text-faint mt-1 block truncate text-xs">{submission.author_name}</span>
          </span>
          <StatusPill status={submission.status} />
        </span>
        <span className="theme-text-muted block truncate text-xs">
          {submission.substance_names.join(", ") || "No substances"}
        </span>
      </span>
    </EditorListItem>
  );
}

function SubmissionDetail({
  promotionPayload,
  onPromotion,
  onStatusChange,
  submission,
}: {
  promotionPayload: ConvexTripReportImportPayload | null;
  onPromotion: (publish: boolean) => void;
  onStatusChange: (status: TripReportSubmissionStatus, notes: string) => void;
  submission: TripReportSubmissionRow;
}) {
  const canPromote = submission.status === "accepted";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="theme-accent-heading text-xl font-semibold">{submission.title}</h3>
          <p className="theme-text-muted mt-1 text-sm">
            {submission.author_name} · {submission.substance_names.join(", ") || "No substances"}
          </p>
        </div>
        <StatusPill status={submission.status} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetadataItem label="May contact" value={submission.may_contact ? "Yes" : "No"} />
        <MetadataItem label="Publish consent" value={submission.publish_consent ? "Yes" : "No"} />
        <MetadataItem label="Age confirmed" value={submission.age_confirmed ? "Yes" : "No"} />
      </div>

      <div className="space-y-4">
        <NarrativeBlock label="Introduction" value={submission.report.introduction} />
        <TimelineBlock label="Onset" entries={submission.report.onset} />
        <TimelineBlock label="Peak" entries={submission.report.peak} />
        <TimelineBlock label="Offset" entries={submission.report.offset} />
        <NarrativeBlock label="Conclusion" value={submission.report.conclusion} />
      </div>

      <EditorToolbar label="Submission review actions">
        <Button type="button" variant="outline" onClick={() => onStatusChange("reviewing", "Review started.")}>
          Reviewing
        </Button>
        <Button type="button" variant="success" onClick={() => onStatusChange("accepted", "Accepted for Convex promotion.")}>
          Accept
        </Button>
        <Button type="button" variant="destructive" onClick={() => onStatusChange("rejected", "Rejected after editorial review.")}>
          Reject
        </Button>
        <Button type="button" variant="destructivePill" onClick={() => onStatusChange("spam", "Marked as spam.")}>
          Spam
        </Button>
        <Button type="button" variant="outline" onClick={() => onPromotion(false)} disabled={!canPromote}>
          Preview publish
        </Button>
        <Button type="button" variant="accent" onClick={() => onPromotion(true)} disabled={!canPromote}>
          Publish
        </Button>
      </EditorToolbar>

      {promotionPayload ? (
        <div className="space-y-2">
          <h4 className="theme-accent-heading text-sm font-semibold">Promotion payload</h4>
          <CodeSurface
            title="Convex import payload"
            language="json"
            maxHeight={384}
            value={JSON.stringify(promotionPayload, null, 2)}
          />
        </div>
      ) : null}
    </div>
  );
}

const STATUS_PILL_TONE: Record<TripReportSubmissionStatus, EditorStatusPillTone> = {
  submitted: "info",
  reviewing: "caution",
  accepted: "success",
  exported: "success",
  rejected: "danger",
  spam: "danger",
};

function StatusPill({ status }: { status: TripReportSubmissionStatus }) {
  const tone = STATUS_PILL_TONE[status] ?? "neutral";
  return (
    <EditorStatusPill tone={tone}>
      {STATUS_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <NestedContentCard padding="sm" radius="lg">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="theme-text-primary mt-1 text-sm">{value}</p>
    </NestedContentCard>
  );
}

function NarrativeBlock({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <section>
      <h4 className="theme-accent-heading text-sm font-semibold">{label}</h4>
      <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">{value}</p>
    </section>
  );
}

function TimelineBlock({
  entries,
  label,
}: {
  entries: TripReportSubmissionRow["report"]["onset"];
  label: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section>
      <h4 className="theme-accent-heading text-sm font-semibold">{label}</h4>
      <div className="mt-2 space-y-2">
        {entries.map((entry, index) => (
          <NestedContentCard key={index} padding="sm" radius="lg">
            {entry.time ? <p className="theme-text-faint text-xs font-semibold">{entry.time}</p> : null}
            <p className="theme-text-secondary text-sm leading-6">{entry.description}</p>
          </NestedContentCard>
        ))}
      </div>
    </section>
  );
}
