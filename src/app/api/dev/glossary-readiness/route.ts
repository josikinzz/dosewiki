import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { readPublicLanguageGlossary } from "@server/translation/publicGlossary";
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
    const page = await readPublicLanguageGlossary(locale);
    return NextResponse.json(
      {
        locale,
        readiness: page?.readiness ?? null,
        evidence:
          (releases as Array<{ locale: string }>).find(
            (release) => release.locale === locale,
          ) ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
});
