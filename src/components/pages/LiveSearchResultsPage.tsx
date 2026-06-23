"use client";

import { useSearchParams } from "next/navigation";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { FocusedSearchResultsPage } from "@/components/pages/FocusedSearchResultsPage";
import { useGlobalSearchSuggestions } from "@/components/common/useGlobalSearchSuggestions";
import { Surface } from "@/components/ui/surface";

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
          <Surface
            variant="public"
            padding="none"
            radius="xl"
            className="p-6 shadow-xl ring-1 backdrop-blur-xl sm:p-8"
          >
            <SearchEmptyState
              icon="lucide:search"
              title="Search dose.wiki"
              description="Start typing in the header to find substances, effects, reports, and profiles."
              headingLevel="h1"
            />
          </Surface>
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
