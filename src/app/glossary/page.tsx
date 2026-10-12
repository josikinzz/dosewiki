import { permanentRedirect } from "next/navigation";
import { glossaryHref } from "@/features/language-glossary/glossaryRoutes";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { GlossaryRoute } from "@/features/language-glossary/GlossaryRoute";
import { msg } from "@/i18n/messages";
import { t } from "@/i18n/server";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const locale = (await searchParams).locale ?? "en";
  return buildPublicPageMetadata({
    title: t(msg("Glossary")),
    description: t(
      msg(
        "The fixed vocabulary of this site: what each term means here and, on a translated mirror, how it is rendered.",
      ),
    ),
    route: { family: "glossary" },
    noIndex: locale !== "en",
  });
}

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const locale = (await searchParams).locale ?? "en";
  const destination = glossaryHref(locale);
  if (destination.startsWith("https://")) permanentRedirect(destination);
  return GlossaryRoute({ locale });
}
