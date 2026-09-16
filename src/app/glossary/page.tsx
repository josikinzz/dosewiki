/**
 * The public glossary: the translation glossary's terms with their one-line
 * English definitions, read straight from Postgres. The mirror at
 * `src/app/zh/glossary` adds each term's approved rendering.
 */
import { getDataBackend } from "@server/postgres/runtime/backend";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { readGlosses } from "@server/translation/glossaryGloss";
import { buildGlossaryGroups, GLOSSARY_INTRO, GlossaryPage as GlossaryContentPage } from "@/components/pages/GlossaryPage";
import { msg } from "@/i18n/messages";
import { t } from "@/i18n/server";

export const revalidate = 3600;

export async function generateMetadata() {
  return buildPublicPageMetadata({
    title: t(msg("Glossary")),
    description: t(GLOSSARY_INTRO),
    route: { family: "glossary" },
  });
}

export default async function GlossaryPage() {
  getDataBackend();
  const glosses = await readGlosses();
  return <GlossaryContentPage groups={buildGlossaryGroups(glosses)} renderingLang={null} />;
}
