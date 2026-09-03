import { useMemo } from "react";

import type { SubstanceArticle } from "@/schema";
import { buildArticleChangelog, buildDatasetChangelog } from "@/utils/data/changelog";
import {
  buildCombinedChangelogMarkdown,
  extractChangeLogSummary,
  formatArticleLabel,
} from "./devModePageUtils";

type UseDevModeChangelogStateArgs = {
  articles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
  chemicalIndexManual: unknown;
  mechanismIndexManual: unknown;
  getOriginalArticles: () => SubstanceArticle[];
  getOriginalPsychoactiveIndexManual: () => unknown;
  getOriginalChemicalIndexManual: () => unknown;
  getOriginalMechanismIndexManual: () => unknown;
};

export function useDevModeChangelogState({
  articles,
  psychoactiveIndexManual,
  chemicalIndexManual,
  mechanismIndexManual,
  getOriginalArticles,
  getOriginalPsychoactiveIndexManual,
  getOriginalChemicalIndexManual,
  getOriginalMechanismIndexManual,
}: UseDevModeChangelogStateArgs) {
  const originalArticles = useMemo(
    () => getOriginalArticles(),
    [articles.length, getOriginalArticles],
  );

  const psychoactiveManualChangelog = useMemo(
    () =>
      buildArticleChangelog(
        "Psychoactive Index Layout",
        getOriginalPsychoactiveIndexManual(),
        psychoactiveIndexManual,
      ),
    [getOriginalPsychoactiveIndexManual, psychoactiveIndexManual],
  );
  const chemicalManualChangelog = useMemo(
    () =>
      buildArticleChangelog(
        "Chemical Index Layout",
        getOriginalChemicalIndexManual(),
        chemicalIndexManual,
      ),
    [chemicalIndexManual, getOriginalChemicalIndexManual],
  );
  const mechanismManualChangelog = useMemo(
    () =>
      buildArticleChangelog(
        "Mechanism Index Layout",
        getOriginalMechanismIndexManual(),
        mechanismIndexManual,
      ),
    [getOriginalMechanismIndexManual, mechanismIndexManual],
  );

  const datasetChangelog = useMemo(
    () =>
      buildDatasetChangelog({
        articles,
        originalArticles,
        getArticleKey: (article, index) => {
          const summary = extractChangeLogSummary(article, index);
          return summary?.id ?? null;
        },
        formatHeading: (article, index) => formatArticleLabel(article, index),
        summarizeArticle: (article, index) => extractChangeLogSummary(article, index),
      }),
    [articles, originalArticles],
  );

  const hasArticleDatasetChanges =
    datasetChangelog.sections.length > 0 && datasetChangelog.markdown.trim().length > 0;
  const hasManualChanges =
    psychoactiveManualChangelog.hasChanges ||
    chemicalManualChangelog.hasChanges ||
    mechanismManualChangelog.hasChanges;
  const hasPendingChanges = hasArticleDatasetChanges || hasManualChanges;

  const combinedChangelogMarkdown = useMemo(
    () =>
      buildCombinedChangelogMarkdown([
        { hasChanges: hasArticleDatasetChanges, markdown: datasetChangelog.markdown },
        psychoactiveManualChangelog,
        chemicalManualChangelog,
        mechanismManualChangelog,
      ]),
    [
      chemicalManualChangelog,
      datasetChangelog.markdown,
      hasArticleDatasetChanges,
      mechanismManualChangelog,
      psychoactiveManualChangelog,
    ],
  );

  return {
    psychoactiveManualChangelog,
    chemicalManualChangelog,
    mechanismManualChangelog,
    datasetChangelog,
    hasPendingChanges,
    combinedChangelogMarkdown,
  };
}
