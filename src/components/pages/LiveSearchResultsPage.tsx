"use client";

import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { FocusedSearchResultsPage } from "@/components/pages/FocusedSearchResultsPage";
import { useGlobalSearchSuggestions } from "@/components/common/useGlobalSearchSuggestions";

interface LiveSearchResultsPageProps {
  initialQuery: string;
}

export function LiveSearchResultsPage({ initialQuery }: LiveSearchResultsPageProps) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? initialQuery;
  const trimmed = query.trim();
  const { suggestions, isFetchingSuggestions } = useGlobalSearchSuggestions({
    isActiveSearch: trimmed.length > 0,
    query: trimmed,
    limit: 60,
  });

  if (!trimmed) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="theme-page-shell theme-search-page-shell min-h-screen px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
      >
        <section className="mx-auto flex w-full max-w-[62rem] flex-col">
          <div className="theme-public-card rounded-2xl border p-6 shadow-xl ring-1 backdrop-blur-xl sm:p-8">
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
              <span className="theme-search-suggestion-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                <Search size={20} />
              </span>
              <div className="space-y-1">
                <h1 className="theme-search-suggestion-title text-lg font-semibold">
                  Search dose.wiki
                </h1>
                <p className="theme-search-suggestion-secondary max-w-md text-[0.8125rem] leading-5">
                  Start typing in the header to find substances, effects, reports, and profiles.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <FocusedSearchResultsPage
      query={trimmed}
      results={suggestions}
      isLoading={isFetchingSuggestions}
    />
  );
}
