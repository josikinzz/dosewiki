/**
 * Shared pieces of the `/api/dev/translation-glossary/*` routes: body parsing
 * (a locale the translation pipeline knows, terms as written) and the rows
 * the tab renders. Mutations require their existing role floor and Postgres.
 */
import { NextResponse } from "next/server";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import {
  approvedGlossaryLocales,
  canAccessGlossaryLocale,
} from "@/lib/auth/roles";
import type { RoleSessionGranted } from "@/lib/auth/requireEditorSession";
import {
  GlossaryCollisionError,
  pendingRetranslation,
  type GlossaryLocaleSummary,
} from "@server/translation/glossary";
import { TranslationReviewError } from "@server/translation/reviewStore";
import { parseReviewReason, type ReviewReason } from "@server/translation/reviewReason";
import type { GlossaryReviewRow } from "@server/translation/glossaryReview";
import { TRANSLATION_LOCALE_CODES } from "@server/translation/liveTranslation";
import type { TranslationJobCounts } from "@server/translation/segmentStore";

export const GLOSSARY_BODY_MAX_BYTES = 64 * 1024;

const MAX_TERM_LENGTH = 200;
const MAX_TARGET_LENGTH = 400;
const MAX_TERMS_PER_REQUEST = 1000;

export function parseLocale(raw: unknown): string {
  const locale = typeof raw === "string" ? raw.trim() : "";
  if (!TRANSLATION_LOCALE_CODES.includes(locale)) {
    throw new JsonBodyError(
      400,
      `Unknown locale. Known: ${TRANSLATION_LOCALE_CODES.join(", ")}.`,
    );
  }
  return locale;
}

export function glossaryLocaleAccess(
  auth: RoleSessionGranted,
  locale: string,
): NextResponse | null {
  if (
    canAccessGlossaryLocale(
      { role: auth.role, glossaryLocales: auth.session.user.glossaryLocales },
      locale,
    )
  )
    return null;
  return NextResponse.json(
    {
      error: `You are not approved to access the ${locale} translation glossary. Ask an admin to assign this language.`,
    },
    { status: 403 },
  );
}

export function glossaryAccessibleLocales(auth: RoleSessionGranted): string[] {
  return approvedGlossaryLocales({
    role: auth.role,
    glossaryLocales: auth.session.user.glossaryLocales,
  });
}

export function parseTerm(raw: unknown): string {
  const term = typeof raw === "string" ? raw.trim() : "";
  if (!term || term.length > MAX_TERM_LENGTH) {
    throw new JsonBodyError(400, "A glossary term is required.");
  }
  return term;
}

export function parseTerms(raw: unknown): string[] {
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > MAX_TERMS_PER_REQUEST
  ) {
    throw new JsonBodyError(400, `Pass 1 to ${MAX_TERMS_PER_REQUEST} terms.`);
  }
  return [...new Set(raw.map(parseTerm))];
}

export function parseTarget(raw: unknown): string {
  const target = typeof raw === "string" ? raw.trim() : "";
  if (!target || target.length > MAX_TARGET_LENGTH) {
    throw new JsonBodyError(400, "A non-empty target rendering is required.");
  }
  return target;
}

/**
 * The reviewer's reason for a glossary write: `{ kind, note }` or legacy text.
 * Absent means the route's default wording; malformed is refused.
 */
export function parseGlossaryReason(raw: unknown, maxNote = 1000): ReviewReason | undefined {
  if (raw === undefined || (typeof raw === "string" && !raw.trim())) return undefined;
  const reason = parseReviewReason(raw);
  if (!reason || reason.note.length > maxNote)
    throw new JsonBodyError(400, `Choose a reason kind; a note is at most ${maxNote} characters.`);
  return reason;
}

/** A fixed-size acknowledgement, never a blanket override or a body in a query. */
export function parseCollisionConfirmation(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw)) {
    throw new JsonBodyError(400, "Invalid shared-rendering confirmation.");
  }
  return raw;
}

/** The digest a progress poll measures segments against; the client echoes what the last full load returned. */
export function parsePromptVersion(raw: unknown): string {
  if (typeof raw !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(raw))
    throw new JsonBodyError(400, "Refresh the glossary before polling its progress.");
  return raw;
}

export function parseExpectedRevision(raw: unknown): string {
  if (typeof raw !== "string" || !/^\d+:\d+$/.test(raw))
    throw new JsonBodyError(
      400,
      "Reload the glossary before saving or approving this revision.",
    );
  return raw;
}

export function parseExpectedRevisions(
  raw: unknown,
  terms: string[],
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new JsonBodyError(400, "Expected revisions are required.");
  return Object.fromEntries(
    terms.map((term) => [
      term,
      parseExpectedRevision((raw as Record<string, unknown>)[term]),
    ]),
  );
}

export function glossaryCollisionResponse(error: unknown): NextResponse | null {
  if (error instanceof TranslationReviewError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  if (!(error instanceof GlossaryCollisionError)) return null;
  return NextResponse.json(
    {
      error: error.message,
      collisions: error.collisions,
      collisionConfirmation: error.collisionConfirmation,
    },
    { status: 409 },
  );
}

/** One locale in the picker: the live mirrors always, plus any locale with rows. */
export type GlossaryLocaleOption = GlossaryLocaleSummary & { live: boolean };

export type GlossaryListResponse = {
  ok: true;
  generatedAt: number;
  locale: string;
  /** The prompt digest the approved set currently produces; segments stamped otherwise are stale. */
  promptVersion: string;
  /** Stored segments for the locale and how many carry `promptVersion`. */
  segments: { total: number; current: number };
  /** Newest translation enqueue generation, with terminal rejections separated from actionable work. */
  jobs: TranslationJobCounts;
  locales: GlossaryLocaleOption[];
  rows: GlossaryReviewRow[];
  /** First-page source locations computed before row disclosures render. Omitted from background progress polls. */
  usages?: import("@/lib/glossary/glossaryUsage").GlossaryUsageMap;
  /** Approved terms whose rendering changed since it last reached stored segments: what a retranslate sends. */
  pending: string[];
  /** `term -> gloss`, the locale-independent English definitions; shown under each row and injected into every prompt. */
  glosses: Record<string, string>;
};

/** The progress-only answer to the workbench's poll: counts, no rows. */
export type GlossaryProgressResponse = Pick<GlossaryListResponse, "ok" | "generatedAt" | "locale" | "promptVersion" | "segments" | "jobs">;

/**
 * What a row write returns so the workbench patches those rows in place
 * instead of reloading the locale: the written rows as the list shows them,
 * and the retranslation list, which an approval can change.
 */
export type GlossaryRowPatch = Pick<GlossaryListResponse, "rows" | "pending">;

export function glossaryRowPatch(rows: readonly GlossaryReviewRow[], terms: readonly string[]): GlossaryRowPatch {
  const written = new Set(terms);
  return {
    rows: rows.filter((row) => written.has(row.term)),
    // A review row shows a pending draft over the stored status; the list's
    // retranslation set reads the stored status, which `approved_target` keeps.
    pending: pendingRetranslation(rows.map((row) => ({ ...row, status: row.approved_target === null ? ("draft" as const) : ("approved" as const) }))),
  };
}
