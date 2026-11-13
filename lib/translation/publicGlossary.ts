import "server-only";
import { publicDataCache } from "../data/publicData.cache";
import releases from "../../src/i18n/languageReleases.json";
import {
  glossaryLanguage,
  glossaryLanguages,
  projectGlossary,
  type Rendering,
} from "../../src/features/language-glossary/languageGlossary";
import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { glossaryLocales } from "./glossary";
import { getPostgresClient } from "../postgres/runtime/backend";
import {
  PUBLIC_GLOSSARY_RENDERING_SELECT,
  publicGlossaryRendering,
} from "./publicGlossaryRendering";
import { readGlosses } from "./glossaryGloss";
import { collectGlossaryTerms, type GlossaryTerm } from "./glossaryTerms";
import { languageReadiness, type LanguageRelease } from "./languageReadiness";
import { getGlossaryUsages } from "./glossaryUsage";
import { readGlossaryExamples } from "./glossaryExamples";

export async function readPublicGlossaryRenderings(
  locales: readonly string[],
): Promise<Map<string, Rendering[]>> {
  const rows = await getPostgresClient().sql<Record<string, unknown>>(
    `${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g."locale" = ANY($1::text[]) ORDER BY g."locale", g."term"`,
    [[...locales]],
  );
  const byLocale = new Map<string, Rendering[]>();
  for (const row of rows) {
    const locale = String(row.locale);
    const list = byLocale.get(locale);
    if (list) list.push(publicGlossaryRendering(row));
    else byLocale.set(locale, [publicGlossaryRendering(row)]);
  }
  return byLocale;
}

export const readRequiredGlossaryTerms = publicDataCache(
  async () => collectGlossaryTerms(getPublicDataReadAdapter()),
  ["public-glossary-required-terms"],
  { revalidate: 300 },
);

function readinessFor(
  locale: string,
  required: readonly GlossaryTerm[],
  rows: readonly Rendering[],
) {
  const release =
    (releases as LanguageRelease[]).find((row) => row.locale === locale) ??
    null;
  return languageReadiness(
    locale,
    required.map((row) => row.term),
    rows,
    release,
  );
}

const readPublicLanguageGlossaryBase = publicDataCache(
  async (locale: string) => {
    const language = glossaryLanguage(locale);
    if (!language) return null;
    const [renderings, glosses, required] = await Promise.all([
      readPublicGlossaryRenderings([locale]),
      readGlosses(),
      readRequiredGlossaryTerms(),
    ]);
    const rows = renderings.get(locale) ?? [];
    if (!rows.length) return null;
    const definitions = new Map(
      required.map((row) => [row.term, { ...row, gloss: "" }]),
    );
    for (const row of glosses) definitions.set(row.term, row);
    const projected = projectGlossary([...definitions.values()], rows);
    const examples = await readGlossaryExamples(locale, projected);
    const entries = projected.map((entry) => ({
      ...entry,
      example: examples.get(entry.term) ?? null,
    }));
    return {
      language,
      entries,
      readiness: readinessFor(locale, required, rows),
    };
  },
  ["public-language-glossary-base"],
  { revalidate: 60 },
);

export async function readPublicLanguageGlossary(locale: string) {
  const page = await readPublicLanguageGlossaryBase(locale);
  if (!page) return null;
  return {
    language: page.language,
    entries: page.entries,
    usages: await getGlossaryUsages(page.entries.map((entry) => entry.term)),
    readiness: page.readiness,
  };
}

export async function readPublicLanguageReadiness(locale: string) {
  if (!glossaryLanguage(locale)) return null;
  const [renderings, required] = await Promise.all([
    readPublicGlossaryRenderings([locale]),
    readRequiredGlossaryTerms(),
  ]);
  const rows = renderings.get(locale) ?? [];
  return rows.length ? readinessFor(locale, required, rows) : null;
}

export const readPublicLanguageDirectory = publicDataCache(
  async () => {
    const [summaries, required] = await Promise.all([
      glossaryLocales(glossaryLanguages.map((language) => language.code)),
      readRequiredGlossaryTerms(),
    ]);
    const renderings = await readPublicGlossaryRenderings(
      summaries.map((row) => row.locale),
    );
    return summaries.flatMap(({ locale }) => {
      const language = glossaryLanguage(locale);
      const rows = renderings.get(locale) ?? [];
      if (!language || !rows.length) return [];
      const readiness = readinessFor(locale, required, rows);
      return [{ ...language, href: readiness.href, readiness: readiness.state }];
    });
  },
  ["public-language-directory"],
  { revalidate: 60 },
);
