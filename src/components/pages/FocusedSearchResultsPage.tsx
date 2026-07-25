import Link from "next/link";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon, type IconName } from "@/components/common/Icon";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SearchingIndicator } from "@/components/common/SearchingIndicator";
import { Surface } from "@/components/ui/surface";
import type { SearchEntryType, SearchSuggestion } from "@/data/builders/search";
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
    : (match.type === "substance" || match.type === "profile") && match.aliases && match.aliases.length > 0
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

const groupSearchResults = (results: SearchSuggestion[]) =>
  SEARCH_RESULT_GROUPS.map((group) => ({
    ...group,
    results: results.filter((match) => match.type === group.type),
  })).filter((group) => group.results.length > 0);

export function FocusedSearchResultsPage({
  query,
  results,
  isLoading = false,
}: FocusedSearchResultsPageProps) {
  const trimmed = query.trim();
  const resultGroups = groupSearchResults(results);
  const bestMatchId = results[0]?.id ?? null;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell theme-search-page-shell min-h-screen px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
    >
      <section className="mx-auto flex w-full max-w-[62rem] flex-col gap-4">
        {isLoading ? (
          <Surface
            variant="public"
            padding="none"
            radius="xl"
            className="p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl"
          >
            <SearchingIndicator className="px-6 py-10" />
          </Surface>
        ) : results.length === 0 ? (
          <Surface
            variant="public"
            padding="none"
            radius="xl"
            className="p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl"
          >
            <SearchEmptyState
              icon="lucide:search-x"
              title="No matches found"
              description="Try another spelling, search for a broader class, or jump into the public indexes instead."
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
              className="p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl"
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
                      <Link
                        href={getMatchHref(match)}
                        className="theme-search-suggestion flex h-auto w-full flex-col items-stretch justify-start gap-2.5 whitespace-normal rounded-xl border border-transparent bg-transparent px-4 py-4 text-left text-sm transition-[background-color,border-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 sm:px-5"
                        data-highlighted={isBestMatch}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="theme-search-suggestion-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                            <Icon icon={getSuggestionIcon(match)} size={16} />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <HighlightedText
                              text={match.label}
                              query={trimmed}
                              className="theme-search-suggestion-title min-w-0 max-w-full break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]"
                              markClassName="theme-search-highlight-mark"
                            />
                            {aliasPreview ? (
                              <HighlightedText
                                text={aliasPreview}
                                query={trimmed}
                                className="theme-search-suggestion-aliases min-w-0 truncate text-[0.6875rem] font-medium leading-4"
                                markClassName="theme-search-highlight-mark"
                              />
                            ) : null}
                          </div>
                          {isBestMatch ? (
                            <span
                              className="theme-search-best-match theme-control-pill hidden h-7 w-7 shrink-0 items-center justify-center rounded-full sm:inline-flex"
                              aria-label="Best match"
                              title="Best match"
                            >
                              <Icon icon="lucide:star" size={14} />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5 pl-9">
                          {descriptionText ? (
                            <HighlightedText
                              text={descriptionText}
                              query={trimmed}
                              className="theme-search-suggestion-secondary line-clamp-2 text-[0.8125rem] leading-5"
                              markClassName="theme-search-highlight-mark"
                            />
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          ))
        )}
      </section>
    </main>
  );
}
