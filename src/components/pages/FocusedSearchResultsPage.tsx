"use client";

import { useEffect, useRef, useState } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon, type IconName } from "@/components/common/Icon";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SearchingIndicator } from "@/components/common/SearchingIndicator";
import { Surface } from "@/components/ui/surface";
import type { SearchEntryType, SearchSuggestion } from "@/data/builders/search";
import { useT } from "@/i18n/client";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { publicHref } from "@/utils/publicHref";
import { icons } from "@/utils/iconNames";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

interface FocusedSearchResultsPageProps {
  query: string;
  results: SearchSuggestion[];
  isLoading?: boolean;
}

const getMatchHref = (match: SearchSuggestion) => {
  switch (match.type) {
    case "substance":
      return publicHref.substance(match.slug);
    case "category":
      return publicHref.category(match.slug);
    case "effect":
      return publicHref.effect(match.slug);
    case "report":
      return publicHref.report(match.slug);
    case "profile":
      return publicHref.contributor(match.slug);
    default:
      return publicHref.search();
  }
};

const getSuggestionIcon = (match: SearchSuggestion): IconName => {
  switch (match.type) {
    case "substance":
      return SUBSTANCE_INDEX_ICON;
    case "category":
      return match.icon ?? "lucide:layers";
    case "effect":
      return icons.subjectiveEffectIndex;
    case "report":
      return match.icon ?? icons.fileSignature;
    case "profile":
      return "lucide:user";
    default:
      return "lucide:search";
  }
};

const getAliasPreview = (match: SearchSuggestion) =>
  match.type === "report"
    ? match.secondary ?? ""
    : match.type === "substance" && match.aliases && match.aliases.length > 0
      ? match.aliases.slice(0, 4).join(" · ")
      : "";

const getDescriptionText = (match: SearchSuggestion) =>
  match.type === "report" ? match.description : match.description ?? match.secondary;

const SEARCH_RESULT_GROUPS: Array<{
  type: SearchEntryType;
}> = [
  { type: "substance" },
  { type: "report" },
  { type: "effect" },
  { type: "profile" },
  { type: "category" },
];

const groupSearchResults = (results: SearchSuggestion[]) => {
  const resultsByType = new Map<SearchEntryType, SearchSuggestion[]>(
    SEARCH_RESULT_GROUPS.map(({ type }) => [type, []]),
  );
  for (const result of results) {
    resultsByType.get(result.type)?.push(result);
  }
  return SEARCH_RESULT_GROUPS.flatMap((group) => {
    const groupedResults = resultsByType.get(group.type) ?? [];
    return groupedResults.length > 0 ? [{ ...group, results: groupedResults }] : [];
  });
};

export function FocusedSearchResultsPage({
  query,
  results,
  isLoading = false,
}: FocusedSearchResultsPageProps) {
  const t = useT();
  const trimmed = query.trim();
  const [visibleResults, setVisibleResults] = useState(results);
  const resultRegionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Keep useful matches through an empty pending response. Updating during
  // render avoids painting an empty frame between the old and new result sets.
  if (results !== visibleResults && (!isLoading || results.length > 0)) {
    setVisibleResults(results);
  }

  const displayedResults = isLoading && results.length === 0 ? visibleResults : results;
  const resultGroups = groupSearchResults(displayedResults);
  const highlightQuery = isLoading ? "" : trimmed;
  const bestMatchId = isLoading ? null : displayedResults[0]?.id ?? null;

  useEffect(() => {
    const region = resultRegionRef.current;
    if (
      isLoading ||
      prefersReducedMotion ||
      !region?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // Animate the settled handoff, not the input or a keyed result subtree:
    // existing focused links remain mounted throughout a refinement.
    const animation = region.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 160, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [isLoading, prefersReducedMotion, results, trimmed]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell theme-search-page-shell min-h-screen px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
    >
      <section className="mx-auto flex w-full max-w-[62rem] flex-col gap-4">
        <div role="status" aria-live="polite" aria-atomic="true" className="theme-search-suggestion-secondary min-h-10 text-sm leading-5">
          {isLoading
            ? displayedResults.length > 0
              ? t("Updating results for “{{query}}”. Previous or partial matches remain visible.", { query: trimmed })
              : t("Searching for “{{query}}”", { query: trimmed })
            : displayedResults.length === 0
              ? t("No matches for “{{query}}”", { query: trimmed })
              : t("Results for “{{query}}”", { query: trimmed })}
        </div>
        <div ref={resultRegionRef} aria-busy={isLoading} className="flex flex-col gap-4">
        {isLoading && displayedResults.length === 0 ? (
          <Surface
            variant="public"
            padding="none"
            radius="xl"
            className="p-2 pr-3 shadow-[var(--theme-elevation-xl)] ring-1 backdrop-blur-xl"
          >
            <SearchingIndicator className="theme-feedback-enter px-6 py-10" />
          </Surface>
        ) : displayedResults.length === 0 ? (
          <Surface
            variant="public"
            padding="none"
            radius="xl"
            className="p-2 pr-3 shadow-[var(--theme-elevation-xl)] ring-1 backdrop-blur-xl"
          >
            <SearchEmptyState
              icon="lucide:search-x"
              title={t("No matches found")}
              description={t(
                "Try another spelling, search for a broader class, or jump into the public indexes instead.",
              )}
              headingLevel="h1"
              className="px-6 py-10"
            />
          </Surface>
        ) : (
          resultGroups.map((group) => (
            <Surface
              key={group.type}
              variant="public"
              padding="none"
              radius="xl"
              className="p-2 pr-3 shadow-[var(--theme-elevation-xl)] ring-1 backdrop-blur-xl"
            >
              <ul>
                {group.results.map((match, index) => {
                  const aliasPreview = getAliasPreview(match);
                  const descriptionText = getDescriptionText(match);
                  const isBestMatch = match.id === bestMatchId && Boolean(trimmed);
                  return (
                    <li key={match.id}>
                      {index > 0 ? (
                        <div className="theme-search-result-divider mx-4 my-1.5 h-px w-auto" />
                      ) : null}
                      <SmartLink
                        href={getMatchHref(match)}
                        className="theme-search-suggestion flex h-auto w-full flex-col items-stretch justify-start gap-2.5 whitespace-normal rounded-xl border border-transparent bg-transparent px-4 py-4 text-left text-sm transition-[background-color,border-color,box-shadow,color] duration-200 theme-focus-ring sm:px-5"
                        data-highlighted={isBestMatch}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="theme-search-suggestion-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                            <Icon icon={getSuggestionIcon(match)} size={16} />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <HighlightedText
                              text={match.label}
                              query={highlightQuery}
                              className="theme-search-suggestion-title min-w-0 max-w-full break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]"
                              markClassName="theme-search-highlight-mark"
                            />
                            {aliasPreview ? (
                              <HighlightedText
                                text={aliasPreview}
                                query={highlightQuery}
                                className="theme-search-suggestion-aliases min-w-0 truncate text-[0.6875rem] font-medium leading-4"
                                markClassName="theme-search-highlight-mark"
                              />
                            ) : null}
                          </div>
                          {isBestMatch ? (
                            <span
                              className="theme-search-best-match theme-control-pill hidden h-7 w-7 shrink-0 items-center justify-center rounded-full sm:inline-flex"
                              aria-label={t("Best match")}
                              title={t("Best match")}
                            >
                              <Icon icon="lucide:star" size={14} />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5 pl-9">
                          {descriptionText ? (
                            <HighlightedText
                              text={descriptionText}
                              query={highlightQuery}
                              className="theme-search-suggestion-secondary line-clamp-2 text-[0.8125rem] leading-5"
                              markClassName="theme-search-highlight-mark"
                            />
                          ) : null}
                        </div>
                      </SmartLink>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          ))
        )}
        </div>
      </section>
    </main>
  );
}
