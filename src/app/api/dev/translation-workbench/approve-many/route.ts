import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { approveManyUiTranslations } from "@server/translation/uiTranslationStore";
import { glossaryLocaleAccess } from "../../translation-glossary/glossaryRoutes";
import { parseBatchApproval, workbenchError } from "../workbenchRoutes";
export const runtime = "nodejs";
export const POST = protectedRouteOperation({
  auth: "translator", rateLimit: "editorSmallWrite", body: { maxBytes: 128 * 1024, parse: parseBatchApproval }, mapError: workbenchError,
  unexpectedErrorLabel: "Failed to batch approve UI translations:",
  unexpectedErrorMessage: "Unable to approve these UI labels right now.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    return NextResponse.json({ ok: true, results: await approveManyUiTranslations({ ...body, actor: actorEmail }) });
  },
});
