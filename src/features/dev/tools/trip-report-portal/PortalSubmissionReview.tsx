"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionNotice,
  CodeSurface,
  EditorActionGroup,
  EditorField,
  EditorNotice,
  EditorPanel,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import type {
  DataTripReportImportPayload,
  TripReportSubmissionRow,
  TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";

/**
 * The intake queue's review surface, unchanged in capability from the tool the
 * portal replaces: status transitions, the promotion preview, the byline claim
 * adjudication, and the stored review note. It now opens from a row in the same
 * corpus list as a published report rather than from a separate queue screen.
 */

const STATUS_LABELS: Record<TripReportSubmissionStatus, string> = {
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

const STATUS_TONE: Record<TripReportSubmissionStatus, EditorStatusPillTone> = {
  submitted: "info",
  reviewing: "caution",
  accepted: "success",
  exported: "success",
  rejected: "danger",
  spam: "danger",
};

export type PromotionAttribution = {
  profileKey: string;
  confirmAuthorNameClaim: boolean;
};

/** Every write this panel can start; the clicked control shows its own busy label. */
type PendingAction = TripReportSubmissionStatus | "preview" | "publish";

const DEFAULT_NOTES: Record<TripReportSubmissionStatus, string> = {
  submitted: "Returned to the queue",
  reviewing: "Review started",
  accepted: "Accepted",
  rejected: "Rejected",
  spam: "Marked as spam",
  exported: "Published",
};

export function PortalSubmissionReview({
  busy,
  feedback,
  onClose,
  onDismissFeedback,
  onNavigate,
  onPromotion,
  onStatusChange,
  promotionPayload,
  queuePosition,
  submission,
}: {
  busy: boolean;
  feedback: { tone: "success" | "danger"; message: string } | null;
  onClose: () => void;
  onDismissFeedback: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onPromotion: (publish: boolean, attribution: PromotionAttribution) => void;
  onStatusChange: (status: TripReportSubmissionStatus, notes: string) => void;
  promotionPayload: DataTripReportImportPayload | null;
  /** Where this row sits in the list as painted; `index` is -1 once it has filtered out. */
  queuePosition: { index: number; total: number };
  submission: TripReportSubmissionRow;
}) {
  const [profileKey, setProfileKey] = useState("");
  const [confirmAuthorNameClaim, setConfirmAuthorNameClaim] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const { confirm, dialog } = useConfirm();

  const attribution: PromotionAttribution = { profileKey, confirmAuthorNameClaim };
  const canPromote = submission.status === "accepted";
  const validTargets = STATUS_TRANSITIONS[submission.status] ?? [];
  const subject = submission.report.subject;
  const substanceNames = Array.from(new Set(submission.substance_names));
  // Only the write in flight shows a busy label; the flag resets with it.
  const active = busy ? pending : null;

  const canGoBack = queuePosition.index !== 0 && queuePosition.total > 0;
  const canGoForward =
    queuePosition.total > 0 &&
    (queuePosition.index === -1 || queuePosition.index < queuePosition.total - 1);

  function decide(status: TripReportSubmissionStatus) {
    setPending(status);
    onStatusChange(status, note.trim() || DEFAULT_NOTES[status]);
  }

  function promote(publish: boolean) {
    setPending(publish ? "publish" : "preview");
    onPromotion(publish, attribution);
  }

  function actionLabel(action: PendingAction, idle: string, working: string) {
    return active === action ? working : idle;
  }

  return (
    <EditorPanel variant="default" className="flex min-h-0 flex-col">
      {dialog}
      <header className="theme-portal-rule sticky top-0 z-10 space-y-2 border-b px-5 py-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <h3 className="theme-accent-heading min-w-0 flex-1 font-display text-xl font-semibold">
            {submission.title}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canGoBack}
              onClick={() => onNavigate(-1)}
              aria-label="Previous in list"
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canGoForward}
              onClick={() => onNavigate(1)}
              aria-label="Next in list"
            >
              Next
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close review">
              Close
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone={STATUS_TONE[submission.status]}>
            {STATUS_LABELS[submission.status]}
          </EditorStatusPill>
          <span className="theme-text-muted text-xs">
            {submission.author_name} · {substanceNames.join(", ") || "No substances"}
          </span>
          <span className="text-dose-text-ghost font-mono text-[11px]">
            submitted {formatDate(submission.created_at) ?? "unknown"}
          </span>
          {queuePosition.index !== -1 ? (
            <>
              <span className="flex-1" />
              <span className="text-dose-text-ghost font-mono text-[11px] tabular-nums">
                {queuePosition.index + 1} of {queuePosition.total} in list
              </span>
            </>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {feedback ? (
          <ActionNotice tone={feedback.tone} onDismiss={onDismissFeedback}>
            {feedback.message}
          </ActionNotice>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Metadata label="Trip date" value={subject.trip_date} />
          <Metadata label="Setting" value={subject.setting} />
          <Metadata label="Age" value={subject.age} />
          <Metadata label="Gender" value={subject.gender} />
          <Metadata label="Height" value={subject.height} />
          <Metadata label="Weight" value={subject.weight} />
          <Metadata label="Medications" value={subject.medications} />
          <Metadata label="May contact" value={submission.may_contact ? "Yes" : "No"} />
          <Metadata label="Contact email" value={submission.contact_email} />
          <Metadata label="Publish consent" value={submission.publish_consent ? "Yes" : "No"} />
          <Metadata label="Age confirmed" value={submission.age_confirmed ? "Yes" : "No"} />
          <Metadata
            label="Tags"
            value={submission.report.tags.length > 0 ? submission.report.tags.join(", ") : undefined}
          />
        </div>

        {submission.report.substances.length > 0 ? (
          <section>
            <SectionHeading>Substances</SectionHeading>
            <ul className="mt-1.5 space-y-1">
              {submission.report.substances.map((substance, index) => (
                <li key={index} className="theme-text-secondary text-sm">
                  <span className="theme-text-primary font-medium">{substance.name}</span>
                  {substance.dose || substance.roa
                    ? ` · ${[substance.dose, substance.roa].filter(Boolean).join(", ")}`
                    : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="space-y-4">
          <Narrative label="Introduction" value={submission.report.introduction} />
          <Timeline label="Onset" entries={submission.report.onset} />
          <Timeline label="Peak" entries={submission.report.peak} />
          <Timeline label="Offset" entries={submission.report.offset} />
          <Narrative label="Conclusion" value={submission.report.conclusion} />
        </div>

        <section>
          <SectionHeading>Review notes</SectionHeading>
          {submission.reviewed_by || submission.reviewed_at ? (
            <p className="theme-text-faint mt-1 text-xs">
              {[formatReviewerIdentity(submission.reviewed_by), formatDate(submission.reviewed_at)].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {submission.review_notes ? (
            <p className="theme-text-secondary mt-1.5 whitespace-pre-line text-sm leading-6">
              {submission.review_notes}
            </p>
          ) : (
            <p className="text-dose-text-ghost mt-1.5 text-sm">No review notes yet.</p>
          )}
        </section>

        {submission.status === "exported" ? (
          <EditorNotice
            notice={{
              tone: "success",
              title: "Published",
              message:
                "This submission is live as a public trip report. Edit or remove it from the Published bucket; the submission itself no longer changes.",
            }}
          />
        ) : (
          <EditorPanel variant="toolbar" className="space-y-3 p-3">
            <EditorField
              label="Decision note"
              description="Stored with the decision you make next. Leave it empty to record only the outcome."
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={note}
                  placeholder="Why this decision"
                  disabled={busy}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
            </EditorField>

            <EditorToolbar label="Submission review actions" variant="split">
              <EditorActionGroup label="Review decision">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !validTargets.includes("reviewing")}
                  aria-busy={active === "reviewing" || undefined}
                  onClick={() => decide("reviewing")}
                >
                  {actionLabel(
                    "reviewing",
                    submission.status === "submitted" ? "Start review" : "Reopen review",
                    "Updating…",
                  )}
                </Button>
                <Button
                  type="button"
                  variant="success"
                  disabled={busy || !validTargets.includes("accepted")}
                  aria-busy={active === "accepted" || undefined}
                  onClick={() => decide("accepted")}
                >
                  {actionLabel("accepted", "Accept", "Accepting…")}
                </Button>
                <Button
                  type="button"
                  variant="ghostDestructive"
                  disabled={busy || !validTargets.includes("rejected")}
                  aria-busy={active === "rejected" || undefined}
                  onClick={() =>
                    confirm({
                      title: "Reject this submission?",
                      description: `"${submission.title}" leaves the review queue. You can reopen it later from the All bucket; the author is not notified.`,
                      confirmLabel: "Reject",
                      destructive: true,
                      onConfirm: () => decide("rejected"),
                    })
                  }
                >
                  {actionLabel("rejected", "Reject", "Rejecting…")}
                </Button>
              </EditorActionGroup>
              <EditorActionGroup label="Spam" align="end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || !validTargets.includes("spam")}
                  aria-busy={active === "spam" || undefined}
                  onClick={() =>
                    confirm({
                      title: "Mark as spam?",
                      description: `"${submission.title}" is filed as spam and leaves the review queue. Use this for junk, not for reports you disagree with; a wrong call can be reopened from the All bucket.`,
                      confirmLabel: "Mark as spam",
                      destructive: true,
                      onConfirm: () => decide("spam"),
                    })
                  }
                >
                  {actionLabel("spam", "Mark as spam", "Marking…")}
                </Button>
              </EditorActionGroup>
            </EditorToolbar>
          </EditorPanel>
        )}

        {canPromote ? (
          <EditorPanel variant="toolbar" className="space-y-3 p-3">
            <EditorField
              label="Publish as a public trip report"
              description="Attribution needs an existing contributor profile key. Leave it empty to publish under the submitted byline."
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  className="md:w-64"
                  value={profileKey}
                  placeholder="Profile key (optional)"
                  disabled={busy}
                  onChange={(event) => setProfileKey(event.target.value)}
                />
              )}
            </EditorField>
            <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
              <input
                type="checkbox"
                checked={confirmAuthorNameClaim}
                disabled={busy}
                onChange={(event) => setConfirmAuthorNameClaim(event.target.checked)}
                className="theme-replication-checkbox"
              />
              Publish without attribution even though the byline matches a contributor
            </label>
            <EditorToolbar label="Publish actions" variant="compact">
              <EditorActionGroup label="Publish">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-busy={active === "preview" || undefined}
                  onClick={() => promote(false)}
                >
                  {actionLabel("preview", "Preview publish", "Building preview…")}
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  disabled={busy}
                  aria-busy={active === "publish" || undefined}
                  onClick={() =>
                    confirm({
                      title: "Publish to the public site?",
                      description: `"${submission.title}" becomes a public trip report. The submission can no longer change status; the published report is edited or removed from the Published bucket.`,
                      confirmLabel: "Publish",
                      onConfirm: () => promote(true),
                    })
                  }
                >
                  {actionLabel("publish", "Publish", "Publishing…")}
                </Button>
              </EditorActionGroup>
            </EditorToolbar>
          </EditorPanel>
        ) : null}

        {promotionPayload ? (
          <CodeSurface
            title="Promotion payload"
            language="json"
            maxHeight={384}
            value={JSON.stringify(promotionPayload, null, 2)}
          />
        ) : null}
      </div>
    </EditorPanel>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="theme-accent-heading text-sm font-semibold">{children}</h4>;
}

function Metadata({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="theme-text-primary mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function Narrative({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <section>
      <SectionHeading>{label}</SectionHeading>
      <p className="theme-text-secondary mt-1.5 whitespace-pre-line text-sm leading-6">{value}</p>
    </section>
  );
}

function Timeline({
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
      <SectionHeading>{label}</SectionHeading>
      <div className="mt-1.5 space-y-3">
        {entries.map((entry, index) => (
          <div key={index}>
            {index > 0 ? <div className="theme-gradient-divider mb-3 h-px" /> : null}
            {entry.time ? (
              <p className="theme-text-faint text-xs font-semibold">{entry.time}</p>
            ) : null}
            <p className="theme-text-secondary text-sm leading-6">{entry.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
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
