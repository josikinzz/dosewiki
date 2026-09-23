import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readUiTranslationHistory } from "@server/translation/uiTranslationStore";
import { glossaryLocaleAccess, parseLocale } from "../../translation-glossary/glossaryRoutes";
import { parseMessageId, workbenchError } from "../workbenchRoutes";
export const runtime = "nodejs";
export const GET = protectedRouteOperation({
  auth: "translator", rateLimit: "editorPolledRead", mapError: workbenchError,
  unexpectedErrorLabel: "Failed to read UI translation history:",
  unexpectedErrorMessage: "Unable to load translation history right now.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const id = parseMessageId(params.get("id"));
    getDataBackend();
    return NextResponse.json({ ok: true, history: await readUiTranslationHistory(locale, id) });
  },
});
