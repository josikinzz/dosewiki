import type { ProposalStatus } from "./proposalStatus";
import { readArticlePatches } from "./articlePatch";
import { readFeedbackRef } from "../../src/features/intake/feedbackCorrection";

/** Display identity is explicitly chosen public profile text, never an email-derived name. */
export function safeProposalName(value: unknown, fallback: "Contributor" | "Reviewer"): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name && !/[@\p{Cc}]/u.test(name) ? name : fallback;
}

type Target = { kind: "article" | "indexLayout" | "copyBlock" | "about" | "writing"; key: string; baseHash: string };
type CommentSource = { by?: string; authorName?: string; at: string; text: string };
type SummarySource = {
  _id: string;
  proposedBy?: string;
  proposerName?: string;
  isAuthor?: boolean;
  reviewedBy?: string;
  reviewerName?: string;
  createdAt: string;
  updatedAt: string;
  status: ProposalStatus;
  targets: Target[];
  summary: string;
  revisionOf?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  comments?: CommentSource[];
  commentCount?: number;
  appliedAt?: string;
  conflictReason?: string;
  /** The stored proposal body; only its `feedbackRef` is read here. */
  payload?: unknown;
  /** An already projected feedback reference (the route re-projects Postgres results). */
  feedbackRef?: unknown;
};

export function projectProposalComment(comment: CommentSource) {
  return { authorName: safeProposalName(comment.authorName, "Contributor"), at: comment.at, text: comment.text };
}

/** Also accepts the old Postgres result during rollout. Raw ownership is consumed only on the server. */
export function projectProposalSummary(row: SummarySource, actorEmail: string) {
  return {
    _id: row._id,
    proposerName: safeProposalName(row.proposerName, "Contributor"),
    isAuthor: typeof row.proposedBy === "string" ? row.proposedBy === actorEmail : row.isAuthor === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    targets: row.targets.map(({ kind, key, baseHash }) => ({ kind, key, baseHash })),
    summary: row.summary,
    revisionOf: row.revisionOf,
    reviewerName: row.reviewedBy !== undefined || row.reviewerName !== undefined || row.reviewedAt !== undefined
      ? safeProposalName(row.reviewerName, "Reviewer") : undefined,
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    commentCount: row.comments?.length ?? row.commentCount ?? 0,
    appliedAt: row.appliedAt,
    conflictReason: row.conflictReason,
    // The reader feedback this proposal answers: its id and section only, never
    // the reader's contact details or words.
    ...optionalFeedbackRef(row),
  };
}

function optionalFeedbackRef(row: SummarySource) {
  const payload = row.payload !== null && typeof row.payload === "object" ? row.payload as { feedbackRef?: unknown } : null;
  const feedbackRef = readFeedbackRef(row.feedbackRef) ?? readFeedbackRef(payload?.feedbackRef);
  return feedbackRef ? { feedbackRef } : {};
}


/** Only document-envelope audit/contact metadata is private. Article prose and reference content stay intact. */
export function proposalPublicDocument(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    submittedBy: _submittedBy, proposedBy: _proposedBy, reviewedBy: _reviewedBy,
    updatedBy: _updatedBy, createdBy: _createdBy, actorEmail: _actorEmail,
    email: _email, contactEmail: _contactEmail, membershipEmail: _membershipEmail,
    contact: _contact, ...document
  } = value as Record<string, unknown>;
  return document;
}

type PayloadSource = {
  articles?: unknown[];
  indexLayouts?: unknown[];
  copyBlocks?: unknown[];
  about?: unknown;
  writing?: unknown;
};

// Client-supplied changelog markdown and attribution are not needed to seed
// the editor. The verified server diff is the sole comparison transport.
function projectProposalPayload(payload: unknown) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  const value = payload as PayloadSource;
  return {
    ...(Array.isArray(value.articles) ? { articles: value.articles.map(proposalPublicDocument) } : {}),
    ...(Array.isArray(value.indexLayouts) ? { indexLayouts: value.indexLayouts.map(proposalPublicDocument) } : {}),
    ...(Array.isArray(value.copyBlocks) ? { copyBlocks: value.copyBlocks.map(proposalPublicDocument) } : {}),
    ...(value.about !== undefined ? { about: proposalPublicDocument(value.about) } : {}),
    ...(value.writing !== undefined ? { writing: proposalPublicDocument(value.writing) } : {}),
  };
}

/** Historical generated diffs can contain audit-field sections from before the projection existed. */
export function proposalPublicDiff(markdown: string): string {
  let incomplete = false;
  const diff = markdown.split(/(?=^# )/mu).map((section) => {
    if (/^# (?:article|indexLayout|copyBlock|about|writing): [^\n]+ \/ (?:submittedBy|proposedBy|reviewedBy|updatedBy|createdBy|actorEmail|email|contactEmail|membershipEmail|contact)(?:[.\s[]|$)/u.test(section)) {
      return "";
    }
    // A newly created/deleted document is serialized as a whole JSON object,
    // rather than one section per field. Scrub only its envelope, not prose.
    if (!/^# (?:article|indexLayout|copyBlock|about|writing): [^\n]+\n/u.test(section) ||
        section.slice(0, section.indexOf("\n")).includes(" / ") ||
        !/^[+-] {2}"(?:submittedBy|proposedBy|reviewedBy|updatedBy|createdBy|actorEmail|email|contactEmail|membershipEmail|contact)":/mu.test(section)) {
      return section;
    }
    const lines = section.split("\n");
    const body: string[] = [];
    try {
      for (const prefix of ["-", "+"]) {
        const side = lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(1)).join("\n");
        if (!side) continue;
        const document: unknown = JSON.parse(side);
        body.push(...JSON.stringify(proposalPublicDocument(document), null, 2).split("\n").map((line) => `${prefix}${line}`));
      }
    } catch {
      // Do not permit approval based on a partial historical comparison when
      // a truncated object cannot be separated from its private metadata.
      incomplete = true;
      return "";
    }
    return `${lines[0]}\n\n${body.join("\n")}\n`;
  }).join("");
  return incomplete ? "" : diff;
}

/** No storage snapshots or audit fields cross the review transport, even from legacy functions. */
export function projectProposalDetail(row: SummarySource & {
  payload?: unknown;
  diff: string;
  comparisonMode?: "applied" | "submitted" | "verified_live" | "unavailable";
  comparisonNote?: string;
  comments: CommentSource[];
  revertedAt?: string;
  liveHashes: Array<{ kind: Target["kind"]; key: string; hash: string }>;
  articlePatches?: unknown;
}, actorEmail: string, options: { includePayload?: boolean } = {}) {
  const diff = proposalPublicDiff(row.diff);
  const privateComparison = row.diff.trim().length > 0 && diff.trim().length === 0;
  // Field changes are read only when the comparison they came from is shown.
  const articlePatches = privateComparison || row.comparisonMode === "unavailable" ? null : readArticlePatches(row.articlePatches);
  return {
    ...projectProposalSummary(row, actorEmail),
    ...(options.includePayload === false ? {} : { payload: projectProposalPayload(row.payload) }),
    diff,
    comparisonMode: privateComparison ? "unavailable" as const : row.comparisonMode,
    comparisonNote: privateComparison
      ? "This historical comparison cannot be shown without private audit metadata. Load current production and submit a fresh revision."
      : row.comparisonNote,
    comments: row.comments.map(projectProposalComment),
    revertedAt: row.revertedAt,
    liveHashes: row.liveHashes.map(({ kind, key, hash }) => ({ kind, key, hash })),
    ...(articlePatches ? { articlePatches } : {}),
  };
}
