import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { isUiCatalogRefreshed, readUiTranslations, writeUiTranslation } from "@server/translation/uiTranslationStore";
import { glossaryAccessibleLocales, glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { parseWorkbenchMutation, workbenchError } from "./workbenchRoutes";
export const runtime = "nodejs";
export const GET = protectedRouteOperation({
  auth: "translator", rateLimit: "editorPolledRead", mapError: workbenchError,
  unexpectedErrorLabel: "Failed to read UI translation workbench:",
  unexpectedErrorMessage: "Unable to load UI translations right now.",
  operation: async ({ request, auth }) => {
    const locales = glossaryAccessibleLocales(auth);
    if (!locales.length) return NextResponse.json({ error: "No translation languages are assigned to your account." }, { status: 403 });
    const locale = parseLocale(new URL(request.url).searchParams.get("locale") ?? locales[0]);
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    getDataBackend();
    return NextResponse.json({ ok: true, locale, locales, rows: await readUiTranslations(locale), catalogRefreshed: isUiCatalogRefreshed(locale) });
  },
});
export const POST = protectedRouteOperation({
  auth: "translator", rateLimit: "editorSmallWrite", body: { maxBytes: 16 * 1024, parse: parseWorkbenchMutation }, mapError: workbenchError,
  unexpectedErrorLabel: "Failed to update UI translation workbench:",
  unexpectedErrorMessage: "Unable to save this UI translation right now.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    return NextResponse.json({ ok: true, row: await writeUiTranslation({ ...body, actor: actorEmail }) });
  },
});
