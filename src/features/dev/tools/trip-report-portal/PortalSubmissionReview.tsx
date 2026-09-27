"use client";

/**
 * One trip report submission under review, docked beside the list: a header
 * that names it once (title, byline and substances, age, status, pager), the
 * facts the author gave, what they wrote, the decision log, publishing (once
 * accepted), the private note, and a decision dock that sticks to the bottom
 * of the screen while the pane is on it. `FeedbackReviewPane` is the pattern.
 *
 * Capability is the intake queue's: claim and release through Reviewing,
 * accept, reject with a reason the author may read, spam, reopen, undo, the
 * publish preview, the byline claim adjudication, and publish.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorCheckbox,
  EditorField,
  EditorPanel,
  EditorStatusPill,
  Notice,
  useConfirm,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { DecisionLogSection } from "@/features/dev/tools/DecisionLogSection";
import { FeedbackFacts, type FeedbackFact } from "@/features/dev/tools/feedback/FeedbackFacts";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { decisionLogOf } from "@/features/intake/decisionLog";
import { INTAKE_STATUS_TONE, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import type {
  DataTripReportImportPayload,
  TripReportSubmissionRow,
} from "@/features/reports/submissions/tripReportSubmissions";
import {
  TRIP_REPORT_SUBMISSION_TRANSITIONS,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissionStatus";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { formatTripDate } from "../my-reports/myReportsModel";
import { submissionStatusLabel, type SubmissionHold } from "./submissionReviewModel";
import type { PortalContributorOption } from "./tripReportPortalModel";
import type { PortalNotice, PortalPendingAction } from "./useTripReportPortalController";

export type PromotionAttribution = {
  profileKey: string;
  confirmAuthorNameClaim: boolean;
};

/**
 * What the triage keys can ask of the open review. The tab owns the keys; the
 * review owns the note, the confirms and the guards, so it fills this in.
 */
export type SubmissionTriageActions = {
  accept: () => void;
  reject: () => void;
  spam: () => void;
  note: () => void;
};

const PENDING_LABEL: Partial<Record<PortalPendingAction, string>> = {
  claim: "Claiming",
  release: "Releasing",
  reopen: "Reopening",
  undo: "Undoing",
  accepted: "Accepting",
  rejected: "Rejecting",
  spam: "Marking as spam",
  preview: "Building preview",
  publish: "Publishing",
  assign: "Assigning",
};

const HOLD_ACTION: Record<"claim" | "release" | "reopen", { label: string; target: TripReportSubmissionStatus }> = {
  claim: { label: "Claim", target: "reviewing" },
  release: { label: "Release", target: "submitted" },
  reopen: { label: "Reopen", target: "reviewing" },
};

export type SubmissionReviewPaneProps = {
  submission: TripReportSubmissionRow;
  hold: SubmissionHold;
  /** The write in flight, if any; its control names it. */
  pending: PortalPendingAction | null;
  busy: boolean;
  frozen: boolean;
  /** Contributor profiles a published report can be attributed to. */
  contributors: readonly PortalContributorOption[];
  notice: PortalNotice | null;
  onDismissNotice: () => void;
  /** Undo for the last decision, when it can be taken back. */
  undo: { label: string; onUndo: () => void } | null;
  /** The member the contact email matches, offered after a publish. */
  assign: { email: string; onAssign: () => void } | null;
  /** The oldest submission still waiting, offered after a decision. */
  nextWaiting: { title: string; onOpen: () => void } | null;
  /** The published report this submission became, when it is in the corpus. */
  publishedReport: { slug: string | null; onOpen: () => void } | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** "N of M" and previous/next; null when the list no longer shows it. */
  position: { index: number; total: number } | null;
  onMove: (direction: -1 | 1) => void;
  onBackToList: () => void;
  onClose: () => void;
  /** Said when the list's view or search does not show this submission. */
  hiddenByList: ReactNode;
  promotionPayload: DataTripReportImportPayload | null;
  /** Filled with this review's triage actions while it is open. */
  triageRef?: MutableRefObject<SubmissionTriageActions | null>;
  onPromotion: (
    publish: boolean,
    attribution: PromotionAttribution,
    options?: { quiet?: boolean },
  ) => Promise<DataTripReportImportPayload | null>;
  /**
   * `notes` is omitted when the field is blank, so the stored note stays.
   * `publicReason` is what the author reads in My reports; only Reject asks for one.
   */
  onStatusChange: (
    status: TripReportSubmissionStatus,
    notes?: string,
    publicReason?: string,
    action?: PortalPendingAction,
  ) => Promise<boolean>;
};

export function PortalSubmissionReview(props: SubmissionReviewPaneProps) {
  const {
    submission,
    hold,
    pending,
    busy,
    frozen,
    contributors,
    notice,
    onDismissNotice,
    undo,
    assign,
    nextWaiting,
    publishedReport,
    headingRef,
    position,
    onMove,
    onBackToList,
    onClose,
    hiddenByList,
    promotionPayload,
    triageRef,
    onPromotion,
    onStatusChange,
  } = props;
  const headingId = useId();
  const [profileKey, setProfileKey] = useState("");
  const [confirmAuthorNameClaim, setConfirmAuthorNameClaim] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const publishRef = useRef<HTMLElement>(null);
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

  const status = submission.status;
  const validTargets = TRIP_REPORT_SUBMISSION_TRANSITIONS[status] ?? [];
  const can = (target: TripReportSubmissionStatus) => !busy && validTargets.includes(target);
  const subject = submission.report.subject;
  const substanceNames = Array.from(new Set(submission.substance_names));
  const byline = submission.author_name.trim() || subject.name?.trim() || "";
  const received = describeDay(submission.created_at);
  const waiting = status === "submitted" || status === "reviewing" || status === "accepted";
  const noteId = `trip-report-decision-note-${submission.id}`;
  const bylineMatch = useMemo(() => {
    const name = (subject.name ?? submission.author_name).trim().toLowerCase();
    return name ? contributors.find((contributor) => contributor.displayName.trim().toLowerCase() === name) ?? null : null;
  }, [contributors, subject.name, submission.author_name]);
  const consentMissing = !submission.publish_consent;
  const showClaimChoice = Boolean(bylineMatch) || confirmAuthorNameClaim || notice?.kind === "claim";
  const attribution: PromotionAttribution = { profileKey, confirmAuthorNameClaim };
  const label = (action: PortalPendingAction, idle: string) => (pending === action ? PENDING_LABEL[action] ?? idle : idle);

  async function decide(target: TripReportSubmissionStatus, publicReason?: string, action?: PortalPendingAction) {
    const done = await onStatusChange(target, note.trim() || undefined, publicReason, action ?? target);
    // The note went into the log with this decision, so it never rides along with the next one.
    if (done) setNote("");
  }

  function confirmReject() {
    publicReasonRef.current = "";
    const privateNote = note.trim();
    confirm({
      title: "Reject this submission?",
      description: `"${submission.title}" leaves the review queue. You can reopen it later from All. Nothing is emailed: an author signed in with the contact email sees the status, and the public reason if you give one, in My reports.`,
      body: (
        <div className="space-y-3">
          <PublicReasonField id={`trip-report-public-reason-${submission.id}`} onChange={(value) => (publicReasonRef.current = value)} />
          <p className="theme-text-muted text-sm">
            {privateNote
              ? `Your private note goes to the decision log only: “${privateNote}”`
              : "No private note. Add one in the pane first if other editors need the why."}
          </p>
        </div>
      ),
      confirmLabel: "Reject",
      destructive: true,
      onConfirm: () => void decide("rejected", publicReasonRef.current.trim() || undefined),
    });
  }

  function confirmSpam() {
    confirm({
      title: "Mark as spam?",
      description: `"${submission.title}" is filed as spam and leaves the review queue. Use this for junk, not for reports you disagree with; a wrong call can be reopened from All.`,
      confirmLabel: "Mark as spam",
      destructive: true,
      onConfirm: () => void decide("spam"),
    });
  }

  async function confirmPublish() {
    if (busy || consentMissing) return;
    // Build the preview first, so the confirm shows exactly what goes public.
    const payload = await onPromotion(false, attribution, { quiet: true });
    if (!payload) return;
    confirm({
      title: `Publish “${submission.title}”?`,
      description: `It becomes a public trip report at ${publicHref.report(payload.slug)}, readable by anyone. The submission can no longer change status; the published report is edited or removed from Published.`,
      body: <PromotionSummary payload={payload} contributors={contributors} />,
      confirmLabel: "Publish",
      wide: true,
      onConfirm: () => void onPromotion(true, attribution),
    });
  }

  // The keys reach the same paths as the buttons, with the same guards.
  useEffect(() => {
    if (!triageRef) return;
    triageRef.current = {
      accept: () => {
        if (can("accepted")) void decide("accepted");
      },
      reject: () => {
        if (can("rejected")) confirmReject();
      },
      spam: () => {
        if (can("spam")) confirmSpam();
      },
      note: () => noteRef.current?.focus(),
    };
  });
  useEffect(
    () => () => {
      if (triageRef) triageRef.current = null;
    },
    [triageRef],
  );

  const pager = position ? (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">
        {position.index + 1} of {position.total}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Previous in list"
        aria-keyshortcuts="k"
        title="Previous in list (k)"
        disabled={position.index <= 0}
        onClick={() => onMove(-1)}
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Next in list"
        aria-keyshortcuts="j"
        title="Next in list (j)"
        disabled={position.index >= position.total - 1}
        onClick={() => onMove(1)}
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  ) : (
    <Button type="button" variant="ghost" size="sm" onClick={() => onMove(1)} aria-keyshortcuts="j">
      Next in list
      <Icon icon="lucide:chevron-down" size={14} />
    </Button>
  );

  // What decides whether it may go public, and how to reach the author. The
  // trip's own details sit with the words, where they are read.
  const facts: FeedbackFact[] = [
    {
      label: "Consent to publish",
      value: submission.publish_consent ? "Yes" : "No, the author did not consent",
      tone: submission.publish_consent ? undefined : "warning",
    },
    {
      label: "Age confirmed",
      value: submission.age_confirmed ? "Yes" : "No",
      tone: submission.age_confirmed ? undefined : "warning",
    },
    submission.contact_email
      ? submission.may_contact
        ? { label: "Contact", value: submission.contact_email, href: `mailto:${submission.contact_email}`, wide: true }
        : { label: "Contact email", value: `${submission.contact_email} (not to be contacted)`, wide: true }
      : { label: "May contact", value: submission.may_contact ? "Yes, but no email was given" : "No" },
    submission.honeypot_triggered
      ? { label: "Spam trap", value: "Tripped: a hidden field was filled in, as bots do", tone: "warning", wide: true }
      : null,
  ].filter(Boolean) as FeedbackFact[];

  return (
    <EditorPanel className="overflow-visible" role="region" aria-labelledby={headingId}>
      {dialog}
      <header className="theme-portal-rule relative space-y-3 border-b px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-2 pr-10 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
          {pager}
        </div>
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close review"
          title="Close review (Esc)"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="flex items-start justify-between gap-3 lg:pr-10">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
          >
            {submission.title || "Untitled report"}
          </h3>
          <div className="-mt-1 hidden shrink-0 lg:block">{pager}</div>
        </div>
        <p className="theme-text-secondary -mt-1 text-sm font-medium">
          {[byline || "No byline", substanceNames.join(", ") || "No substances named"].join(" · ")}
        </p>
        <div className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          {received ? (
            <span>
              {waiting ? "Waiting since " : "Received "}
              <time dateTime={submission.created_at} title={received.full}>
                {received.relative}
              </time>
            </span>
          ) : null}
          <EditorStatusPill inline tone={INTAKE_STATUS_TONE[TRIP_REPORT_INTAKE_STATUS[status]]}>
            {submissionStatusLabel(status)}
          </EditorStatusPill>
        </div>
        {hiddenByList ? <div className="theme-text-muted text-sm">{hiddenByList}</div> : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [&_:is(input,button,textarea,select,a)]:scroll-mb-56 [&_:is(input,button,textarea,select,a)]:scroll-mt-28">
        <FeedbackFacts facts={facts} />

        <section aria-labelledby={`${headingId}-words`} className="space-y-2">
          <h4 id={`${headingId}-words`} className="theme-accent-heading text-sm font-semibold">
            What they wrote
          </h4>
          <SubmittedReport report={submission.report} />
          {received ? (
            <p className="theme-text-muted text-xs">
              Received{" "}
              <time dateTime={submission.created_at} title={received.full}>
                {received.full}
              </time>
            </p>
          ) : null}
        </section>

        <DecisionLogSection entries={decisionLogOf(submission)} statusLabel={submissionStatusLabel} />

        {status === "accepted" ? (
          <section ref={publishRef} aria-labelledby={`${headingId}-publish`} className="space-y-4">
            <div className="space-y-1">
              <h4 id={`${headingId}-publish`} className="theme-accent-heading text-sm font-semibold">
                Publishing
              </h4>
              <p className="theme-text-muted max-w-[65ch] text-sm">
                Publish in the dock makes this a public trip report. Choose who it is attributed to first; Preview
                shows what Publish will create and writes nothing public.
              </p>
            </div>
            <EditorField
              label="Attribute to a contributor"
              description="Optional. Leave it empty to publish under the submitted byline."
            >
              {(controlProps) => (
                <div className="max-w-sm">
                  <SearchablePicker
                    id={controlProps.id}
                    ariaLabel="Contributor"
                    options={contributorOptions}
                    value={profileKey || null}
                    placeholder="No contributor profile"
                    emptyText="No contributor matches."
                    disabled={busy}
                    onChange={(next) => setProfileKey(next ?? "")}
                  />
                </div>
              )}
            </EditorField>
            {showClaimChoice ? (
              <div className="space-y-1.5">
                {bylineMatch && !profileKey ? (
                  <p className="theme-text-secondary max-w-[65ch] text-sm">
                    “{bylineMatch.displayName}” is a contributor’s name, so the byline would link to their page.
                    Attribute it to them, or publish without attribution.
                  </p>
                ) : null}
                <EditorCheckbox
                  checked={confirmAuthorNameClaim}
                  disabled={busy}
                  onChange={(event) => setConfirmAuthorNameClaim(event.target.checked)}
                  label="Publish without attribution even though the byline matches a contributor"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-busy={pending === "preview" || undefined}
                onClick={() => void onPromotion(false, attribution)}
              >
                <Icon icon="lucide:eye" size={14} />
                {label("preview", "Preview publish")}
              </Button>
            </div>
            {promotionPayload ? (
              <section aria-labelledby="trip-report-publish-preview" className="space-y-2">
                <h5 id="trip-report-publish-preview" className="theme-text-primary text-sm font-semibold">
                  Publish preview
                </h5>
                <p className="theme-text-muted text-sm">Nothing is public yet. This is what Publish will create.</p>
                <PromotionSummary payload={promotionPayload} contributors={contributors} />
              </section>
            ) : null}
          </section>
        ) : null}

        {status === "exported" ? (
          <section aria-labelledby={`${headingId}-live`} className="space-y-2">
            <h4 id={`${headingId}-live`} className="theme-accent-heading text-sm font-semibold">
              Published
            </h4>
            <p className="theme-text-muted max-w-[65ch] text-sm">
              This submission is live as a public trip report, so the submission itself no longer changes. Edit or
              remove the report from Published.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {publishedReport?.slug || promotionPayload?.slug ? (
                <a
                  href={publicHref.report(publishedReport?.slug ?? promotionPayload?.slug ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-dose-accent-strong underline-offset-4 hover:underline sm:min-h-0"
                >
                  View live
                  <span className="sr-only">, opens in a new tab</span>
                  <Icon icon="lucide:arrow-up-right" size={14} />
                </a>
              ) : null}
              {publishedReport ? (
                <Button type="button" variant="outline" size="sm" onClick={publishedReport.onOpen}>
                  Open the published report
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {status === "exported" ? null : (
          <EditorField
            htmlFor={noteId}
            label="Decision note"
            description="Private. Added to the decision log with your next decision; the author never sees it. Leave it empty to record only the outcome."
          >
            <Textarea
              ref={noteRef}
              id={noteId}
              textareaSize="sm"
              value={note}
              disabled={busy}
              aria-keyshortcuts="n"
              className="[field-sizing:content] max-h-[40vh]"
              placeholder="What you checked, or why you decided this way"
              onChange={(event) => setNote(event.target.value)}
            />
          </EditorField>
        )}
      </div>

      <footer
        aria-label="Decision"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {notice ? (
          <Notice
            placement="inline"
            tone={notice.tone}
            title={notice.title}
            dismiss={onDismissNotice}
            actions={
              (notice.kind === "decision" && undo) || (notice.kind === "published" && assign) || (notice.kind === "decision" && nextWaiting) || (notice.kind === "claim" && status === "accepted") ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {notice.kind === "decision" && undo ? (
                    <Button
                      type="button"
                      variant="link"
                      size="auto"
                      className="text-sm"
                      disabled={busy}
                      aria-keyshortcuts="u"
                      aria-busy={pending === "undo" || undefined}
                      onClick={undo.onUndo}
                    >
                      {pending === "undo" ? PENDING_LABEL.undo : "Undo"}
                      <span className="sr-only">{`: ${undo.label}`}</span>
                    </Button>
                  ) : null}
                  {notice.kind === "published" && assign ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-busy={pending === "assign" || undefined}
                      onClick={assign.onAssign}
                    >
                      {pending === "assign" ? PENDING_LABEL.assign : "Assign to this member"}
                    </Button>
                  ) : null}
                  {notice.kind === "decision" && nextWaiting ? (
                    <Button type="button" variant="link" size="auto" className="text-sm" onClick={nextWaiting.onOpen}>
                      Next waiting: {nextWaiting.title}
                    </Button>
                  ) : null}
                  {notice.kind === "claim" && status === "accepted" ? (
                    <Button
                      type="button"
                      variant="link"
                      size="auto"
                      className="text-sm"
                      onClick={() => publishRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      Go to Publishing
                    </Button>
                  ) : null}
                </span>
              ) : undefined
            }
          >
            {notice.message}
          </Notice>
        ) : null}
        {frozen && !notice ? (
          <p className="theme-text-muted flex items-center gap-2 text-xs">
            <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
            Writes are paused right now; a decision will not save until they resume.
          </p>
        ) : null}
        <HoldLine
          hold={hold}
          status={status}
          busy={busy}
          pending={pending}
          validTargets={validTargets}
          onAct={(action) => void decide(HOLD_ACTION[action].target, undefined, action)}
        />
        {status === "submitted" || status === "reviewing" ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decide">
            <DecisionButton
              label={label("accepted", "Accept")}
              keyCap="a"
              variant="accent"
              disabled={!can("accepted")}
              busy={pending === "accepted"}
              onClick={() => void decide("accepted")}
            />
            <DecisionButton
              label={label("rejected", "Reject")}
              keyCap="r"
              variant="outline"
              disabled={!can("rejected")}
              busy={pending === "rejected"}
              onClick={confirmReject}
            />
            <DecisionButton
              label={label("spam", "Mark as spam")}
              keyCap="s"
              variant="outline"
              disabled={!can("spam")}
              busy={pending === "spam"}
              onClick={confirmSpam}
            />
          </div>
        ) : status === "accepted" ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decide">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={busy || consentMissing}
                aria-busy={pending === "publish" || pending === "preview" || undefined}
                onClick={() => void confirmPublish()}
              >
                <Icon icon="lucide:globe" size={14} />
                {pending === "publish" ? PENDING_LABEL.publish : pending === "preview" ? "Checking" : "Publish"}
              </Button>
              <DecisionButton
                label={label("rejected", "Reject")}
                keyCap="r"
                variant="outline"
                disabled={!can("rejected")}
                busy={pending === "rejected"}
                onClick={confirmReject}
              />
            </div>
            {consentMissing ? (
              <p className="theme-warning-text-strong flex items-start gap-2 text-xs">
                <Icon icon="lucide:shield-alert" size={13} className="mt-0.5 shrink-0" />
                The author did not consent to publishing, so Publish is off. Reject it, or reopen it to decide again.
              </p>
            ) : null}
          </div>
        ) : null}
      </footer>
    </EditorPanel>
  );
}

function DecisionButton({
  label,
  keyCap,
  variant,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  keyCap: string;
  variant: "accent" | "outline";
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled}
      aria-keyshortcuts={keyCap}
      aria-busy={busy || undefined}
      onClick={onClick}
    >
      {label}
      {/* The wrapper hides the cap on touch screens; the kbd class sets its own display. */}
      <span aria-hidden className="[@media(pointer:coarse)]:hidden">
        <kbd className="theme-dev-kbd !text-current opacity-70">{keyCap}</kbd>
      </span>
    </Button>
  );
}

/** Who has this submission, or who decided it, with the one action that changes that. */
function HoldLine({
  hold,
  status,
  busy,
  pending,
  validTargets,
  onAct,
}: {
  hold: SubmissionHold;
  status: TripReportSubmissionStatus;
  busy: boolean;
  pending: PortalPendingAction | null;
  validTargets: readonly TripReportSubmissionStatus[];
  onAct: (action: "claim" | "release" | "reopen") => void;
}) {
  let icon = "lucide:user-round";
  let iconClass = "theme-text-faint";
  let sentence: ReactNode;
  let action: "claim" | "release" | "reopen" | null = null;
  const when = (at: string | null) => {
    const day = at ? describeDay(at) : null;
    return day ? (
      <>
        {" "}
        <time dateTime={at ?? undefined} title={day.full}>
          {day.relative}
        </time>
      </>
    ) : null;
  };
  const name = (email: string) => formatReviewerIdentity(email) ?? email;

  switch (hold.kind) {
    case "open":
      sentence = "Nobody is reviewing this yet.";
      action = "claim";
      break;
    case "mine":
      icon = "lucide:user-round-check";
      iconClass = "theme-icon-accent";
      sentence = <>You are reviewing this{hold.at ? <>, since{when(hold.at)}</> : null}.</>;
      action = "release";
      break;
    case "other":
      sentence = <>Claimed by {name(hold.by)}{hold.at ? <>,{when(hold.at)}</> : null}.</>;
      break;
    case "unknown":
      sentence = "In review. No reviewer was recorded.";
      action = "release";
      break;
    case "accepted":
    case "decided":
    case "published": {
      icon =
        hold.kind === "published" || hold.kind === "accepted"
          ? "lucide:circle-check"
          : status === "spam"
            ? "lucide:ban"
            : "lucide:circle-x";
      const who = hold.mine ? "you" : hold.by ? name(hold.by) : null;
      const tail =
        hold.kind === "accepted"
          ? " It waits for Publish."
          : hold.kind === "published"
            ? ""
            : " Reopen it to decide again.";
      sentence = (
        <>
          {submissionStatusLabel(status)}
          {who ? ` by ${who}` : ""}
          {hold.at ? <>,{when(hold.at)}</> : null}.{tail}
        </>
      );
      action = hold.kind === "published" ? null : "reopen";
      break;
    }
  }
  const allowed = action ? validTargets.includes(HOLD_ACTION[action].target) : false;

  return (
    <div className="theme-portal-rule flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b pb-2.5 last:border-b-0 last:pb-0">
      <Icon icon={icon} size={16} className={cn("shrink-0", iconClass)} />
      <p className={cn("min-w-0 flex-1 text-sm", hold.kind === "mine" ? "theme-text-primary font-medium" : "theme-text-secondary")}>
        {sentence}
      </p>
      {action && allowed ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          aria-busy={pending === action || undefined}
          onClick={() => onAct(action)}
        >
          {pending === action ? PENDING_LABEL[action] : HOLD_ACTION[action].label}
        </Button>
      ) : null}
    </div>
  );
}

const PHASE_TONE: Record<"onset" | "peak" | "offset", string> = {
  onset: "theme-report-phase-onset-text",
  peak: "theme-report-phase-peak-text",
  offset: "theme-report-phase-offset-text",
};

/** The author's report in reading order, in a quiet well: substances, introduction, the phases, conclusion. */
function SubmittedReport({ report }: { report: TripReportSubmissionRow["report"] }) {
  const phases = (["onset", "peak", "offset"] as const).filter((phase) => report[phase].length > 0);
  const empty = !report.introduction && phases.length === 0 && !report.conclusion;
  const subject = report.subject;
  const details = [
    { label: "Trip date", value: subject.trip_date ? formatTripDate(subject.trip_date) : null },
    { label: "Setting", value: subject.setting },
    { label: "Age", value: subject.age },
    { label: "Gender", value: subject.gender },
    { label: "Height", value: subject.height },
    { label: "Weight", value: subject.weight },
    { label: "Medications", value: subject.medications },
    { label: "Tags", value: report.tags.length > 0 ? report.tags.join(", ") : null },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));
  return (
    <div className="space-y-5 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-4">
      {details.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
          {details.map((entry) => (
            <div key={entry.label} className={cn("min-w-0", (entry.label === "Setting" || entry.label === "Medications" || entry.label === "Tags") && "col-span-2")}>
              <dt className="type-meta-label theme-text-muted">{entry.label}</dt>
              <dd className="theme-text-primary mt-0.5 break-words">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {report.substances.length > 0 ? (
        <div>
          <h5 className="type-meta-label theme-text-muted">Substances</h5>
          <ul className="mt-1.5 space-y-1">
            {report.substances.map((substance, index) => (
              <li key={index} className="theme-text-secondary text-sm">
                <span className="theme-text-primary font-medium">{substance.name}</span>
                {substance.dose || substance.roa ? ` · ${[substance.dose, substance.roa].filter(Boolean).join(", ")}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.introduction ? <Narrative label="Introduction" value={report.introduction} /> : null}
      {phases.map((phase) => (
        <div key={phase}>
          <h5 className={cn("font-display text-sm font-semibold", PHASE_TONE[phase])}>
            {phase[0].toUpperCase() + phase.slice(1)}
          </h5>
          <ol className="mt-1.5 space-y-3">
            {report[phase].map((entry, index) => (
              <li key={index} className="grid gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                <span className="theme-text-faint text-xs font-medium tabular-nums sm:pt-0.5">{entry.time ?? ""}</span>
                <p className="theme-text-primary max-w-prose whitespace-pre-line text-sm leading-6">{entry.description}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {report.conclusion ? <Narrative label="Conclusion" value={report.conclusion} /> : null}
      {empty ? <p className="theme-text-muted text-sm">The author sent no report text.</p> : null}
    </div>
  );
}

function Narrative({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h5 className="theme-portal-prose-phase-text font-display text-sm font-semibold">{label}</h5>
      <p className="theme-text-primary mt-1.5 max-w-prose whitespace-pre-line text-sm leading-6">{value}</p>
    </div>
  );
}

/**
 * The publish preview as the public report will carry it: address, byline
 * and attribution, substances, and how much of each section is there. The
 * pane and the publish confirm draw the same rows.
 */
function PromotionSummary({
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
      value: `Onset ${count(payload.onset, "entry")}, peak ${count(payload.peak, "entry")}, offset ${count(payload.offset, "entry")}`,
    },
    { label: "Conclusion", value: payload.conclusion?.trim() ? "Included" : "None" },
    { label: "Tags", value: payload.tags.length > 0 ? payload.tags.join(", ") : "None" },
    { label: "Featured", value: payload.featured ? "Yes" : "No" },
  ];

  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="type-meta-label theme-text-muted sm:pt-0.5">{row.label}</dt>
          <dd className="theme-text-primary break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
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
      description="Optional. The only text the author sees, in My reports. Without one they see only “Rejected”."
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
