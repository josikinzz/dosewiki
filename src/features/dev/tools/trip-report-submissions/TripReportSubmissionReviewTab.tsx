"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type {
  ConvexTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import {
  EditorNotice,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
} from "@/features/dev/components";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

const QUEUE_STATUSES: Array<TripReportSubmissionStatus | "all"> = [
  "all",
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "spam",
  "exported",
];

export function TripReportSubmissionReviewTab() {
  const [submissions, setSubmissions] = useState<TripReportSubmissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TripReportSubmissionStatus | "all">("all");
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
          title="Trip Report Submissions"
          description="Private Convex intake queue for public trip report drafts."
        />
        <EditorPanelBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUEUE_STATUSES.map((status) => (
              <Button
                key={status}
                type="button"
                variant={statusFilter === status ? "pillActive" : "pill"}
                size="pill"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
          {loadState.status === "loading" ? (
            <div className="theme-text-muted flex items-center gap-2 text-sm">
              <Icon icon="lucide:loader-2" size={16} className="animate-spin" />
              Loading submissions...
            </div>
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
          <EditorPanelHeader title="Queue" description={`${submissions.length} loaded`} />
          <EditorPanelBody className="space-y-3">
            {submissions.length === 0 && loadState.status === "ready" ? (
              <p className="theme-text-muted text-sm">No private submissions match this filter.</p>
            ) : null}
            {submissions.map((submission) => (
              <button
                key={submission.id}
                type="button"
                onClick={() => {
                  setSelectedId(submission.id);
                  setPromotionPayload(null);
                }}
                className="w-full rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-3 text-left transition hover:border-[var(--theme-border-strong)]"
                data-active={selected?.id === submission.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="theme-text-primary text-sm font-semibold">{submission.title}</p>
                    <p className="theme-text-faint mt-1 text-xs">{submission.author_name}</p>
                  </div>
                  <StatusPill status={submission.status} />
                </div>
                <p className="theme-text-muted mt-2 text-xs">{submission.substance_names.join(", ") || "No substances"}</p>
              </button>
            ))}
          </EditorPanelBody>
        </EditorPanel>

        <EditorPanel>
          <EditorPanelHeader title="Review" description={selected ? selected.id : "No submission selected"} />
          <EditorPanelBody>
            {selected ? (
              <SubmissionDetail
                submission={selected}
                promotionPayload={promotionPayload}
                onStatusChange={updateStatus}
                onPromotion={runPromotion}
              />
            ) : (
              <p className="theme-text-muted text-sm">Select a submission to review.</p>
            )}
          </EditorPanelBody>
        </EditorPanel>
      </div>
    </div>
  );
}

async function loadQueue(
  status: TripReportSubmissionStatus | "all",
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
          <h3 className="theme-text-primary text-xl font-semibold">{submission.title}</h3>
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

      <div className="flex flex-wrap gap-2">
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
        <Button type="button" variant="outline" onClick={() => onPromotion(true)} disabled={!canPromote}>
          Publish
        </Button>
      </div>

      {promotionPayload ? (
        <div>
          <h4 className="theme-text-primary mb-2 text-sm font-semibold">Promotion payload</h4>
          <pre className="theme-text-secondary max-h-96 overflow-auto rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-4 text-xs">
            {JSON.stringify(promotionPayload, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: TripReportSubmissionStatus }) {
  const tone = status === "accepted" || status === "exported" ? "success" : status === "spam" || status === "rejected" ? "danger" : "info";
  return <EditorStatusPill tone={tone}>{status}</EditorStatusPill>;
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--theme-border-subtle)] p-3">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="theme-text-primary mt-1 text-sm">{value}</p>
    </div>
  );
}

function NarrativeBlock({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <section>
      <h4 className="theme-text-primary text-sm font-semibold">{label}</h4>
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
      <h4 className="theme-text-primary text-sm font-semibold">{label}</h4>
      <div className="mt-2 space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="rounded-lg border border-[var(--theme-border-subtle)] p-3">
            {entry.time ? <p className="theme-text-faint text-xs font-semibold">{entry.time}</p> : null}
            <p className="theme-text-secondary text-sm leading-6">{entry.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
