/**
 * POST /api/dev/translation-glossary/import?locale=zh-Hans  (body: text/csv)
 *
 * Translator and up. Takes back the CSV /export writes, edited in a
 * spreadsheet: `term,target,kind,status`, kind and status optional. Every
 * term must already be a row of the locale or a term the site publishes;
 * the file is refused whole when any is not, when any target is blank, or
 * when a term appears twice, so a typo never lands half a list. Rows marked
 * `approved`, and rows for a term the locale has already approved, are
 * approved as the signed-in translator (nothing else on the site un-approves
 * a rendering, so a blank status column cannot either); every other row is a
 * human draft for review. An approved batch that would give two terms of one
 * kind the same rendering is refused with 409 before anything is written.
 * A reviewed retry keeps the CSV body and supplies the returned fixed-size
 * digest in X-Glossary-Collision-Confirmation; the current set is rechecked.
 */
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

import { GlossaryCsvError, parseGlossaryCsv } from "@/features/dev/tools/glossary/glossaryModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readGlossaryRows, upsertGlossaryRows, type GlossaryDraft } from "@server/translation/glossary";
import { collectGlossaryTerms } from "@server/translation/glossaryDraft";
import { glossaryCollisionResponse, glossaryLocaleAccess, parseCollisionConfirmation, parseLocale } from "../glossaryRoutes";

export const runtime = "nodejs";

const GLOSSARY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type ImportResponse = { ok: true; locale: string; approved: number; drafts: number };

const listed = (terms: readonly string[]) => (terms.length > 8 ? `${terms.slice(0, 8).join(", ")} and ${terms.length - 8} more` : terms.join(", "));

export const POST = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  unexpectedErrorLabel: "Failed to import the translation glossary via Next route:",
  unexpectedErrorMessage: "Unable to import the translation glossary right now.",
  mapError: (error) =>
    error instanceof GlossaryCsvError
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : glossaryCollisionResponse(error),
  operation: async ({ request, actorEmail, auth }) => {
    getDataBackend();
    const locale = parseLocale(new URL(request.url).searchParams.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const collisionConfirmation = parseCollisionConfirmation(request.headers.get("X-Glossary-Collision-Confirmation") ?? undefined);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > GLOSSARY_IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: "That file is over 2 MB; split it up." }, { status: 413 });
    }
    const rows = parseGlossaryCsv(text);
    if (rows.length === 0) return NextResponse.json({ error: "The file has no rows below the header." }, { status: 400 });

    // The universe first, then the locale's own rows over it: an existing row's
    // spelling and kind win, and a term only the site publishes is still known.
    const [existing, universe] = await Promise.all([readGlossaryRows(locale), collectGlossaryTerms(getPublicDataReadAdapter())]);
    const known = new Map<string, { term: string; kind: string; approved: boolean }>();
    for (const entry of universe) known.set(entry.term.toLowerCase(), { ...entry, approved: false });
    for (const row of existing) known.set(row.term.toLowerCase(), { term: row.term, kind: row.kind, approved: row.status === "approved" });

    const unknownTerms: string[] = [];
    const emptyTargets: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();
    const batches: Record<"approved" | "draft", GlossaryDraft[]> = { approved: [], draft: [] };
    for (const row of rows) {
      const match = known.get(row.term.toLowerCase());
      if (!match) { unknownTerms.push(row.term); continue; }
      if (!row.target) { emptyTargets.push(match.term); continue; }
      if (seen.has(match.term)) { duplicates.push(match.term); continue; }
      seen.add(match.term);
      const approve = match.approved || row.status.toLowerCase() === "approved";
      batches[approve ? "approved" : "draft"].push({ term: match.term, target: row.target, kind: row.kind || match.kind });
    }
    const problems = [
      unknownTerms.length > 0 ? `${unknownTerms.length === 1 ? "This term is" : "These terms are"} not in the glossary or on the site: ${listed(unknownTerms)}` : null,
      emptyTargets.length > 0 ? `No rendering for ${listed(emptyTargets)}` : null,
      duplicates.length > 0 ? `Listed more than once: ${listed(duplicates)}` : null,
    ].filter((part): part is string => part !== null);
    if (problems.length > 0) {
      return NextResponse.json({ error: `Nothing was imported. ${problems.join(". ")}.`, unknownTerms }, { status: 400 });
    }

    // Approved first: it is the batch that can be refused for a collision, and
    // a refusal must leave the locale as it was.
    const by = { source: "human" as const, reviewedBy: actorEmail };
    const approved = await upsertGlossaryRows(locale, batches.approved, { ...by, status: "approved", ...(collisionConfirmation ? { collisionConfirmation } : {}) });
    const drafts = await upsertGlossaryRows(locale, batches.draft, { ...by, status: "draft" });
    const body: ImportResponse = { ok: true, locale, approved, drafts };
    return NextResponse.json(body);
  },
});
