/**
 * Shared pieces of the `/api/dev/translation-glossary/*` routes: body parsing
 * (a locale the translation pipeline knows, terms as written) and the rows
 * the tab renders. Every route is admin-only and runs on Postgres; on any
 * other backend the glossary does not exist, so the routes answer 503.
 */
import { NextResponse } from "next/server";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getDataBackend } from "@server/postgres/runtime/backend";
import type { GlossaryLocaleSummary, TranslationGlossaryRow } from "@server/translation/glossary";
import { TRANSLATION_LOCALE_CODES } from "@server/translation/liveTranslation";

export const GLOSSARY_BODY_MAX_BYTES = 64 * 1024;

const MAX_TERM_LENGTH = 200;
const MAX_TARGET_LENGTH = 400;
const MAX_TERMS_PER_REQUEST = 1000;

export function parseLocale(raw: unknown): string {
  const locale = typeof raw === "string" ? raw.trim() : "";
  if (!TRANSLATION_LOCALE_CODES.includes(locale)) {
    throw new JsonBodyError(400, `Unknown locale. Known: ${TRANSLATION_LOCALE_CODES.join(", ")}.`);
  }
  return locale;
}

export function parseTerm(raw: unknown): string {
  const term = typeof raw === "string" ? raw.trim() : "";
  if (!term || term.length > MAX_TERM_LENGTH) {
    throw new JsonBodyError(400, "A glossary term is required.");
  }
  return term;
}

export function parseTerms(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TERMS_PER_REQUEST) {
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

/** The 503 every glossary route answers when the process is not on Postgres. */
export function glossaryUnavailable(): NextResponse | null {
  if (getDataBackend() === "postgres") return null;
  return NextResponse.json({ error: "The translation glossary lives in Postgres; this deployment is not on the Postgres backend." }, { status: 503 });
}

/** One locale in the picker: the live mirrors always, plus any locale with rows. */
export type GlossaryLocaleOption = GlossaryLocaleSummary & { live: boolean };

export type GlossaryListResponse = {
  ok: true;
  locale: string;
  /** The prompt digest the approved set currently produces; segments stamped otherwise are stale. */
  promptVersion: string;
  /** Stored segments for the locale and how many carry `promptVersion`. */
  segments: { total: number; current: number };
  locales: GlossaryLocaleOption[];
  rows: TranslationGlossaryRow[];
  /** Approved terms whose rendering changed since it last reached stored segments: what a retranslate sends. */
  pending: string[];
  /** `term -> gloss`, the locale-independent English definitions; shown under each row and injected into every prompt. */
  glosses: Record<string, string>;
};
