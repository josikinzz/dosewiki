import { useMemo } from "react";

import { userProfiles } from "@/data/userProfiles";
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
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  generatorPrompt: string;
  getOriginalArticles: () => SubstanceArticle[];
  getOriginalPsychoactiveIndexManual: () => unknown;
  getOriginalAboutMarkdown: () => string;
  getOriginalAboutSubtitle: () => string;
  getOriginalAboutFounderKeys: () => string[];
  getOriginalGeneratorPrompt: () => string;
};

export function useDevModeChangelogState({
  articles,
  psychoactiveIndexManual,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  generatorPrompt,
  getOriginalArticles,
  getOriginalPsychoactiveIndexManual,
  getOriginalAboutMarkdown,
  getOriginalAboutSubtitle,
  getOriginalAboutFounderKeys,
  getOriginalGeneratorPrompt,
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
  const originalGeneratorPrompt = useMemo(
    () => getOriginalGeneratorPrompt(),
    [getOriginalGeneratorPrompt],
  );

  const aboutMarkdownChangelog = useMemo(
    () => buildTextChangelog("About copy", originalAboutMarkdown, aboutMarkdown),
    [aboutMarkdown, originalAboutMarkdown],
  );
  const aboutSubtitleChangelog = useMemo(
    () => buildTextChangelog("About subtitle", originalAboutSubtitle, aboutSubtitle),
    [aboutSubtitle, originalAboutSubtitle],
  );
  const generatorPromptChangelog = useMemo(
    () => buildTextChangelog("Generator prompt", originalGeneratorPrompt, generatorPrompt),
    [generatorPrompt, originalGeneratorPrompt],
  );

  const founderLabelByKey = useMemo(() => {
    const lookup = new Map<string, string>();
    userProfiles.forEach((profile) => {
      lookup.set(profile.key, profile.displayName);
    });
    return lookup;
  }, []);

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
  const hasManualChanges = psychoactiveManualChangelog.hasChanges;
  const hasGeneratorPromptChanges = generatorPromptChangelog.hasChanges;
  const hasPendingChanges =
    hasArticleDatasetChanges ||
    hasAboutMarkdownChanges ||
    hasAboutSubtitleChanges ||
    hasAboutFounderChanges ||
    hasManualChanges ||
    hasGeneratorPromptChanges;

  const combinedChangelogMarkdown = useMemo(
    () =>
      buildCombinedChangelogMarkdown([
        { hasChanges: hasArticleDatasetChanges, markdown: datasetChangelog.markdown },
        { hasChanges: hasManualChanges, markdown: psychoactiveManualChangelog.markdown },
        { hasChanges: hasAboutMarkdownChanges, markdown: aboutMarkdownChangelog.markdown },
        { hasChanges: hasAboutSubtitleChanges, markdown: aboutSubtitleChangelog.markdown },
        { hasChanges: hasAboutFounderChanges, markdown: aboutFounderChangelog.markdown },
        { hasChanges: hasGeneratorPromptChanges, markdown: generatorPromptChangelog.markdown },
      ]),
    [
      aboutFounderChangelog,
      aboutMarkdownChangelog,
      aboutSubtitleChangelog,
      datasetChangelog.markdown,
      generatorPromptChangelog,
      hasAboutFounderChanges,
      hasAboutMarkdownChanges,
      hasAboutSubtitleChanges,
      hasArticleDatasetChanges,
      hasGeneratorPromptChanges,
      hasManualChanges,
      psychoactiveManualChangelog.markdown,
    ],
  );

  return {
    originalAboutMarkdown,
    originalAboutSubtitle,
    originalAboutFounderKeys,
    originalGeneratorPrompt,
    aboutMarkdownChangelog,
    aboutSubtitleChangelog,
    aboutFounderChangelog,
    psychoactiveManualChangelog,
    datasetChangelog,
    generatorPromptChangelog,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasAboutFounderChanges,
    hasGeneratorPromptChanges,
    hasPendingChanges,
    combinedChangelogMarkdown,
  };
}
