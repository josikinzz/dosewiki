/**
 * Article feedback domain model: the private "report an issue / suggest an
 * edit" intake shown at the bottom of every substance article.
 *
 * This module stays isomorphic (no Node imports) so the public form and the
 * /dev review tab can share the enums, labels, and validation at runtime.
 * Server-only concerns (IP hashing, Postgres store) live in
 * articleFeedbackStore.server.ts.
 */

import { msg } from "@/i18n/messages";

const ARTICLE_FEEDBACK_SCHEMA_VERSION = 1;

export const ARTICLE_FEEDBACK_CATEGORIES = [
  "inaccurate",
  "missing",
  "source",
  "broken-link",
  "other",
] as const;

export type ArticleFeedbackCategory = (typeof ARTICLE_FEEDBACK_CATEGORIES)[number];

export const ARTICLE_FEEDBACK_CATEGORY_LABELS: Record<ArticleFeedbackCategory, string> = {
  inaccurate: msg("Incorrect or outdated information"),
  missing: msg("Missing information"),
  source: msg("New study or source"),
  "broken-link": msg("Broken link"),
  other: msg("Something else"),
};

export const ARTICLE_FEEDBACK_IMPORTANCES = [
  "critical",
  "high",
  "normal",
  "low",
] as const;

export type ArticleFeedbackImportance = (typeof ARTICLE_FEEDBACK_IMPORTANCES)[number];

export const ARTICLE_FEEDBACK_IMPORTANCE_LABELS: Record<ArticleFeedbackImportance, string> = {
  critical: msg("Critical — a safety issue"),
  high: msg("High — clearly wrong"),
  normal: msg("Normal — worth fixing"),
  low: msg("Low — minor or cosmetic"),
};

const ARTICLE_FEEDBACK_STATUSES = [
  "new",
  "reviewing",
  "resolved",
  "rejected",
  "spam",
] as const;

export type ArticleFeedbackStatus = (typeof ARTICLE_FEEDBACK_STATUSES)[number];

/**
 * Statuses that are still asking for an editor. The Feedback tab's rail badge
 * counts exactly these rows, so the badge and the queue agree on what is
 * pending.
 */
export const ARTICLE_FEEDBACK_PENDING_STATUSES = ["new", "reviewing"] as const satisfies readonly ArticleFeedbackStatus[];

export const ARTICLE_FEEDBACK_STATUS_TRANSITIONS: Record<
  ArticleFeedbackStatus,
  ArticleFeedbackStatus[]
> = {
  new: ["reviewing", "resolved", "rejected", "spam"],
  reviewing: ["resolved", "rejected", "spam", "new"],
  resolved: ["reviewing"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
};

export const ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH = 4000;
const ARTICLE_FEEDBACK_URL_MAX_LENGTH = 2000;
const ARTICLE_FEEDBACK_EMAIL_MAX_LENGTH = 254;
const ARTICLE_FEEDBACK_SUBSTANCE_MAX_LENGTH = 200;

export type ArticleFeedbackInput = {
  substance_slug: string;
  substance_title: string;
  category: string;
  importance: string;
  details: string;
  source_url?: string;
  contact_email?: string;
  honeypot?: string;
  user_agent?: string;
};

export type ArticleFeedbackRow = {
  id: string;
  status: ArticleFeedbackStatus;
  schema_version: typeof ARTICLE_FEEDBACK_SCHEMA_VERSION;
  substance_slug: string;
  substance_title: string;
  category: ArticleFeedbackCategory;
  importance: ArticleFeedbackImportance;
  details: string;
  source_url?: string;
  contact_email?: string;
  ip_hash?: string;
  user_agent?: string;
  honeypot_triggered: boolean;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

export type NormalizedArticleFeedbackInput = {
  substance_slug: string;
  substance_title: string;
  category: string;
  importance: string;
  details: string;
  source_url?: string;
  contact_email?: string;
  honeypot: string;
  user_agent?: string;
};

export type ArticleFeedbackValidationResult =
  | { ok: true; normalized: NormalizedArticleFeedbackInput }
  | { ok: false; errors: string[] };

export function isArticleFeedbackStatus(value: unknown): value is ArticleFeedbackStatus {
  return (
    typeof value === "string" &&
    ARTICLE_FEEDBACK_STATUSES.includes(value as ArticleFeedbackStatus)
  );
}

function isArticleFeedbackCategory(value: unknown): value is ArticleFeedbackCategory {
  return (
    typeof value === "string" &&
    ARTICLE_FEEDBACK_CATEGORIES.includes(value as ArticleFeedbackCategory)
  );
}

function isArticleFeedbackImportance(value: unknown): value is ArticleFeedbackImportance {
  return (
    typeof value === "string" &&
    ARTICLE_FEEDBACK_IMPORTANCES.includes(value as ArticleFeedbackImportance)
  );
}

export function validateArticleFeedback(
  input: ArticleFeedbackInput,
): ArticleFeedbackValidationResult {
  const normalized = normalizeArticleFeedbackInput(input);
  const errors: string[] = [];

  if (!normalized.substance_slug || normalized.substance_slug.length > ARTICLE_FEEDBACK_SUBSTANCE_MAX_LENGTH) {
    errors.push(msg("A valid substance reference is required."));
  }

  if (!normalized.substance_title || normalized.substance_title.length > ARTICLE_FEEDBACK_SUBSTANCE_MAX_LENGTH) {
    errors.push(msg("A valid substance name is required."));
  }

  if (!isArticleFeedbackCategory(normalized.category)) {
    errors.push(msg("Pick what kind of feedback this is."));
  }

  if (!isArticleFeedbackImportance(normalized.importance)) {
    errors.push(msg("Pick how important this is."));
  }

  if (!normalized.details) {
    errors.push(msg("Details are required — tell us what should change."));
  } else if (normalized.details.length > ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH) {
    errors.push(`Details must stay under ${ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH} characters.`);
  }

  if (normalized.source_url) {
    if (normalized.source_url.length > ARTICLE_FEEDBACK_URL_MAX_LENGTH) {
      errors.push(msg("The source URL is too long."));
    } else if (!/^https?:\/\//i.test(normalized.source_url)) {
      errors.push(msg("The source URL must start with http:// or https://."));
    }
  }

  if (normalized.contact_email) {
    if (
      normalized.contact_email.length > ARTICLE_FEEDBACK_EMAIL_MAX_LENGTH ||
      !normalized.contact_email.includes("@")
    ) {
      errors.push(msg("The contact email does not look valid."));
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, normalized };
}

export type CreateArticleFeedbackOptions = {
  id: string;
  now?: Date;
  ip_hash?: string;
};

export function createArticleFeedbackRow(
  normalized: NormalizedArticleFeedbackInput,
  options: CreateArticleFeedbackOptions,
): ArticleFeedbackRow {
  if (!isArticleFeedbackCategory(normalized.category) || !isArticleFeedbackImportance(normalized.importance)) {
    throw new Error("Article feedback must be validated before a row is created.");
  }

  const timestamp = (options.now ?? new Date()).toISOString();
  const honeypotTriggered = normalized.honeypot.length > 0;

  return {
    id: options.id,
    status: honeypotTriggered ? "spam" : "new",
    schema_version: ARTICLE_FEEDBACK_SCHEMA_VERSION,
    substance_slug: normalized.substance_slug,
    substance_title: normalized.substance_title,
    category: normalized.category,
    importance: normalized.importance,
    details: normalized.details,
    source_url: normalized.source_url,
    contact_email: normalized.contact_email,
    ip_hash: options.ip_hash,
    user_agent: normalized.user_agent,
    honeypot_triggered: honeypotTriggered,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function normalizeArticleFeedbackInput(
  input: ArticleFeedbackInput,
): NormalizedArticleFeedbackInput {
  return {
    substance_slug: trim(input.substance_slug),
    substance_title: trim(input.substance_title),
    category: trim(input.category),
    importance: trim(input.importance),
    details: trim(input.details),
    source_url: emptyToUndefined(trim(input.source_url)),
    contact_email: emptyToUndefined(trim(input.contact_email)),
    honeypot: trim(input.honeypot),
    user_agent: emptyToUndefined(trim(input.user_agent)),
  };
}

function trim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}
