import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import seeds from "./glossaryMessageSeeds.json";
import names from "./translationLocaleNames.json";
import { uiCatalogFor } from "./serverMessages";
import { GLOSSARY_CATEGORIES, OTHER_CATEGORY } from "@/lib/glossary/glossaryCategories";
import { PUBLIC_GLOSSARY_PROVENANCES } from "@/features/language-glossary/languageGlossary";

const referenceOnly = new Set([
  "The fixed vocabulary of this site: what each term means here and, on a translated mirror, how it is rendered.",
  "Help translate dose.wiki",
  "This page is the English reference. Open a language glossary and tap the suggest button on any term to propose a translation. A person reviews every suggestion before anything changes.",
]);
const controls = new Set([
  ...[
    "src/features/language-glossary/LanguageGlossaryPage.tsx",
    "src/features/language-glossary/GlossaryFeedback.tsx",
    "src/components/glossary/GlossaryUsageDisclosure.tsx",
  ].flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)].map((match) => match[1])).filter((key) => !referenceOnly.has(key)),
  ...[...GLOSSARY_CATEGORIES, OTHER_CATEGORY].map((category) => category.label),
  ...PUBLIC_GLOSSARY_PROVENANCES.map((status) => `languageGlossary.status.${status}`),
]);
const tokens = (text: string) => [...text.matchAll(/\{\{\s*\w+\s*\}\}/g)].map((match) => match[0]).sort();
it("covers every participating glossary language", () => {
  expect(Object.keys(seeds).sort()).toEqual(Object.keys(names).sort());
});
it.each(Object.keys(seeds))("publishes every %s glossary control with preserved placeholders", (locale) => {
  const catalog = uiCatalogFor(locale)!;
  for (const key of controls) {
    expect(catalog[key], `${locale}: ${key}`).toBeTruthy();
    expect(catalog[key], `${locale}: ${key}`).not.toBe(key);
    expect(tokens(catalog[key]), `${locale}: ${key}`).toEqual(tokens(key));
  }
});
