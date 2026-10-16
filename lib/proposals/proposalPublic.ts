import type { ProposalStatus } from "./proposalStatus";
import { readArticlePatches } from "./articlePatch";
import { readFeedbackRef } from "../../src/features/intake/feedbackCorrection";

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
  payload?: unknown;
  feedbackRef?: unknown;
};

export function projectProposalComment(comment: CommentSource) {
  return { authorName: safeProposalName(comment.authorName, "Contributor"), at: comment.at, text: comment.text };
}

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
    ...optionalFeedbackRef(row),
  };
}

function optionalFeedbackRef(row: SummarySource) {
  const payload = row.payload !== null && typeof row.payload === "object" ? row.payload as { feedbackRef?: unknown } : null;
  const feedbackRef = readFeedbackRef(row.feedbackRef) ?? readFeedbackRef(payload?.feedbackRef);
  return feedbackRef ? { feedbackRef } : {};
}

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

export function proposalPublicDiff(markdown: string): string {
  let incomplete = false;
  const diff = markdown.split(/(?=^# )/mu).map((section) => {
    if (/^# (?:article|indexLayout|copyBlock|about|writing): [^\n]+ \/ (?:submittedBy|proposedBy|reviewedBy|updatedBy|createdBy|actorEmail|email|contactEmail|membershipEmail|contact)(?:[.\s[]|$)/u.test(section)) {
      return "";
    }
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
      incomplete = true;
      return "";
    }
    return `${lines[0]}\n\n${body.join("\n")}\n`;
  }).join("");
  return incomplete ? "" : diff;
}

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
