"use client";

import { memo, useMemo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import type { SubstanceArticle } from "@/schema";
import { useReagentData } from "@/hooks/useReagentData";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { ArticleSection } from "@/components/common/ArticleSection";
import { ArticleText } from "../CitedText";
import {
  reagentDataToDisplayEntries,
  staticReagentRecordsToDisplayEntries,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";
import { slugify } from "@/utils/slug";
import {
  REAGENT_RESULT_NEUTRAL_COLOR,
  buildReagentResultGradient,
  buildReagentResultLabelGradient,
  parseReagentResultColors,
} from "@/lib/reagentPalette";

interface ReagentSectionProps {
  article: SubstanceArticle;
  chemistryPresentation?: ArticleChemistryPresentation;
  substanceSlug?: string;
  externalReagentData?: NormalizedReagentData | null;
}

/**
 * Capitalize first letter of reagent name
 */
function capitalizeReagent(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Get short code for reagent name
 */
function getReagentShortCode(name: string): string {
  const shortCodes: Record<string, string> = {
    marquis: "MQ",
    mecke: "ME",
    mandelin: "MD",
    simon: "SM",
    robadope: "RB",
    froehde: "FR",
    liebermann: "LB",
    ehrlich: "EH",
    hofmann: "HM",
    folin: "FO",
    gallic: "GA",
    scott: "SC",
  };
  return shortCodes[name.toLowerCase()] ?? name.slice(0, 2).toUpperCase();
}

/**
 * Single reagent result row - gradient bar design matching ReagentTestingSection
 */
function ReagentRow({
  reagent,
  description,
}: {
  reagent: string;
  description: string;
}) {
  const colors = parseReagentResultColors(description);
  const gradient = buildReagentResultGradient(colors);
  const darkenedGradient = buildReagentResultLabelGradient(colors);
  const shortCode = getReagentShortCode(reagent);
  const isNoReaction =
    description.toLowerCase().includes("no reaction") ||
    description.toLowerCase().includes("no change") ||
    colors[0] === REAGENT_RESULT_NEUTRAL_COLOR;

  return (
    <article
      className="theme-reagent-swatch relative flex h-12 items-center overflow-hidden rounded-xl transition hover:ring-1 hover:ring-dose-accent-muted"
    >
      {/* Left label section - darkened gradient */}
      <div
        className="reagent-label-panel relative z-10 flex h-full flex-shrink-0 flex-col justify-center px-4"
        style={{
          background: darkenedGradient,
        }}
      >
        {/* Glassmorphic overlay for left section */}
        <div className="theme-reagent-swatch-label-layer pointer-events-none absolute inset-0" />
        <span className="reagent-label-title relative text-sm font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
          {capitalizeReagent(reagent)}
          <span className="reagent-label-code ml-1.5 font-normal">
            ({shortCode})
          </span>
        </span>
        <span
          className={`reagent-label-description relative text-xs drop-shadow-[0_2px_4px_rgba(0,0,0,1)] ${
            isNoReaction
              ? "reagent-label-description-muted"
              : "reagent-label-description-strong"
          }`}
        >
          {description}
        </span>
      </div>

      {/* Right spectrum section - bright gradient */}
      <div className="relative h-full flex-1" style={{ background: gradient }}>
        {/* Glassmorphic overlay for depth on spectrum */}
        <div className="theme-reagent-swatch-spectrum-layer pointer-events-none absolute inset-0" />
      </div>
    </article>
  );
}

const COLLAPSED_LIMIT = 4;

export const ReagentSection = memo(function ReagentSection({
  article,
  chemistryPresentation: providedChemistryPresentation,
  substanceSlug,
  externalReagentData,
}: ReagentSectionProps) {
  const chemistryPresentation =
    providedChemistryPresentation ?? buildArticleChemistryPresentation(article);
  const { reagentTesting } = chemistryPresentation;
  const hasServerResolvedData = externalReagentData !== undefined;
  const lookupSlug = substanceSlug ?? slugify(article.title);
  const shouldReadClientCache = reagentTesting.shouldFetchApiData && !hasServerResolvedData;
  const { data: clientData, isLoading: isLoadingClientData } = useReagentData(
    shouldReadClientCache ? lookupSlug : "",
  );
  const cachedData = hasServerResolvedData ? externalReagentData : clientData;
  const isLoading = hasServerResolvedData ? false : isLoadingClientData;

  const entries = useMemo(
    () =>
      reagentTesting.hasStaticData
        ? staticReagentRecordsToDisplayEntries(reagentTesting.staticEntries)
        : reagentDataToDisplayEntries(cachedData),
    [cachedData, reagentTesting.hasStaticData, reagentTesting.staticEntries],
  );

  if (!reagentTesting.hasStaticData && isLoading) {
    return (
      <ArticleSection
        id="reagent-testing"
        icon="lucide:pipette"
        heading="Reagent Testing"
      >
        <ArticleSection.State
          kind="loading"
          title="Loading reagent data"
          description="Expected colorimetric results are being prepared."
        />
      </ArticleSection>
    );
  }

  // Do not render when neither authored nor imported snapshot data exists.
  if (entries.length === 0) {
    return null;
  }

  const visibleEntries = entries.slice(0, COLLAPSED_LIMIT);

  return (
    <ArticleSection
      id="reagent-testing"
      icon="lucide:pipette"
      heading="Reagent Testing"
    >
      <ArticleText cited={false} tone="muted">
        Expected colorimetric results for common reagent tests. Colors show
        reaction change over 1–2 minutes.
      </ArticleText>

      <ExpandableList
        ariaLabelBase="reagent results"
        collapsedCount={Math.max(entries.length - COLLAPSED_LIMIT, 0)}
        id="reagent-results-list"
        items={entries}
        visibleItems={visibleEntries}
        className="theme-reagent-results-panel rounded-xl p-3"
        toggleClassName="mt-3"
      >
        {({ items }) => (
          <div className="space-y-3">
            {items.map((entry) => (
              <ReagentRow
                key={entry.key}
                reagent={entry.reagent}
                description={entry.description}
              />
            ))}
          </div>
        )}
      </ExpandableList>

      <ArticleSection.SourceFooter
        source={{
          href: "https://protestkit.eu",
          label: "PROtestkit.eu",
          faviconSrc: "/favicons/protestkit.png",
        }}
      />
    </ArticleSection>
  );
});
