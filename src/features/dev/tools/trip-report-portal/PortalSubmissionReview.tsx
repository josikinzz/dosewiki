"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionNotice,
  CodeSurface,
  EditorActionGroup,
  EditorNotice,
  EditorPanel,
  EditorStatusPill,
  EditorToolbar,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import type {
  ConvexTripReportImportPayload,
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

export function PortalSubmissionReview({
  feedback,
  onClose,
  onDismissFeedback,
  onPromotion,
  onStatusChange,
  promotionPayload,
  submission,
}: {
  feedback: { tone: "success" | "danger"; message: string } | null;
  onClose: () => void;
  onDismissFeedback: () => void;
  onPromotion: (publish: boolean, attribution: PromotionAttribution) => void;
  onStatusChange: (status: TripReportSubmissionStatus, notes: string) => void;
  promotionPayload: ConvexTripReportImportPayload | null;
  submission: TripReportSubmissionRow;
}) {
  const [profileKey, setProfileKey] = useState("");
  const [confirmAuthorNameClaim, setConfirmAuthorNameClaim] = useState(false);
  const [note, setNote] = useState("");

  const attribution: PromotionAttribution = { profileKey, confirmAuthorNameClaim };
  const canPromote = submission.status === "accepted";
  const validTargets = STATUS_TRANSITIONS[submission.status] ?? [];
  const subject = submission.report.subject;

  return (
    <EditorPanel variant="default" className="flex min-h-0 flex-col">
      <header className="theme-portal-rule sticky top-0 z-10 space-y-2 border-b px-5 py-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <h3 className="theme-accent-heading min-w-0 flex-1 font-display text-xl font-semibold">
            {submission.title}
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close review">
            Close
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone={STATUS_TONE[submission.status]}>
            {STATUS_LABELS[submission.status]}
          </EditorStatusPill>
          <span className="theme-text-muted text-xs">
            {submission.author_name} · {submission.substance_names.join(", ") || "No substances"}
          </span>
          <span className="text-dose-text-ghost font-mono text-[11px]">
            submitted {formatDate(submission.created_at) ?? "unknown"}
          </span>
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
                    ? ` — ${[substance.dose, substance.roa].filter(Boolean).join(", ")}`
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
              title: "Exported",
              message:
                "This submission has been published to the public trip reports and can no longer change status.",
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
                  onClick={() => onStatusChange("reviewing", note.trim() || "Review started.")}
                >
                  Reviewing
                </Button>
                <Button
                  type="button"
                  variant="success"
                  disabled={!validTargets.includes("accepted")}
                  onClick={() =>
                    onStatusChange("accepted", note.trim() || "Accepted for Convex promotion.")
                  }
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!validTargets.includes("rejected")}
                  onClick={() =>
                    onStatusChange("rejected", note.trim() || "Rejected after editorial review.")
                  }
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!validTargets.includes("spam")}
                  onClick={() => onStatusChange("spam", note.trim() || "Marked as spam.")}
                >
                  Spam
                </Button>
              </EditorActionGroup>
              <EditorActionGroup label="Promotion" align="end" separatorBefore>
                <Input
                  aria-label="Attribute to contributor profile key"
                  className="w-44"
                  value={profileKey}
                  placeholder="Profile key (optional)"
                  disabled={!canPromote}
                  onChange={(event) => setProfileKey(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canPromote}
                  onClick={() => onPromotion(false, attribution)}
                >
                  Preview publish
                </Button>
                <Button
                  type="button"
                  variant={canPromote ? "accent" : "outline"}
                  disabled={!canPromote}
                  onClick={() => onPromotion(true, attribution)}
                >
                  Publish
                </Button>
              </EditorActionGroup>
            </EditorToolbar>

            <div className="mt-3 space-y-2">
              <Input
                aria-label="Review note to store with the next transition"
                value={note}
                placeholder="Review note (stored with the next decision)"
                onChange={(event) => setNote(event.target.value)}
              />
              <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
                <input
                  type="checkbox"
                  checked={confirmAuthorNameClaim}
                  disabled={!canPromote}
                  onChange={(event) => setConfirmAuthorNameClaim(event.target.checked)}
                  className="theme-replication-checkbox"
                />
                Publish without attribution even though the byline matches a contributor
              </label>
              <p className="theme-text-faint text-xs leading-relaxed">
                Promotion is available after the submission is accepted; preview builds the Convex payload
                before publishing. Attribution must name an existing contributor profile — submissions never
                carry one themselves.
              </p>
            </div>
          </EditorPanel>
        )}

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
