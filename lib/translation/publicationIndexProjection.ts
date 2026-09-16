import { createHash } from "node:crypto";
import { CORPORA } from "../../scripts/translation/corpora.mjs";
import { assembleLocaleDataset, extractSegments } from "../../scripts/translation/segment-manifest.mjs";
import { articleReadMinutes, deriveDescription } from "../../src/features/articles/domain/articlesIndex";
import type { PublicEffectIndexArticle } from "../data/publicData.shared";
import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize";

export const LIBRARY_TRANSLATION_CORPUS = { ...CORPORA.articles, excludedKeys: [...CORPORA.articles.excludedKeys, "authors"] };

/** Uses the detail overlay, including rejection of structurally changed VCode. */
export function projectLocalizedPublicationIndex(article: PublicEffectIndexArticle, locale: string, translations: Map<string, string>) {
  const segments = extractSegments({ items: [article] }, LIBRARY_TRANSLATION_CORPUS).segments;
  const dependencyHashes = [...new Set<string>(segments.map((segment) => segment.hash))].sort();
  const assembled = assembleLocaleDataset({ items: [article] }, segments, translations, {
    locale, corpus: LIBRARY_TRANSLATION_CORPUS, parse: parseRawVCodeContent,
  }).dataset.items[0] as PublicEffectIndexArticle;
  const overlayRevision = createHash("sha256").update(JSON.stringify(
    dependencyHashes.map((hash) => [hash, translations.get(hash) ?? null]),
  )).digest("hex");
  return {
    title: assembled.title,
    shortDescription: assembled.shortDescription,
    indexDescription: deriveDescription(assembled.body_raw),
    readMinutes: articleReadMinutes(assembled.body_raw),
    dependencyHashes,
    overlayRevision,
  };
}
