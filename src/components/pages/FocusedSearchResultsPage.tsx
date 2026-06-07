import Link from "next/link";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon, type IconName } from "@/components/common/Icon";
import type { SearchMatch } from "@/data/builders/search";
import { publicHref } from "@/utils/publicHref";

interface FocusedSearchResultsPageProps {
  query: string;
  results: SearchMatch[];
}

const getMatchHref = (match: SearchMatch) => {
  switch (match.type) {
    case "substance":
      return publicHref.substance(match.slug);
    case "category":
      return publicHref.category(match.slug);
    case "effect":
      return publicHref.effect(match.slug);
    default:
      return publicHref.search();
  }
};

const getSuggestionIcon = (match: SearchMatch): IconName => {
  switch (match.type) {
    case "substance":
      return "lucide:flask-conical";
    case "category":
      return match.icon ?? "lucide:layers";
    case "effect":
      return "lucide:sparkles";
    default:
      return "lucide:search";
  }
};

const getAliasPreview = (match: SearchMatch) =>
  match.type === "substance" && match.aliases && match.aliases.length > 0
    ? match.aliases.slice(0, 4).join(" · ")
    : "";

export function FocusedSearchResultsPage({
  query,
  results,
}: FocusedSearchResultsPageProps) {
  const trimmed = query.trim();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell theme-search-page-shell min-h-screen px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
    >
      <section className="mx-auto flex w-full max-w-[62rem] flex-col">
        <div className="theme-overlay-surface theme-search-overlay rounded-2xl border p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl">
          {results.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <span className="theme-search-suggestion-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                <Icon icon="lucide:search-x" size={20} />
              </span>
              <div className="space-y-1">
                <h1 className="theme-search-suggestion-title text-lg font-semibold">
                  No matches found
                </h1>
                <p className="theme-search-suggestion-secondary max-w-md text-[0.8125rem] leading-5">
                  Try another spelling, search for a broader class, or jump into the public indexes instead.
                </p>
              </div>
            </div>
          ) : (
            <ul>
              {results.map((match, index) => {
                const aliasPreview = getAliasPreview(match);
                return (
                  <li key={match.id}>
                    {index > 0 ? (
                      <div className="theme-search-result-divider mx-4 my-1.5 h-px w-auto" />
                    ) : null}
                    <Link
                      href={getMatchHref(match)}
                      className="theme-search-suggestion flex h-auto w-full flex-col items-stretch justify-start gap-2.5 whitespace-normal rounded-xl border border-transparent bg-transparent px-4 py-4 text-left text-sm transition-[background-color,border-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="theme-search-suggestion-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                          <Icon icon={getSuggestionIcon(match)} size={16} />
                        </span>
                        <div className="flex min-w-0 flex-1 items-baseline gap-2">
                          <HighlightedText
                            text={match.label}
                            query={trimmed}
                            className="theme-search-suggestion-title shrink-0 text-base font-semibold leading-6"
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
                        {index === 0 && trimmed ? (
                          <span
                            className="theme-search-best-match hidden h-7 w-7 shrink-0 items-center justify-center rounded-full sm:inline-flex"
                            aria-label="Best match"
                            title="Best match"
                          >
                            <Icon icon="lucide:star" size={14} />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5 pl-9">
                        {match.secondary ? (
                          <HighlightedText
                            text={match.secondary}
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
          )}
        </div>
      </section>
    </main>
  );
}
