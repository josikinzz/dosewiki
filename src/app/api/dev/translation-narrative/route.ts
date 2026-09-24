import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readNarrativeReview, writeNarrativeReview, narrativeHistory, type NarrativeMutation } from "@server/translation/narrativeReview";
import { type TranslationRecordKind } from "@server/translation/liveTranslation";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { isPublicLocaleCode } from "@/i18n/localeRegistry.mjs";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { parseReasonFields, workbenchError } from "../translation-workbench/workbenchRoutes";
export const runtime = "nodejs";
export const maxDuration = 300;
function location(raw: Record<string, unknown>) {
    const kind = raw.kind as TranslationRecordKind;
    if (kind !== "article" || typeof raw.slug !== "string" || !raw.slug.trim() || raw.slug.length > 300)
        throw new JsonBodyError(400, "This first review surface supports public substance articles. Choose an article slug.");
    return { locale: parseLocale(raw.locale), kind, slug: raw.slug };
}
function mutation(raw: Record<string, unknown>): Omit<NarrativeMutation, "actor"> {
    const source = location(raw);
    if (typeof raw.id !== "string" || !/^\w{64}$/.test(raw.id) || typeof raw.sourceVersion !== "string" || !/^\w{64}$/.test(raw.sourceVersion))
        throw new JsonBodyError(400, "Reload the source segment before reviewing.");
    if (!["save", "approve", "restore"].includes(String(raw.action)) || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0)
        throw new JsonBodyError(400, "Choose an action and expected revision.");
    const { reason, glossaryExceptions } = parseReasonFields(raw);
    if (raw.action === "save" && (typeof raw.target !== "string" || !raw.target.trim() || raw.target.length > 30000))
        throw new JsonBodyError(400, "Enter a translation of up to 30000 characters.");
    if (raw.action === "restore" && (!Number.isSafeInteger(raw.restoreRevision) || Number(raw.restoreRevision) < 0))
        throw new JsonBodyError(400, "Choose a revision to restore.");
    return { ...source, id: raw.id, sourceVersion: raw.sourceVersion, action: raw.action as NarrativeMutation["action"], expectedRevision: Number(raw.expectedRevision), reason, glossaryExceptions, target: typeof raw.target === "string" ? raw.target : undefined, restoreRevision: raw.restoreRevision as number | undefined };
}
export const GET = protectedRouteOperation({ auth: "translator", rateLimit: "editorPolledRead", mapError: workbenchError, unexpectedErrorLabel: "Narrative review read failed", unexpectedErrorMessage: "Unable to read narrative review.", operation: async ({ request, auth }) => {
        const params = new URL(request.url).searchParams;
        const loc = location(Object.fromEntries(params));
        const denied = glossaryLocaleAccess(auth, loc.locale);
        if (denied)
            return denied;
        getDataBackend();
        const packet = await readNarrativeReview(getPublicDataReadAdapter(), loc.locale, loc.kind, loc.slug);
        const id = params.get("history");
        if (id && !packet.rows.some(r => r.id === id))
            throw new JsonBodyError(400, "Choose a segment in this record.");
        return NextResponse.json({ ...packet, history: id ? await narrativeHistory(loc.locale, id) : undefined });
    } });
export const POST = protectedRouteOperation({ auth: "translator", rateLimit: "editorSmallWrite", body: { maxBytes: 160 * 1024, parse: mutation }, mapError: workbenchError, unexpectedErrorLabel: "Narrative review mutation failed", unexpectedErrorMessage: "Unable to save narrative review.", operation: async ({ body, auth, actorEmail }) => {
        const denied = glossaryLocaleAccess(auth, body.locale);
        if (denied)
            return denied;
        getDataBackend();
        const entry = await writeNarrativeReview(getPublicDataReadAdapter(), { ...body, actor: actorEmail });
        const targets = body.kind === "article" ? isPublicLocaleCode(body.locale) ? [{ kind: "article-translation" as const, slug: body.slug, locale: body.locale }] : [] : body.kind === "profile" ? [{ kind: "contributor" as const, slug: body.slug }, { kind: "about" as const }] : [{ kind: body.kind, slug: body.slug }];
        const publication = body.action === "approve" && targets.length ? await publishPublicCache({ targets, source: "manual" }) : [];
        return NextResponse.json({ ok: true, entry, publication });
    } });
