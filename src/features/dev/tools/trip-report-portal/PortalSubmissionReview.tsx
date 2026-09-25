"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionNotice,
  EditorActionGroup,
  EditorField,
  EditorNotice,
  EditorPanel,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
  type EditorStatusPillTone,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import { DecisionLogSection } from "@/features/dev/tools/DecisionLogSection";
import { decisionLogOf } from "@/features/intake/decisionLog";
import type {
  DataTripReportImportPayload,
  TripReportSubmissionRow,
} from "@/features/reports/submissions/tripReportSubmissions";
import {
  TRIP_REPORT_SUBMISSION_TRANSITIONS,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissionStatus";
import { publicHref } from "@/utils/publicHref";
import type { PortalContributorOption } from "./tripReportPortalModel";

/**
 * The intake queue's review surface, unchanged in capability from the tool the
 * portal replaces: status transitions, the promotion preview, the byline claim
 * adjudication, and the decision log. It now opens from a row in the same
 * corpus list as a published report rather than from a separate queue screen.
 */

/** A submission's status in the shared intake words (docs/glossary.md, Intake Status). */
const statusLabel = (status: TripReportSubmissionStatus) => INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[status]];

const statusTone = (status: TripReportSubmissionStatus): EditorStatusPillTone =>
  INTAKE_STATUS_TONE[TRIP_REPORT_INTAKE_STATUS[status]];

export type PromotionAttribution = {
  profileKey: string;
  confirmAuthorNameClaim: boolean;
};

/**
 * What the triage keys can ask of the open review. The tab owns the keys; the
 * review owns the note, the confirms and the busy state, so it fills this in.
 */
export type SubmissionTriageActions = {
  accept: () => void;
  reject: () => void;
  spam: () => void;
  note: () => void;
};

/** Every write this panel can start; the clicked control shows its own busy label. */
type PendingAction = TripReportSubmissionStatus | "preview" | "publish";

export function PortalSubmissionReview({
  busy,
  contributors,
  feedback,
  feedbackAction,
  onClose,
  onDismissFeedback,
  onNavigate,
  onPromotion,
  onStatusChange,
  promotionPayload,
  queuePosition,
  submission,
  triageRef,
}: {
  busy: boolean;
  /** Contributor profiles a published report can be attributed to. */
  contributors: readonly PortalContributorOption[];
  feedback: { tone: "success" | "danger"; message: string } | null;
  /** A control that belongs with the notice, such as Undo. */
  feedbackAction?: ReactNode;
  /** Filled with this review's triage actions while it is open. */
  triageRef?: MutableRefObject<SubmissionTriageActions | null>;
  onClose: () => void;
  onDismissFeedback: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onPromotion: (publish: boolean, attribution: PromotionAttribution) => void;
  /**
   * `notes` is omitted when the field is blank, so the stored note stays.
   * `publicReason` is what the author reads in My reports; only Reject asks for one.
   */
  onStatusChange: (status: TripReportSubmissionStatus, notes?: string, publicReason?: string) => void;
  promotionPayload: DataTripReportImportPayload | null;
  /** Where this row sits in the list as painted; `index` is -1 once it has filtered out. */
  queuePosition: { index: number; total: number };
  submission: TripReportSubmissionRow;
}) {
  const [profileKey, setProfileKey] = useState("");
  const [confirmAuthorNameClaim, setConfirmAuthorNameClaim] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  // The reject dialog's public reason; read when the reject is confirmed.
  const publicReasonRef = useRef("");
  const { confirm, dialog } = useConfirm();
  const contributorOptions = useMemo<SearchablePickerOption[]>(() => {
    const byKey = new Map<string, SearchablePickerOption>();
    for (const contributor of contributors) {
      if (!byKey.has(contributor.key)) {
        byKey.set(contributor.key, { value: contributor.key, label: contributor.displayName, hint: contributor.key });
      }
    }
    return [...byKey.values()];
  }, [contributors]);

  const attribution: PromotionAttribution = { profileKey, confirmAuthorNameClaim };
  const canPromote = submission.status === "accepted";
  const validTargets = TRIP_REPORT_SUBMISSION_TRANSITIONS[submission.status] ?? [];
  const subject = submission.report.subject;
  const substanceNames = Array.from(new Set(submission.substance_names));
  // Only the write in flight shows a busy label; the flag resets with it.
  const active = busy ? pending : null;

  const canGoBack = queuePosition.index !== 0 && queuePosition.total > 0;
  const canGoForward =
    queuePosition.total > 0 &&
    (queuePosition.index === -1 || queuePosition.index < queuePosition.total - 1);

  function decide(status: TripReportSubmissionStatus, publicReason?: string) {
    setPending(status);
    onStatusChange(status, note.trim() || undefined, publicReason);
  }

  const noteId = `trip-report-decision-note-${submission.id}`;
  const canDecide = (status: TripReportSubmissionStatus) => !busy && validTargets.includes(status);

  function confirmReject() {
    publicReasonRef.current = "";
    confirm({
      title: "Reject this submission?",
      description: `"${submission.title}" leaves the review queue. You can reopen it later from the All bucket. Nothing is emailed: an author signed in with the contact email sees the status, and the public reason if you give one, in My reports.`,
      body: <PublicReasonField id={`trip-report-public-reason-${submission.id}`} onChange={(value) => (publicReasonRef.current = value)} />,
      confirmLabel: "Reject",
      destructive: true,
      onConfirm: () => decide("rejected", publicReasonRef.current.trim() || undefined),
    });
  }

  function confirmSpam() {
    confirm({
      title: "Mark as spam?",
      description: `"${submission.title}" is filed as spam and leaves the review queue. Use this for junk, not for reports you disagree with; a wrong call can be reopened from the All bucket.`,
      confirmLabel: "Mark as spam",
      destructive: true,
      onConfirm: () => decide("spam"),
    });
  }

  // The keys reach the same paths as the buttons, with the same guards.
  useEffect(() => {
    if (!triageRef) return;
    triageRef.current = {
      accept: () => {
        if (canDecide("accepted")) decide("accepted");
      },
      reject: () => {
        if (canDecide("rejected")) confirmReject();
      },
      spam: () => {
        if (canDecide("spam")) confirmSpam();
      },
      note: () => document.getElementById(noteId)?.focus(),
    };
  });
  useEffect(
    () => () => {
      if (triageRef) triageRef.current = null;
    },
    [triageRef],
  );

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
          <EditorStatusPill tone={statusTone(submission.status)}>{statusLabel(submission.status)}</EditorStatusPill>
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
        {feedback || feedbackAction ? (
          <div className="flex flex-wrap items-center gap-2">
            {feedback ? (
              <ActionNotice tone={feedback.tone} onDismiss={onDismissFeedback}>
                {feedback.message}
              </ActionNotice>
            ) : null}
            {feedbackAction}
          </div>
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

        <DecisionLogSection entries={decisionLogOf(submission)} statusLabel={statusLabel} />

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
              id={noteId}
              label="Decision note"
              description="Added to the decision log with the decision you make next. Leave it empty to record only the outcome."
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
                  onClick={confirmReject}
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
                  onClick={confirmSpam}
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
              description="Attribute it to a contributor profile, or leave it empty to publish under the submitted byline."
            >
              {(controlProps) => (
                <div className="md:w-72">
                  <SearchablePicker
                    id={controlProps.id}
                    ariaLabel="Contributor"
                    options={contributorOptions}
                    value={profileKey || null}
                    placeholder="Choose a contributor (optional)"
                    emptyText="No contributor matches."
                    disabled={busy}
                    onChange={(next) => setProfileKey(next ?? "")}
                  />
                </div>
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

        {promotionPayload ? <PromotionPreview payload={promotionPayload} contributors={contributors} /> : null}
      </div>
    </EditorPanel>
  );
}

/**
 * The publish preview as the public report will carry it: address, byline
 * and attribution, substances, and how much of each section is there. The
 * raw payload stays on the server; nothing here needs reading as JSON.
 */
function PromotionPreview({
  contributors,
  payload,
}: {
  contributors: readonly PortalContributorOption[];
  payload: DataTripReportImportPayload;
}) {
  const profileKey = payload.subject.profile_key;
  const contributor = profileKey ? contributors.find((option) => option.key === profileKey) : undefined;
  const count = (entries: readonly unknown[], noun: string) =>
    entries.length === 0 ? "none" : `${entries.length} ${noun}${entries.length === 1 ? "" : "s"}`;
  const rows: { label: string; value: string }[] = [
    { label: "Public address", value: publicHref.report(payload.slug) },
    { label: "Title", value: payload.title },
    { label: "Byline", value: payload.subject.name || "No byline" },
    {
      label: "Attributed to",
      value: profileKey ? `${contributor?.displayName ?? profileKey} (contributor profile)` : "No contributor profile",
    },
    {
      label: "Substances",
      value:
        payload.substances
          .map((substance) => [substance.name, substance.dose, substance.roa].filter(Boolean).join(", "))
          .join("; ") || "None listed",
    },
    { label: "Introduction", value: payload.introduction?.trim() ? "Included" : "None" },
    {
      label: "Timeline",
      value: `Onset ${count(payload.onset, "entry")} · peak ${count(payload.peak, "entry")} · offset ${count(payload.offset, "entry")}`,
    },
    { label: "Conclusion", value: payload.conclusion?.trim() ? "Included" : "None" },
    { label: "Tags", value: payload.tags.length > 0 ? payload.tags.join(", ") : "None" },
    { label: "Featured", value: payload.featured ? "Yes" : "No" },
  ];

  return (
    <section aria-labelledby="trip-report-publish-preview" className="space-y-2">
      <SectionHeading id="trip-report-publish-preview">Publish preview</SectionHeading>
      <p className="theme-text-faint text-xs">Nothing is public yet. This is what Publish will create.</p>
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="theme-text-faint text-xs font-semibold uppercase tracking-wider sm:pt-0.5">{row.label}</dt>
            <dd className="theme-text-primary break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The reject dialog's reason for the author. It holds its own text so the
 * dialog, which is raised once, still re-renders as the admin types.
 */
function PublicReasonField({ id, onChange }: { id: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <EditorField
      id={id}
      label="Public reason (shown to the author)"
      description="Optional. The decision note stays private; this is the only text the author sees."
    >
      {(controlProps) => (
        <Input
          {...controlProps}
          value={value}
          placeholder="What the author should know"
          onChange={(event) => {
            setValue(event.target.value);
            onChange(event.target.value);
          }}
        />
      )}
    </EditorField>
  );
}

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h4 id={id} className="theme-accent-heading text-sm font-semibold">
      {children}
    </h4>
  );
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
