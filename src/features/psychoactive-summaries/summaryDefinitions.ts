import summariesSource from "@content/taxonomy/psychoactive-summaries.json";
import type { IconName } from "@/components/common/Icon";

export type PsychoactiveSummaryRouteKey =
  | "psychedelic-visual"
  | "psychedelic-cognitive"
  | "psychedelic-miscellaneous"
  | "dissociative"
  | "deliriant";

export type PsychoactiveSummarySelection =
  | {
      type: "tags";
      tags: readonly string[];
      excludeTags?: readonly string[];
    }
  | {
      type: "names";
      names: readonly string[];
    };

export interface PsychoactiveSummarySectionDefinition {
  title: string;
  icon?: IconName;
  definitionHtml: string;
  selection: PsychoactiveSummarySelection;
}

interface PsychoactiveSummaryIntroParagraph {
  html: string;
  italic?: boolean;
}

interface PsychoactiveSummaryImage {
  src: string;
  title: string;
  artist: string;
  width: string;
  align: "left" | "right" | "center";
}

interface PsychoactiveSummarySeeAlso {
  href: string;
  label: string;
}

export interface PsychoactiveSummaryDefinition {
  key: PsychoactiveSummaryRouteKey;
  path: string;
  summaryPath: readonly string[];
  title: string;
  metadataTitle: string;
  metadataDescription: string;
  icon: IconName;
  intro: readonly PsychoactiveSummaryIntroParagraph[];
  image?: PsychoactiveSummaryImage;
  sections: readonly PsychoactiveSummarySectionDefinition[];
  seeAlso: readonly PsychoactiveSummarySeeAlso[];
}

/**
 * The five summary pages, sourced from `content/taxonomy/psychoactive-summaries.json`.
 *
 * Reader-visible prose in that file (`title`, `metadataTitle`,
 * `metadataDescription`, `intro[].html`, `sections[].title`,
 * `sections[].definitionHtml`, `seeAlso[].label`) is a UI message key:
 * `PsychoactiveSummaryPage` renders it through `t()`, so the mirror sees it in
 * its own language while the English stays the only source. The HTML inside a
 * key is part of the key. `scripts/translation/ui-catalog.ts` walks the same
 * fields to keep the catalog in step.
 */
export const PSYCHOACTIVE_SUMMARY_DEFINITIONS: readonly PsychoactiveSummaryDefinition[] =
  summariesSource as PsychoactiveSummaryDefinition[];

export function getPsychoactiveSummaryDefinition(
  summaryPath: readonly string[],
): PsychoactiveSummaryDefinition | null {
  const normalizedPath = summaryPath.join("/");

  return (
    PSYCHOACTIVE_SUMMARY_DEFINITIONS.find(
      (definition) => definition.summaryPath.join("/") === normalizedPath,
    ) ?? null
  );
}
