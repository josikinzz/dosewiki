import "server-only";
import { publicDataCache } from "../data/publicData.cache";
import releases from "../../src/i18n/languageReleases.json";
import {
  glossaryLanguage,
  glossaryLanguages,
  projectGlossary,
} from "../../src/features/language-glossary/languageGlossary";
import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { glossaryLocales } from "./glossary";
import { getPostgresClient } from "../postgres/runtime/backend";
import {
  PUBLIC_GLOSSARY_RENDERING_SELECT,
  publicGlossaryRendering,
} from "./publicGlossaryRendering";
import { readGlosses } from "./glossaryGloss";
import { collectGlossaryTerms } from "./glossaryTerms";
import { languageReadiness, type LanguageRelease } from "./languageReadiness";
import { getGlossaryUsages } from "./glossaryUsage";
import { readGlossaryExamples } from "./glossaryExamples";

/** Pages and feedback use identical draft projection and revision identities. */
export async function readPublicGlossaryRenderings(locale: string) {
  const rows = await getPostgresClient().sql<Record<string, unknown>>(
    `${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g."locale" = $1 ORDER BY g."term"`,
    [locale],
  );
  return rows.map(publicGlossaryRendering);
}

export const readRequiredGlossaryTerms = publicDataCache(
  async () => collectGlossaryTerms(getPublicDataReadAdapter()),
  ["public-glossary-required-terms"],
  { revalidate: 300 },
);
export const readPublicLanguageGlossary = publicDataCache(
  async (locale: string) => {
    const language = glossaryLanguage(locale);
    if (!language) return null;
    const [rows, glosses, required] = await Promise.all([
      readPublicGlossaryRenderings(locale),
      readGlosses(),
      readRequiredGlossaryTerms(),
    ]);
    if (!rows.length) return null;
    const definitions = new Map(
      required.map((row) => [row.term, { ...row, gloss: "" }]),
    );
    for (const row of glosses) definitions.set(row.term, row);
    const release =
      (releases as LanguageRelease[]).find((row) => row.locale === locale) ??
      null;
    const projected = projectGlossary([...definitions.values()], rows);
    const [usages, examples] = await Promise.all([
      getGlossaryUsages(projected.map((entry) => entry.term)),
      readGlossaryExamples(locale, projected),
    ]);
    const entries = projected.map((entry) => ({
      ...entry,
      example: examples.get(entry.term) ?? null,
    }));
    return {
      language,
      entries,
      usages,
      readiness: languageReadiness(
        locale,
        required.map((row) => row.term),
        rows,
        release,
      ),
    };
  },
  ["public-language-glossary"],
  { revalidate: 60 },
);

export const readPublicLanguageDirectory = publicDataCache(
  async () => {
    const summaries = await glossaryLocales(
      glossaryLanguages.map((language) => language.code),
    );
    const pages = await Promise.all(
      summaries.map((row) => readPublicLanguageGlossary(row.locale)),
    );
    return pages.flatMap((page) =>
      page
        ? [
            {
              ...page.language,
              href: page.readiness.href,
              readiness: page.readiness.state,
            },
          ]
        : [],
    );
  },
  ["public-language-directory"],
  { revalidate: 60 },
);
