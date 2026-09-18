"use client";

import type { SearchSuggestion } from "@/data/builders/search";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { FocusedSearchResultsPage } from "@/components/pages/FocusedSearchResultsPage";
import { useGlobalSearchSuggestions } from "@/components/common/useGlobalSearchSuggestions";
import { Surface } from "@/components/ui/surface";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

interface LiveSearchResultsPageProps {
  initialQuery: string;
  initialResults?: SearchSuggestion[];
}

export function LiveSearchResultsPage({ initialQuery, initialResults = [] }: LiveSearchResultsPageProps) {
  const t = useT();
  const query = initialQuery;
  const trimmed = query.trim();
  const { suggestions, isUpdatingSuggestions } = useGlobalSearchSuggestions({
    isActiveSearch: trimmed.length > 0,
    query: trimmed,
    limit: 60,
    initialQuery,
    initialResults,
    loadManifestOnActivate: false,
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
            className="theme-feedback-enter p-6 shadow-[var(--theme-elevation-xl)] ring-1 backdrop-blur-xl sm:p-8"
          >
            <SearchEmptyState
              icon="lucide:search"
              title={t("Search {{siteName}}", { siteName: SITE_FLAVOR_CONFIG.name })}
              description={t(
                "Start typing in the header to find substances, effects, reports, and profiles.",
              )}
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
      isLoading={isUpdatingSuggestions}
    />
  );
}
