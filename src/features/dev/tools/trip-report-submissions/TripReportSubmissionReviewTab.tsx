"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ConvexTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import {
  ActionNotice,
  EditorActionGroup,
  CodeSurface,
  EditorNotice,
  EditorPanel,
  EditorListItem,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type EditorStatusPillTone,
} from "@/features/dev/components";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type ActionFeedback = { tone: "success" | "danger"; message: string };

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

// Mirrors VALID_TRANSITIONS in src/features/reports/submissions/tripReportSubmissions.ts
// (not imported: that module is server-only via node:crypto).
const STATUS_TRANSITIONS: Record<TripReportSubmissionStatus, TripReportSubmissionStatus[]> = {
  submitted: ["reviewing", "accepted", "rejected", "spam"],
  reviewing: ["accepted", "rejected", "spam", "submitted"],
  accepted: ["reviewing", "rejected"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
  exported: [],
};

const REVIEW_SECTION_ID = "trip-report-review-section";

export function TripReportSubmissionReviewTab() {
  const [submissions, setSubmissions] = useState<TripReportSubmissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
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

    setActionFeedback(null);
    try {
      const response = await fetch(`/api/trip-report-submissions/${selected.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to update submission.",
        });
        return;
      }

      setActionFeedback({
        tone: "success",
        message: `Moved "${selected.title}" to ${STATUS_LABELS[status].toLowerCase()}.`,
      });
      setPromotionPayload(null);
      await loadQueue(statusFilter, setSubmissions, setSelectedId, setLoadState, selected.id);
    } catch {
      setActionFeedback({ tone: "danger", message: "Network error while updating the submission." });
    }
  }

  async function runPromotion(publish: boolean) {
    if (!selected) {
      return;
    }

    setActionFeedback(null);
    try {
      const response = await fetch(`/api/trip-report-submissions/${selected.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionFeedback({
          tone: "danger",
          message: typeof payload.error === "string" ? payload.error : "Unable to promote submission.",
        });
        return;
      }

      setPromotionPayload(payload.payload ?? null);
      setActionFeedback({
        tone: "success",
        message: publish ? "Submission published to public trip reports." : "Promotion preview built.",
      });
      if (publish) {
        await loadQueue(statusFilter, setSubmissions, setSelectedId, setLoadState, selected.id);
      }
    } catch {
      setActionFeedback({ tone: "danger", message: "Network error while promoting the submission." });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <EditorSection
        icon="lucide:inbox"
        title="Trip Report Submissions"
        description="Private Convex intake queue for public trip report drafts."
      >
        {loadState.status === "error" ? (
          <EditorNotice notice={{ tone: "danger", title: "Unable to load submissions", message: loadState.message }} />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Queue"
          description={`${submissions.length} loaded`}
          delay={0.05}
          actions={(
            <>
              <label htmlFor="trip-report-submission-filter" className="sr-only">
                Queue filter
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as QueueFilter)}>
                <SelectTrigger id="trip-report-submission-filter" selectSize="compact" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUEUE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        >
          {loadState.status === "loading" ? (
            <EditorStatusPill tone="info" loading live>
              Loading submissions...
            </EditorStatusPill>
          ) : null}
          {submissions.length === 0 && loadState.status === "ready" ? (
            <EmptyStateSurface padding="md" radius="lg" className="theme-text-muted text-sm">
              {statusFilter === "all"
                ? "No submissions in the queue yet."
                : `No ${STATUS_LABELS[statusFilter].toLowerCase()} submissions match this filter.`}
            </EmptyStateSurface>
          ) : null}
          {submissions.length > 0 ? (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <EditorListRow
                  key={submission.id}
                  submission={submission}
                  active={selected?.id === submission.id}
                  onSelect={() => {
                    setSelectedId(submission.id);
                    setPromotionPayload(null);
                    setActionFeedback(null);
                    scrollReviewIntoViewOnSmallScreens();
                  }}
                />
              ))}
            </div>
          ) : null}
        </EditorSection>

        <EditorSection
          id={REVIEW_SECTION_ID}
          icon="lucide:file-search"
          title="Review"
          description={
            selected
              ? `${selected.author_name} · submitted ${formatDate(selected.created_at) ?? "unknown date"}`
              : "No submission selected"
          }
          delay={0.1}
        >
          {selected ? (
            <SubmissionDetail
              submission={selected}
              promotionPayload={promotionPayload}
              actionFeedback={actionFeedback}
              onDismissFeedback={() => setActionFeedback(null)}
              onStatusChange={updateStatus}
              onPromotion={runPromotion}
            />
          ) : (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              Select a submission to review.
            </EmptyStateSurface>
          )}
        </EditorSection>
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
  try {
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
  } catch {
    setLoadState({ status: "error", message: "Network error while loading submissions." });
  }
}

function scrollReviewIntoViewOnSmallScreens() {
  if (typeof window === "undefined" || window.innerWidth >= 1024) {
    return;
  }
  document.getElementById(REVIEW_SECTION_ID)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
  actionFeedback,
  onDismissFeedback,
  promotionPayload,
  onPromotion,
  onStatusChange,
  submission,
}: {
  actionFeedback: ActionFeedback | null;
  onDismissFeedback: () => void;
  promotionPayload: ConvexTripReportImportPayload | null;
  onPromotion: (publish: boolean) => void;
  onStatusChange: (status: TripReportSubmissionStatus, notes: string) => void;
  submission: TripReportSubmissionRow;
}) {
  const canPromote = submission.status === "accepted";
  const validTargets = STATUS_TRANSITIONS[submission.status] ?? [];
  const subject = submission.report.subject;
  const tags = submission.report.tags;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="theme-accent-heading text-xl font-semibold">{submission.title}</h3>
          <p className="theme-text-muted mt-1 text-sm">
            {submission.author_name} · {submission.substance_names.join(", ") || "No substances"}
          </p>
        </div>
        <StatusPill status={submission.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <MetadataItem label="Submitted" value={formatDate(submission.created_at)} />
        <MetadataItem label="Trip date" value={subject.trip_date} />
        <MetadataItem label="Setting" value={subject.setting} />
        <MetadataItem label="Age" value={subject.age} />
        <MetadataItem label="Gender" value={subject.gender} />
        <MetadataItem label="Height" value={subject.height} />
        <MetadataItem label="Weight" value={subject.weight} />
        <MetadataItem label="Medications" value={subject.medications} />
        <MetadataItem label="May contact" value={submission.may_contact ? "Yes" : "No"} />
        <MetadataItem label="Contact email" value={submission.contact_email} />
        <MetadataItem label="Publish consent" value={submission.publish_consent ? "Yes" : "No"} />
        <MetadataItem label="Age confirmed" value={submission.age_confirmed ? "Yes" : "No"} />
        <MetadataItem label="Tags" value={tags.length > 0 ? tags.join(", ") : undefined} />
      </div>

      {submission.report.substances.length > 0 ? (
        <section>
          <h4 className="theme-accent-heading text-sm font-semibold">Substances</h4>
          <ul className="mt-2 space-y-1">
            {submission.report.substances.map((substance, index) => (
              <li key={index} className="theme-text-secondary text-sm">
                <span className="theme-text-primary font-medium">{substance.name}</span>
                {substance.dose || substance.roa
                  ? ` — ${[substance.dose, substance.roa].filter(Boolean).join(", ")}`
                  : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {submission.review_notes || submission.reviewed_by ? (
        <section>
          <h4 className="theme-accent-heading text-sm font-semibold">Review notes</h4>
          {submission.reviewed_by || submission.reviewed_at ? (
            <p className="theme-text-faint mt-1 text-xs">
              {[submission.reviewed_by, formatDate(submission.reviewed_at)].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {submission.review_notes ? (
            <p className="theme-text-secondary mt-2 whitespace-pre-line text-sm leading-6">
              {submission.review_notes}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="space-y-4">
        <NarrativeBlock label="Introduction" value={submission.report.introduction} />
        <TimelineBlock label="Onset" entries={submission.report.onset} />
        <TimelineBlock label="Peak" entries={submission.report.peak} />
        <TimelineBlock label="Offset" entries={submission.report.offset} />
        <NarrativeBlock label="Conclusion" value={submission.report.conclusion} />
      </div>

      <div className="space-y-3">
        {submission.status === "exported" ? (
          <EditorNotice
            notice={{
              tone: "success",
              title: "Exported",
              message: "This submission has been published to the public trip reports and can no longer change status.",
            }}
          />
        ) : (
          <EditorPanel variant="toolbar" className="p-3">
            <EditorToolbar label="Submission review actions" variant="split">
              <EditorActionGroup label="Review decision">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!validTargets.includes("reviewing")}
                  onClick={() => onStatusChange("reviewing", "Review started.")}
                >
                  Reviewing
                </Button>
                <Button
                  type="button"
                  variant="success"
                  disabled={!validTargets.includes("accepted")}
                  onClick={() => onStatusChange("accepted", "Accepted for Convex promotion.")}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!validTargets.includes("rejected")}
                  onClick={() => onStatusChange("rejected", "Rejected after editorial review.")}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!validTargets.includes("spam")}
                  onClick={() => onStatusChange("spam", "Marked as spam.")}
                >
                  Spam
                </Button>
              </EditorActionGroup>
              <EditorActionGroup label="Promotion" align="end" separatorBefore>
                <Button type="button" variant="outline" onClick={() => onPromotion(false)} disabled={!canPromote}>
                  Preview publish
                </Button>
                <Button
                  type="button"
                  variant={canPromote ? "accent" : "outline"}
                  onClick={() => onPromotion(true)}
                  disabled={!canPromote}
                >
                  Publish
                </Button>
              </EditorActionGroup>
            </EditorToolbar>
            <p className="theme-text-faint mt-3 text-xs">
              Promotion is available after the submission is accepted; preview builds the Convex payload before publishing.
            </p>
          </EditorPanel>
        )}
        {actionFeedback ? (
          <ActionNotice tone={actionFeedback.tone} onDismiss={onDismissFeedback}>
            {actionFeedback.message}
          </ActionNotice>
        ) : null}
      </div>

      {promotionPayload ? (
        <CodeSurface
          title="Promotion payload"
          language="json"
          maxHeight={384}
          value={JSON.stringify(promotionPayload, null, 2)}
        />
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

function MetadataItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
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
      <div className="mt-2 space-y-3">
        {entries.map((entry, index) => (
          <div key={index}>
            {index > 0 ? (
              <div className="theme-gradient-divider mb-3 h-px" />
            ) : null}
            {entry.time ? <p className="theme-text-faint text-xs font-semibold">{entry.time}</p> : null}
            <p className="theme-text-secondary text-sm leading-6">{entry.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
