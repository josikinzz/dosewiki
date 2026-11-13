import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { readPublicLanguageReadiness } from "@server/translation/publicGlossary";
import releases from "@/i18n/languageReleases.json";
import {
  glossaryAccessibleLocales,
  glossaryLocaleAccess,
  parseLocale,
} from "../translation-glossary/glossaryRoutes";
export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Glossary readiness read failed:",
  operation: async ({ request, auth }) => {
    const locale = parseLocale(
      new URL(request.url).searchParams.get("locale") ??
        glossaryAccessibleLocales(auth)[0],
    );
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const readiness = await readPublicLanguageReadiness(locale);
    return NextResponse.json(
      {
        locale,
        readiness,
        evidence:
          (releases as Array<{ locale: string }>).find(
            (release) => release.locale === locale,
          ) ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
});
