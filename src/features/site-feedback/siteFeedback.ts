/**
 * Site feedback domain model: the public "general feedback" intake at
 * /about/feedback covering the site as a whole (article requests, technical
 * issues, UI/design, performance, accessibility, misc).
 *
 * This module stays isomorphic (no Node imports) so the public form and the
 * /dev review tab can share the enums, labels, placeholders, and validation
 * at runtime. Server-only concerns (IP hashing, Postgres store, Turnstile
 * verification) live in siteFeedbackStore.server.ts.
 */

import { msg } from "@/i18n/messages";

const SITE_FEEDBACK_SCHEMA_VERSION = 1;

export const SITE_FEEDBACK_CATEGORIES = [
  "article-request",
  "technical",
  "ui-design",
  "performance",
  "accessibility",
  "misc",
] as const;

export type SiteFeedbackCategory = (typeof SITE_FEEDBACK_CATEGORIES)[number];

export const SITE_FEEDBACK_CATEGORY_LABELS: Record<SiteFeedbackCategory, string> = {
  "article-request": msg("Article request"),
  technical: msg("Website technical issue"),
  "ui-design": msg("UI / design"),
  performance: msg("Performance"),
  accessibility: msg("Accessibility"),
  misc: msg("Miscellaneous"),
};

/**
 * Per-category placeholder copy for the details textarea (Lyrea's texts,
 * verbatim from the PRD prototype).
 */
export const SITE_FEEDBACK_CATEGORY_PLACEHOLDERS: Record<SiteFeedbackCategory, string> = {
  "article-request": msg(
    "Which article do you wish for? The more additional data provided the easier it will be to get started. Name, CAS#, experience reports and scientific literature all greatly help.",
  ),
  technical: msg(
    "What currently isn't working as intended? Please list any technical issues, performance problems, or broken functionality such as hyperlinks or glitches. Providing detail like operating system, browser, and steps to replicate the issue will greatly aid in solving the problem.",
  ),
  "ui-design": msg(
    "Layout, navigation, mobile or desktop experience, visual design — what would you change, and where?",
  ),
  performance: msg(
    "What feels slow? Page loading, search speed, media loading — the page and rough timings help a lot.",
  ),
  accessibility: msg(
    "Screen readers, keyboard navigation, contrast, motion — what got in your way, and what technology were you using?",
  ),
  misc: msg(
    "None of the other categories suit the type of feedback? Feel free to write it here. For collaboration, legal or media inquiries, or takedown requests, please email contact@dose.wiki instead.",
  ),
};

export const SITE_FEEDBACK_URGENCIES = [
  "critical",
  "high",
  "normal",
  "low",
] as const;

export type SiteFeedbackUrgency = (typeof SITE_FEEDBACK_URGENCIES)[number];

export const SITE_FEEDBACK_URGENCY_LABELS: Record<SiteFeedbackUrgency, string> = {
  critical: msg("Critical — safety or data issue"),
  high: msg("High — degrades the site"),
  normal: msg("Normal — worth fixing"),
  low: msg("Low — cosmetic"),
};

/** Categories where the urgency dropdown applies (bug-like categories). */
const SITE_FEEDBACK_URGENCY_CATEGORIES = [
  "technical",
  "performance",
  "accessibility",
] as const satisfies readonly SiteFeedbackCategory[];

export function siteFeedbackCategoryAcceptsUrgency(category: string): boolean {
  return (SITE_FEEDBACK_URGENCY_CATEGORIES as readonly string[]).includes(category);
}

const SITE_FEEDBACK_STATUSES = [
  "new",
  "reviewing",
  "resolved",
  "rejected",
  "spam",
] as const;

export type SiteFeedbackStatus = (typeof SITE_FEEDBACK_STATUSES)[number];

/**
 * Statuses that are still asking for an editor. The Feedback tab's rail badge
 * counts exactly these rows, so the badge and the queue agree on what is
 * pending.
 */
export const SITE_FEEDBACK_PENDING_STATUSES = ["new", "reviewing"] as const satisfies readonly SiteFeedbackStatus[];

export const SITE_FEEDBACK_STATUS_TRANSITIONS: Record<
  SiteFeedbackStatus,
  SiteFeedbackStatus[]
> = {
  new: ["reviewing", "resolved", "rejected", "spam"],
  reviewing: ["resolved", "rejected", "spam", "new"],
  resolved: ["reviewing"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
};

export const SITE_FEEDBACK_DETAILS_MAX_LENGTH = 4000;
const SITE_FEEDBACK_PAGE_MAX_LENGTH = 2000;
const SITE_FEEDBACK_EMAIL_MAX_LENGTH = 254;

export type SiteFeedbackInput = {
  category: string;
  urgency?: string;
  details: string;
  page?: string;
  email?: string;
  honeypot?: string;
  user_agent?: string;
};

export type SiteFeedbackRow = {
  id: string;
  status: SiteFeedbackStatus;
  schema_version: typeof SITE_FEEDBACK_SCHEMA_VERSION;
  category: SiteFeedbackCategory;
  urgency?: SiteFeedbackUrgency;
  details: string;
  page?: string;
  email?: string;
  ip_hash?: string;
  user_agent?: string;
  honeypot_triggered: boolean;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

export type NormalizedSiteFeedbackInput = {
  category: string;
  urgency?: string;
  details: string;
  page?: string;
  email?: string;
  honeypot: string;
  user_agent?: string;
};

export type SiteFeedbackValidationResult =
  | { ok: true; normalized: NormalizedSiteFeedbackInput }
  | { ok: false; errors: string[] };

export function isSiteFeedbackStatus(value: unknown): value is SiteFeedbackStatus {
  return (
    typeof value === "string" &&
    SITE_FEEDBACK_STATUSES.includes(value as SiteFeedbackStatus)
  );
}

function isSiteFeedbackCategory(value: unknown): value is SiteFeedbackCategory {
  return (
    typeof value === "string" &&
    SITE_FEEDBACK_CATEGORIES.includes(value as SiteFeedbackCategory)
  );
}

function isSiteFeedbackUrgency(value: unknown): value is SiteFeedbackUrgency {
  return (
    typeof value === "string" &&
    SITE_FEEDBACK_URGENCIES.includes(value as SiteFeedbackUrgency)
  );
}

export function validateSiteFeedback(
  input: SiteFeedbackInput,
): SiteFeedbackValidationResult {
  const normalized = normalizeSiteFeedbackInput(input);
  const errors: string[] = [];

  if (!isSiteFeedbackCategory(normalized.category)) {
    errors.push("Pick what kind of feedback this is.");
  }

  if (normalized.urgency !== undefined) {
    if (!isSiteFeedbackUrgency(normalized.urgency)) {
      errors.push("Pick how urgent this is.");
    } else if (!siteFeedbackCategoryAcceptsUrgency(normalized.category)) {
      errors.push("Urgency only applies to technical, performance, or accessibility feedback.");
    }
  }

  if (!normalized.details) {
    errors.push("Details are required — tell us what should change.");
  } else if (normalized.details.length > SITE_FEEDBACK_DETAILS_MAX_LENGTH) {
    errors.push(`Details must stay under ${SITE_FEEDBACK_DETAILS_MAX_LENGTH} characters.`);
  }

  if (normalized.page && normalized.page.length > SITE_FEEDBACK_PAGE_MAX_LENGTH) {
    errors.push("The page reference is too long.");
  }

  if (normalized.email) {
    if (
      normalized.email.length > SITE_FEEDBACK_EMAIL_MAX_LENGTH ||
      !normalized.email.includes("@")
    ) {
      errors.push("The contact email does not look valid.");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, normalized };
}

export type CreateSiteFeedbackOptions = {
  id: string;
  now?: Date;
  ip_hash?: string;
};

export function createSiteFeedbackRow(
  normalized: NormalizedSiteFeedbackInput,
  options: CreateSiteFeedbackOptions,
): SiteFeedbackRow {
  const { category } = normalized;
  if (!isSiteFeedbackCategory(category)) {
    throw new Error("Site feedback must be validated before a row is created.");
  }
  let urgency: SiteFeedbackUrgency | undefined;
  if (normalized.urgency !== undefined) {
    if (!isSiteFeedbackUrgency(normalized.urgency)) {
      throw new Error("Site feedback must be validated before a row is created.");
    }
    urgency = normalized.urgency;
  }

  const timestamp = (options.now ?? new Date()).toISOString();
  const honeypotTriggered = normalized.honeypot.length > 0;

  return {
    id: options.id,
    status: honeypotTriggered ? "spam" : "new",
    schema_version: SITE_FEEDBACK_SCHEMA_VERSION,
    category,
    urgency,
    details: normalized.details,
    page: normalized.page,
    email: normalized.email,
    ip_hash: options.ip_hash,
    user_agent: normalized.user_agent,
    honeypot_triggered: honeypotTriggered,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function normalizeSiteFeedbackInput(
  input: SiteFeedbackInput,
): NormalizedSiteFeedbackInput {
  return {
    category: trim(input.category),
    urgency: emptyToUndefined(trim(input.urgency)),
    details: trim(input.details),
    page: emptyToUndefined(trim(input.page)),
    email: emptyToUndefined(trim(input.email)),
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
