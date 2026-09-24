/**
 * GET  /api/dev/translation-note?locale=zh-Hans&kind=article&slug=<slug>[&history=<section>]
 * POST /api/dev/translation-note { locale, kind, slug, section, expectedRevision, action, body?, reason, restoreRevision? }
 *
 * Translator's notes under substance article sections. Translator and up, for
 * an assigned locale only; writes obey the write freeze and the revision the
 * reviewer saw, like narrative corrections.
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readTranslatorNotes, translatorNoteHistory, writeTranslatorNote, type TranslatorNoteMutation } from "@server/translation/translatorNotes";
import { isTranslatorNoteSection, TRANSLATOR_NOTE_MAX_LENGTH } from "@server/translation/translatorNoteTypes";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { isPublicLocaleCode } from "@/i18n/localeRegistry.mjs";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { workbenchError } from "../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

function location(raw: Record<string, unknown>) {
  if (raw.kind !== "article" || typeof raw.slug !== "string" || !raw.slug.trim() || raw.slug.length > 300)
    throw new JsonBodyError(400, "Translator's notes attach to public substance articles. Choose an article slug.");
  return { locale: parseLocale(raw.locale), slug: raw.slug };
}

function mutation(raw: Record<string, unknown>): Omit<TranslatorNoteMutation, "actor"> {
  const source = location(raw);
  if (!isTranslatorNoteSection(raw.section)) throw new JsonBodyError(400, "Choose an article section for the note.");
  if (!["save", "approve", "restore"].includes(String(raw.action)) || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0)
    throw new JsonBodyError(400, "Choose an action and expected revision.");
  if (typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 1000)
    throw new JsonBodyError(400, "Explain this change in up to 1000 characters.");
  if (raw.action === "save" && (typeof raw.body !== "string" || !raw.body.trim() || raw.body.length > TRANSLATOR_NOTE_MAX_LENGTH))
    throw new JsonBodyError(400, `Enter a note of up to ${TRANSLATOR_NOTE_MAX_LENGTH} characters.`);
  if (raw.action === "restore" && (!Number.isSafeInteger(raw.restoreRevision) || Number(raw.restoreRevision) < 0))
    throw new JsonBodyError(400, "Choose a revision to restore.");
  return {
    ...source,
    section: raw.section,
    action: raw.action as TranslatorNoteMutation["action"],
    expectedRevision: Number(raw.expectedRevision),
    reason: raw.reason,
    body: typeof raw.body === "string" ? raw.body : undefined,
    restoreRevision: raw.restoreRevision as number | undefined,
  };
}

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  mapError: workbenchError,
  unexpectedErrorLabel: "Translator note read failed",
  unexpectedErrorMessage: "Unable to read translator's notes.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const loc = location(Object.fromEntries(params));
    const denied = glossaryLocaleAccess(auth, loc.locale);
    if (denied) return denied;
    getDataBackend();
    const packet = await readTranslatorNotes(getPublicDataReadAdapter(), loc.locale, loc.slug);
    const section = params.get("history");
    if (section !== null && !isTranslatorNoteSection(section)) throw new JsonBodyError(400, "Choose an article section for the note.");
    const history = section ? await translatorNoteHistory(loc.locale, packet.slug, section) : undefined;
    return NextResponse.json({ ...packet, history }, { headers: { "Cache-Control": "private, no-store" } });
  },
});

export const POST = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 32 * 1024, parse: mutation },
  mapError: workbenchError,
  unexpectedErrorLabel: "Translator note mutation failed",
  unexpectedErrorMessage: "Unable to save the translator's note.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    const entry = await writeTranslatorNote(getPublicDataReadAdapter(), { ...body, actor: actorEmail });
    // Only an approval changes what readers see; the localized article carries its approved notes.
    const publication = body.action === "approve" && isPublicLocaleCode(body.locale)
      ? await publishPublicCache({ targets: [{ kind: "article-translation", slug: body.slug, locale: body.locale }], source: "manual" })
      : [];
    return NextResponse.json({ ok: true, entry, publication });
  },
});
