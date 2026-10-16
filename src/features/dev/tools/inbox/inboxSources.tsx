import { useId, useState, type ReactNode } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";

import { EditorStatusPill } from "@/features/dev/components";
import { DecisionLogSection } from "@/features/dev/tools/DecisionLogSection";
import { articleFeedbackAdapter } from "@/features/dev/tools/feedback/articleFeedbackAdapter";
import type {
  FeedbackQueueItem,
  FeedbackQueueStatus,
  FeedbackSourceAdapter,
} from "@/features/dev/tools/feedback/FeedbackReviewQueue";
import { formatFeedbackDate } from "@/features/dev/tools/feedback/FeedbackReviewQueue";
import { readFeedbackList } from "@/features/dev/tools/feedback/feedbackRequests";
import { glossaryFeedbackAdapter, type GlossaryFeedbackItem } from "@/features/dev/tools/feedback/glossaryFeedbackAdapter";
import { siteFeedbackAdapter } from "@/features/dev/tools/feedback/siteFeedbackAdapter";
import type { ProposalSummary, ReviewRecommendationRow } from "@/features/dev/tools/queue/queueModel";
import { fetchProposals, fetchReviewRecommendations } from "@/features/dev/tools/queue/queueRequests";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { NEEDS_REVIEW_SUBMISSION_STATUSES } from "@/features/dev/tools/trip-report-portal/tripReportPortalModel";
import { decisionLogOf, UNKNOWN_DECISION_ACTOR, type DecisionLogged } from "@/features/intake/decisionLog";
import { FEEDBACK_OUTCOME_LABEL } from "@/features/intake/feedbackCorrection";
import {
  FEEDBACK_INTAKE_STATUS,
  INTAKE_STATUS_LABEL,
  TRIP_REPORT_INTAKE_STATUS,
} from "@/features/intake/intakeStatus";
import type { TripReportSubmissionRow } from "@/features/reports/submissions/tripReportSubmissions";

import {
  canTransitionTripReportSubmission,
  TRIP_REPORT_SUBMISSION_TRANSITIONS,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissionStatus";
import { SITE_FEEDBACK_PENDING_STATUSES } from "@/features/site-feedback/siteFeedback";
import { devHref } from "@/utils/devHref";
import { readerSuggestionsHref } from "@server/translation/reviewInboxTypes";
import { feedbackTaskHref } from "@/features/dev/tools/feedback/feedbackTaskLink";
import { reviewRecommendationHref } from "@/features/dev/tools/queue/queueTaskLink";

import { inboxKey, type InboxItem, type InboxSourceId, type InboxUrgency } from "./inboxModel";
import { devFetch, devPost } from "@/features/dev/tools/devFetch";

export type InboxDecision = "accept" | "reject" | "spam";

export type InboxClaim = {
  source: InboxSourceId;
  item_id: string;
  claimed_by: string;
  claimed_at: string;
  expired?: boolean;
};

export type InboxListContext = {
  claims: ReadonlyMap<string, InboxClaim>;
};

export type InboxSourceAdapter = {
  id: InboxSourceId;
  toolLabel: string;
  detailHasHeading?: boolean;
  list: (context: InboxListContext) => Promise<InboxItem[]>;
  detail: (id: string) => ReactNode;
  actions: {
    claim: (id: string) => Promise<InboxItem>;
    release: (id: string) => Promise<InboxItem>;
    takeOver?: (id: string) => Promise<InboxItem>;
    canRelease: (item: InboxItem) => boolean;
    decisions: (item: InboxItem) => readonly InboxDecision[];
    decide?: (id: string, decision: InboxDecision, note: string) => Promise<InboxItem | null>;
    undo?: (id: string) => Promise<InboxItem> | null;
  };
};

export const BADGE_OF_SOURCE = {
  "trip-reports": "trip-reports",
  "article-feedback": "feedback",
  "site-feedback": "feedback",
  "glossary-feedback": "glossary-feedback",
  citations: "citations",
  proposals: "proposals",
  "review-recommendations": "review-recommendations",
} as const satisfies Record<InboxSourceId, string>;

const INBOX_MESSAGES = {
  network: "Network error while loading the Inbox.",
  failure: "The server refused the request.",
};

function requestJson(url: string, init?: RequestInit) {
  return devFetch(url, { ...init, messages: INBOX_MESSAGES });
}

function postJson(url: string, body: unknown) {
  return devPost(url, body, { messages: INBOX_MESSAGES });
}

function claimerFromLog<Status extends string>(row: DecisionLogged<Status>, unclaimed: Status): string | null {
  if (row.status === unclaimed) return null;
  const log = decisionLogOf(row);
  const latest = log[log.length - 1];
  if (latest && latest.to === row.status && latest.actor !== UNKNOWN_DECISION_ACTOR) return latest.actor;
  return row.reviewed_by?.trim() || null;
}

function rowCache<Row>() {
  const rows = new Map<string, Row>();
  return {
    put(id: string, row: Row) {
      rows.set(id, row);
    },
    get(id: string): Row {
      const row = rows.get(id);
      if (!row) throw new Error("That item is no longer in the Inbox. Refresh to see the current list.");
      return row;
    },
    has(id: string) {
      return rows.has(id);
    },
  };
}

function MissingDetail() {
  return <p className="theme-text-muted text-sm">This item is no longer in the Inbox. Refresh to see the current list.</p>;
}

function DetailFacts({ facts }: { facts: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="type-meta-label theme-text-muted">{fact.label}</dt>
          <dd className="theme-text-primary mt-1 tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailHeading({ children }: { children: ReactNode }) {
  return <h4 className="theme-accent-heading text-sm font-semibold">{children}</h4>;
}

function CorrectionReveal({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <DetailHeading>Correction</DetailHeading>
        <ExpandButton
          variant="inline"
          isExpanded={open}
          onToggle={() => setOpen((value) => !value)}
          ariaControls={regionId}
          ariaLabel={open ? "Hide the correction panel" : "Show the correction panel: start or link a correction"}
        />
      </div>
      {open ? (
        <div id={regionId} className="theme-reveal-enter">
          {children}
        </div>
      ) : (
        <p id={regionId} className="theme-text-muted text-sm">
          Start a correction or link an existing change.
        </p>
      )}
    </section>
  );
}

function undoStatus<Status extends string>(
  transitions: Readonly<Record<string, readonly string[]>>,
  from: Status,
  to: Status,
): Status | null {
  const allowed = transitions[to] ?? [];
  if (allowed.includes(from)) return from;
  return allowed.includes("reviewing") ? ("reviewing" as Status) : null;
}

const TRIP_DECISION_STATUS: Record<InboxDecision, TripReportSubmissionStatus> = {
  accept: "accepted",
  reject: "rejected",
  spam: "spam",
};

const NEEDS_REVIEW: readonly string[] = NEEDS_REVIEW_SUBMISSION_STATUSES;

function tripReportsSource(): InboxSourceAdapter {
  const cache = rowCache<TripReportSubmissionRow>();
  const decided = new Map<string, { from: TripReportSubmissionStatus; to: TripReportSubmissionStatus }>();
  const toItem = (row: TripReportSubmissionRow): InboxItem => {
    cache.put(row.id, row);
    return {
      key: inboxKey("trip-reports", row.id),
      source: "trip-reports",
      id: row.id,
      title: row.title?.trim() || "Untitled report",
      subtitle: [row.author_name, row.substance_names.join(", ")].filter(Boolean).join(" · "),
      status: TRIP_REPORT_INTAKE_STATUS[row.status],
      urgency: "normal",
      receivedAt: row.created_at,
      claimedBy: claimerFromLog(row, "submitted"),
      href: devHref({ type: "dev", tab: "trip-report-submissions", slug: encodeURIComponent(row.id) }),
    };
  };
  const move = async (id: string, status: TripReportSubmissionStatus, note?: string) => {
    const payload = await postJson(`/api/trip-report-submissions/${encodeURIComponent(id)}/status`, {
      status,
      ...(note?.trim() ? { notes: note.trim() } : {}),
    });
    const row = payload.submission as TripReportSubmissionRow | undefined;
    if (!row || typeof row.id !== "string") {
      throw new Error("The server did not confirm the change. Refresh to check the report before trying again.");
    }
    return row;
  };
  return {
    id: "trip-reports",
    toolLabel: "Trip reports",
    async list() {
      const payload = await requestJson("/api/trip-report-submissions/queue?scope=needs-review");
      if (!Array.isArray(payload.submissions)) {
        throw new Error("The server did not return the trip report queue. Try again.");
      }
      return (payload.submissions as TripReportSubmissionRow[])
        .filter((row) => NEEDS_REVIEW.includes(row.status))
        .map(toItem);
    },
    detail(id) {
      if (!cache.has(id)) return <MissingDetail />;
      const row = cache.get(id);
      return (
        <div className="space-y-5">
          <DetailFacts
            facts={[
              { label: "Author", value: row.author_name || "Anonymous" },
              { label: "Substances", value: row.substance_names.join(", ") || "None named" },
              { label: "Received", value: formatFeedbackDate(row.created_at) ?? "Unknown" },
              { label: "Consent to publish", value: row.publish_consent ? "Yes" : "No" },
            ]}
          />
          <DecisionLogSection
            entries={decisionLogOf(row)}
            statusLabel={(status: TripReportSubmissionStatus) => INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[status]]}
          />
        </div>
      );
    },
    actions: {
      claim: async (id) => toItem(await move(id, "reviewing")),
      release: async (id) => toItem(await move(id, "submitted")),
      canRelease: (item) => item.status === "reviewing",
      decisions: (item) => {
        const row = cache.has(item.id) ? cache.get(item.id) : null;
        if (!row) return [];
        return (["accept", "reject", "spam"] as const).filter((decision) =>
          canTransitionTripReportSubmission(row.status, TRIP_DECISION_STATUS[decision]),
        );
      },
      async decide(id, decision, note) {
        const from = cache.get(id).status;
        const row = await move(id, TRIP_DECISION_STATUS[decision], note);
        decided.set(id, { from, to: row.status });
        const item = toItem(row);
        return NEEDS_REVIEW.includes(row.status) ? item : null;
      },
      undo(id) {
        const last = decided.get(id);
        const target = last ? undoStatus(TRIP_REPORT_SUBMISSION_TRANSITIONS, last.from, last.to) : null;
        if (!target) return null;
        return move(id, target).then((row) => {
          decided.delete(id);
          return toItem(row);
        });
      },
    },
  };
}

const FEEDBACK_DECISION_STATUS: Record<InboxDecision, FeedbackQueueStatus> = {
  accept: "resolved",
  reject: "rejected",
  spam: "spam",
};

const PENDING_FEEDBACK: readonly string[] = SITE_FEEDBACK_PENDING_STATUSES;

type FeedbackSourceSpec<Item extends FeedbackQueueItem> = {
  id: "article-feedback" | "site-feedback" | "glossary-feedback";
  adapterFor: (row: Item) => FeedbackSourceAdapter<Item>;
  loadPending: () => Promise<Item[]>;
  href: (row: Item) => string;
  claimer: (row: Item) => string | null;
};

function feedbackSource<Item extends FeedbackQueueItem>(spec: FeedbackSourceSpec<Item>): InboxSourceAdapter {
  const cache = rowCache<Item>();
  const decided = new Map<string, { from: FeedbackQueueStatus; to: FeedbackQueueStatus }>();
  const toItem = (row: Item): InboxItem => {
    cache.put(row.id, row);
    const adapter = spec.adapterFor(row);
    return {
      key: inboxKey(spec.id, row.id),
      source: spec.id,
      id: row.id,
      title: adapter.labels.itemTitle(row),
      subtitle: [adapter.labels.itemSubtitle(row), row.details].filter(Boolean).join(" · "),
      status: FEEDBACK_INTAKE_STATUS[row.status],
      urgency: (adapter.importance?.(row) ?? "normal") as InboxUrgency,
      receivedAt: row.created_at,
      claimedBy: spec.claimer(row),
      href: spec.href(row),
    };
  };
  const move = async (id: string, status: FeedbackQueueStatus, note?: string) => {
    const row = cache.get(id);
    const updated = await spec.adapterFor(row).transition(id, {
      status,
      ...(note?.trim() ? { note: note.trim() } : {}),
    });
    return updated;
  };
  return {
    id: spec.id,
    toolLabel: spec.id === "glossary-feedback" ? "Glossary" : "Feedback",
    detailHasHeading: false,
    async list() {
      return (await spec.loadPending()).filter((row) => PENDING_FEEDBACK.includes(row.status)).map(toItem);
    },
    detail(id) {
      if (!cache.has(id)) return <MissingDetail />;
      const row = cache.get(id);
      const adapter = spec.adapterFor(row);
      return (
        <div className="space-y-5">
          {adapter.renderDetail(row)}
          <section>
            <DetailHeading>Details</DetailHeading>
            <p className="theme-text-secondary mt-2 max-w-prose whitespace-pre-line text-sm leading-6">{row.details}</p>
          </section>
          {adapter.renderCorrection ? (
            <CorrectionReveal key={row.id}>
              {adapter.renderCorrection(row, (updated) => cache.put(updated.id, { ...row, ...updated }))}
            </CorrectionReveal>
          ) : null}
          {adapter.keepsDecisionLog ? (
            <DecisionLogSection
              entries={decisionLogOf(row)}
              statusLabel={(status: FeedbackQueueStatus) => INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS[status]]}
              outcomeLabel={(outcome) => FEEDBACK_OUTCOME_LABEL[outcome]}
            />
          ) : row.reviewed_by ? (
            <p className="theme-text-faint text-xs">
              Last decision by {formatReviewerIdentity(row.reviewed_by)}
              {row.review_notes ? `: ${row.review_notes}` : ""}
            </p>
          ) : null}
        </div>
      );
    },
    actions: {
      claim: async (id) => toItem(await move(id, "reviewing")),
      release: async (id) => toItem(await move(id, "new")),
      canRelease: (item) => item.status === "reviewing",
      decisions: (item) => {
        if (!cache.has(item.id)) return [];
        const row = cache.get(item.id);
        const allowed = spec.adapterFor(row).transitions[row.status] ?? [];
        return (["accept", "reject", "spam"] as const).filter((decision) =>
          allowed.includes(FEEDBACK_DECISION_STATUS[decision]),
        );
      },
      async decide(id, decision, note) {
        const from = cache.get(id).status;
        const row = await move(id, FEEDBACK_DECISION_STATUS[decision], note);
        decided.set(id, { from, to: row.status });
        const item = toItem(row);
        return PENDING_FEEDBACK.includes(row.status) ? item : null;
      },
      undo(id) {
        const last = decided.get(id);
        if (!last || !cache.has(id)) return null;
        const target = undoStatus(spec.adapterFor(cache.get(id)).transitions, last.from, last.to);
        if (!target) return null;
        return move(id, target).then((row) => {
          decided.delete(id);
          return toItem(row);
        });
      },
    },
  };
}

async function allPendingPages<Item extends FeedbackQueueItem>(adapter: FeedbackSourceAdapter<Item>): Promise<Item[]> {
  const rows: Item[] = [];
  for (const status of PENDING_FEEDBACK as FeedbackQueueStatus[]) {
    let cursor: string | null = null;
    do {
      const page = await adapter.fetchPage({ status, search: "", sort: "oldest", cursor });
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
  }
  return rows;
}

async function allPendingGlossary(): Promise<GlossaryFeedbackItem[]> {
  const first = await requestJson("/api/glossary-feedback/queue");
  const locales = Array.isArray(first.locales)
    ? first.locales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const firstLocale = typeof first.locale === "string" ? first.locale : null;
  const rows = [...readFeedbackList<GlossaryFeedbackItem>(first)];
  for (const locale of locales) {
    if (locale === firstLocale) continue;
    const payload = await requestJson(`/api/glossary-feedback/queue?locale=${encodeURIComponent(locale)}`);
    rows.push(...readFeedbackList<GlossaryFeedbackItem>(payload));
  }
  return rows;
}

type ClaimTableSource = "citations" | "proposals" | "review-recommendations";

async function writeClaim(source: ClaimTableSource, id: string, action: "claim" | "takeover" | "release") {
  const payload = await postJson("/api/dev/inbox/claims", { action, source, id });
  if (action !== "release") {
    const claim = payload.claim as InboxClaim | undefined;
    if (!claim || typeof claim.claimed_by !== "string") {
      throw new Error("The server did not confirm the claim. Refresh to check who holds this item.");
    }
    return claim.claimed_by;
  }
  return null;
}

function claimTableSource<Row>(spec: {
  id: ClaimTableSource;
  toolLabel: string;
  load: () => Promise<Row[]>;
  idOf: (row: Row) => string;
  base: (row: Row) => Omit<InboxItem, "key" | "source" | "id" | "status" | "claimedBy">;
  detail: (row: Row) => ReactNode;
}): InboxSourceAdapter {
  const cache = rowCache<Row>();
  const claims = new Map<string, { by: string; expired: boolean } | null>();
  const toItem = (row: Row): InboxItem => {
    const id = spec.idOf(row);
    cache.put(id, row);
    const claim = claims.get(id) ?? null;
    const claimedBy = claim && !claim.expired ? claim.by : null;
    return {
      ...spec.base(row),
      key: inboxKey(spec.id, id),
      source: spec.id,
      id,
      status: claimedBy ? "reviewing" : "new",
      claimedBy,
      ...(claim?.expired ? { expiredClaimBy: claim.by } : {}),
    };
  };
  const hold = async (id: string, action: "claim" | "takeover") => {
    const by = await writeClaim(spec.id, id, action);
    claims.set(id, by ? { by, expired: false } : null);
    return toItem(cache.get(id));
  };
  return {
    id: spec.id,
    toolLabel: spec.toolLabel,
    async list({ claims: known }) {
      const rows = await spec.load();
      claims.clear();
      for (const row of rows) {
        const id = spec.idOf(row);
        const claim = known.get(inboxKey(spec.id, id));
        claims.set(id, claim ? { by: claim.claimed_by, expired: claim.expired === true } : null);
      }
      return rows.map(toItem);
    },
    detail(id) {
      return cache.has(id) ? spec.detail(cache.get(id)) : <MissingDetail />;
    },
    actions: {
      claim: (id) => hold(id, "claim"),
      takeOver: (id) => hold(id, "takeover"),
      async release(id) {
        await writeClaim(spec.id, id, "release");
        claims.set(id, null);
        return toItem(cache.get(id));
      },
      canRelease: () => true,
      decisions: () => [],
    },
  };
}

type CitationSummary = {
  slug: string;
  totalRows: number;
  approvedCount: number;
  rejectedCount: number;
  supportedCount: number;
  needsSourceCount: number;
  needsReviewCount: number;
  blockingCount: number;
  updatedAt: string | null;
};

function citationsSource() {
  return claimTableSource<CitationSummary>({
    id: "citations",
    toolLabel: "Citations",
    async load() {
      const payload = await requestJson("/api/citation-evidence/queue?status=open");
      if (!Array.isArray(payload.queue)) {
        throw new Error("The server did not return the citation queue. Try again.");
      }
      return payload.queue as CitationSummary[];
    },
    idOf: (row) => row.slug,
    base: (row) => ({
      title: row.slug,
      subtitle: `${row.totalRows - row.approvedCount} of ${row.totalRows} citations undecided`,
      urgency: row.blockingCount > 0 ? "high" : "normal",
      receivedAt: row.updatedAt ?? "",
      href: devHref({ type: "dev", tab: "citation-review", slug: row.slug }),
    }),
    detail: (row) => (
      <DetailFacts
        facts={[
          { label: "Ready to approve", value: row.supportedCount },
          { label: "Needs source", value: row.needsSourceCount },
          { label: "Needs review", value: row.needsReviewCount },
          { label: "Blocking publication", value: row.blockingCount },
          { label: "Approved", value: `${row.approvedCount} of ${row.totalRows}` },
          { label: "Last change", value: formatFeedbackDate(row.updatedAt ?? undefined) ?? "Unknown" },
        ]}
      />
    ),
  });
}

function proposalsSource() {
  return claimTableSource<ProposalSummary>({
    id: "proposals",
    toolLabel: "Change Review",
    load: () => fetchProposals("submitted"),
    idOf: (row) => row._id,
    base: (row) => ({
      title: row.summary || "Untitled proposal",
      subtitle: `${row.proposerName} · ${row.targets.length} ${row.targets.length === 1 ? "item" : "items"}`,
      urgency: "normal",
      receivedAt: row.createdAt,
      href: devHref({ type: "dev", tab: "queue", slug: encodeURIComponent(row._id) }),
    }),
    detail: (row) => (
      <div className="space-y-4">
        <DetailFacts
          facts={[
            { label: "Proposed by", value: row.proposerName },
            { label: "Submitted", value: formatFeedbackDate(row.createdAt) ?? "Unknown" },
            { label: "Comments", value: row.commentCount },
          ]}
        />
        <section>
          <DetailHeading>Changes</DetailHeading>
          <ul className="theme-text-secondary mt-2 list-disc space-y-1 pl-5 text-sm">
            {row.targets.map((target) => (
              <li key={`${target.kind}:${target.key}`}>{target.key}</li>
            ))}
          </ul>
        </section>
      </div>
    ),
  });
}

function recommendationsSource() {
  return claimTableSource<ReviewRecommendationRow>({
    id: "review-recommendations",
    toolLabel: "Change Review",
    load: fetchReviewRecommendations,
    idOf: (row) => row.slug,
    base: (row) => ({
      title: row.title || row.slug,
      subtitle: `Recommended as reviewed by ${formatReviewerIdentity(row.recommended_by) ?? row.recommended_by}`,
      urgency: row.stale ? "low" : "normal",
      receivedAt: row.recommended_at,
      href: reviewRecommendationHref(row.slug),
    }),
    detail: (row) => (
      <div className="space-y-4">
        {row.stale ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <EditorStatusPill tone="caution">Changed since recommended</EditorStatusPill>
            <span className="theme-text-muted">The article moved on, so this can only be looked at again, not approved.</span>
          </div>
        ) : null}
        <DetailFacts
          facts={[
            { label: "Recommended by", value: formatReviewerIdentity(row.recommended_by) ?? row.recommended_by },
            { label: "Recommended", value: formatFeedbackDate(row.recommended_at) ?? "Unknown" },
            { label: "Revision", value: <span className="font-mono">{row.revision}</span> },
          ]}
        />
        {row.note ? (
          <section>
            <DetailHeading>Note</DetailHeading>
            <p className="theme-text-secondary mt-2 max-w-prose whitespace-pre-line text-sm leading-6">{row.note}</p>
          </section>
        ) : null}
      </div>
    ),
  });
}

export function createInboxSources(): InboxSourceAdapter[] {
  return [
    tripReportsSource(),
    feedbackSource({
      id: "article-feedback",
      adapterFor: () => articleFeedbackAdapter,
      loadPending: () => allPendingPages(articleFeedbackAdapter),
      href: (row) => feedbackTaskHref({ source: "article", id: row.id }),
      claimer: (row) => claimerFromLog(row, "new"),
    }),
    feedbackSource({
      id: "site-feedback",
      adapterFor: () => siteFeedbackAdapter,
      loadPending: () => allPendingPages(siteFeedbackAdapter),
      href: (row) => feedbackTaskHref({ source: "site", id: row.id }),
      claimer: (row) => claimerFromLog(row, "new"),
    }),
    feedbackSource<GlossaryFeedbackItem>({
      id: "glossary-feedback",
      adapterFor: (row) => glossaryFeedbackAdapter(row.locale),
      loadPending: allPendingGlossary,
      href: (row) => readerSuggestionsHref(row.locale),
      claimer: (row) => (row.status === "reviewing" ? row.reviewed_by?.trim() || null : null),
    }),
    citationsSource(),
    proposalsSource(),
    recommendationsSource(),
  ];
}

