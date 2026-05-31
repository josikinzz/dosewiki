import { useMemo } from "react";

import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { SubstanceArticle } from "@/schema";
import {
  buildArticleChangelog,
  buildDatasetChangelog,
  buildTextChangelog,
} from "@/utils/data/changelog";
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
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  availableProfiles: NormalizedUserProfile[];
  getOriginalArticles: () => SubstanceArticle[];
  getOriginalPsychoactiveIndexManual: () => unknown;
  getOriginalChemicalIndexManual: () => unknown;
  getOriginalMechanismIndexManual: () => unknown;
  getOriginalAboutMarkdown: () => string;
  getOriginalAboutSubtitle: () => string;
  getOriginalAboutFounderKeys: () => string[];
};

export function useDevModeChangelogState({
  articles,
  psychoactiveIndexManual,
  chemicalIndexManual,
  mechanismIndexManual,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  availableProfiles,
  getOriginalArticles,
  getOriginalPsychoactiveIndexManual,
  getOriginalChemicalIndexManual,
  getOriginalMechanismIndexManual,
  getOriginalAboutMarkdown,
  getOriginalAboutSubtitle,
  getOriginalAboutFounderKeys,
}: UseDevModeChangelogStateArgs) {
  const originalArticles = useMemo(
    () => getOriginalArticles(),
    [articles.length, getOriginalArticles],
  );
  const originalAboutMarkdown = useMemo(
    () => getOriginalAboutMarkdown(),
    [aboutMarkdown, getOriginalAboutMarkdown],
  );
  const originalAboutSubtitle = useMemo(
    () => getOriginalAboutSubtitle(),
    [aboutSubtitle, getOriginalAboutSubtitle],
  );
  const originalAboutFounderKeys = useMemo(
    () => getOriginalAboutFounderKeys(),
    [aboutFounderKeys, getOriginalAboutFounderKeys],
  );

  const aboutMarkdownChangelog = useMemo(
    () => buildTextChangelog("About copy", originalAboutMarkdown, aboutMarkdown),
    [aboutMarkdown, originalAboutMarkdown],
  );
  const aboutSubtitleChangelog = useMemo(
    () => buildTextChangelog("About subtitle", originalAboutSubtitle, aboutSubtitle),
    [aboutSubtitle, originalAboutSubtitle],
  );

  const founderLabelByKey = useMemo(() => {
    const lookup = new Map<string, string>();
    availableProfiles.forEach((profile) => {
      lookup.set(profile.key, profile.displayName);
    });
    return lookup;
  }, [availableProfiles]);

  const aboutFounderChangelog = useMemo(() => {
    const originalSet = new Set(originalAboutFounderKeys);
    const currentSet = new Set(aboutFounderKeys);
    const additions: string[] = [];
    const removals: string[] = [];

    aboutFounderKeys.forEach((key) => {
      if (!originalSet.has(key)) {
        additions.push(key);
      }
    });

    originalAboutFounderKeys.forEach((key) => {
      if (!currentSet.has(key)) {
        removals.push(key);
      }
    });

    if (additions.length === 0 && removals.length === 0) {
      return {
        markdown: "# About founders\n\nNo differences detected.\n",
        hasChanges: false,
      };
    }

    const lines: string[] = [];

    additions.forEach((key) => {
      const label = founderLabelByKey.get(key) ?? key;
      lines.push(`+ ${label} (@${key.toLowerCase()})`);
    });

    removals.forEach((key) => {
      const label = founderLabelByKey.get(key) ?? key;
      lines.push(`- ${label} (@${key.toLowerCase()})`);
    });

    return {
      markdown: `# About founders\n\n${lines.join("\n")}`,
      hasChanges: true,
    };
  }, [aboutFounderKeys, founderLabelByKey, originalAboutFounderKeys]);

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

  const hasAboutMarkdownChanges = aboutMarkdownChangelog.hasChanges;
  const hasAboutSubtitleChanges = aboutSubtitleChangelog.hasChanges;
  const hasAboutFounderChanges = aboutFounderChangelog.hasChanges;
  const hasArticleDatasetChanges =
    datasetChangelog.sections.length > 0 && datasetChangelog.markdown.trim().length > 0;
  const hasManualChanges =
    psychoactiveManualChangelog.hasChanges ||
    chemicalManualChangelog.hasChanges ||
    mechanismManualChangelog.hasChanges;
  const hasPendingChanges =
    hasArticleDatasetChanges ||
    hasAboutMarkdownChanges ||
    hasAboutSubtitleChanges ||
    hasAboutFounderChanges ||
    hasManualChanges;

  const combinedChangelogMarkdown = useMemo(
    () =>
      buildCombinedChangelogMarkdown([
        { hasChanges: hasArticleDatasetChanges, markdown: datasetChangelog.markdown },
        psychoactiveManualChangelog,
        chemicalManualChangelog,
        mechanismManualChangelog,
        { hasChanges: hasAboutMarkdownChanges, markdown: aboutMarkdownChangelog.markdown },
        { hasChanges: hasAboutSubtitleChanges, markdown: aboutSubtitleChangelog.markdown },
        { hasChanges: hasAboutFounderChanges, markdown: aboutFounderChangelog.markdown },
      ]),
    [
      aboutFounderChangelog,
      aboutMarkdownChangelog,
      aboutSubtitleChangelog,
      chemicalManualChangelog,
      datasetChangelog.markdown,
      hasAboutFounderChanges,
      hasAboutMarkdownChanges,
      hasAboutSubtitleChanges,
      hasArticleDatasetChanges,
      mechanismManualChangelog,
      psychoactiveManualChangelog,
    ],
  );

  return {
    originalAboutMarkdown,
    originalAboutSubtitle,
    originalAboutFounderKeys,
    aboutMarkdownChangelog,
    aboutSubtitleChangelog,
    aboutFounderChangelog,
    psychoactiveManualChangelog,
    chemicalManualChangelog,
    mechanismManualChangelog,
    datasetChangelog,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasAboutFounderChanges,
    hasPendingChanges,
    combinedChangelogMarkdown,
  };
}
