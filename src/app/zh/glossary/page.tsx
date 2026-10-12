import { buildPublicPageMetadata } from "@server/next/publicSite";
import { GlossaryRoute } from "@/features/language-glossary/GlossaryRoute";
import { msg } from "@/i18n/messages";
import { setRequestLocale, t } from "@/i18n/server";

export const revalidate = 60;

export function generateMetadata() {
  setRequestLocale("zh-Hans");
  return buildPublicPageMetadata({
    title: t(msg("Glossary")),
    description: t(
      msg(
        "Help translate dose.wiki. Click any term to suggest a translation. A person reviews every suggestion before anything changes.",
      ),
    ),
    route: { family: "glossary" },
    noIndex: true,
  });
}

export default async function LocalizedGlossaryPage() {
  setRequestLocale("zh-Hans");
  return GlossaryRoute({ locale: "zh-Hans" });
}
