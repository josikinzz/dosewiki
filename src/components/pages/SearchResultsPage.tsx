import { memo, useCallback } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "../sections/PageHeader";
import type { SearchMatch } from "../../data/search";

interface SearchResultsPageProps {
  query: string;
  results: SearchMatch[];
  onSelectSubstance: (slug: string) => void;
  onSelectCategory: (categoryKey: string) => void;
  onSelectEffect: (effectSlug: string) => void;
}

const META_TOKEN_SPLIT = /[·,/]/;

const extractMetaTokens = (meta?: SearchMatch["meta"]): string[] => {
  if (!meta) {
    return [];
  }

  const tokens = new Set<string>();
  meta.forEach((entry) => {
    entry.value
      .split(META_TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .forEach((token) => tokens.add(token));
  });

  return Array.from(tokens);
};

const typeLabel = (match: SearchMatch) => {
  switch (match.type) {
    case "substance":
      return "Substance";
    case "category":
      return "Category";
    case "effect":
      return "Effect";
    default:
      return "";
  }
};

export const SearchResultsPage = memo(function SearchResultsPage({
  query,
  results,
  onSelectSubstance,
  onSelectCategory,
  onSelectEffect,
}: SearchResultsPageProps) {
  const handleSelect = useCallback(
    (match: SearchMatch) => {
      switch (match.type) {
        case "substance":
          onSelectSubstance(match.slug);
          break;
        case "category":
          onSelectCategory(match.slug);
          break;
        case "effect":
          onSelectEffect(match.slug);
          break;
        default:
          break;
      }
    },
    [onSelectCategory, onSelectEffect, onSelectSubstance],
  );

  const trimmed = query.trim();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title="Search results"
        icon={Search}
        description={
          trimmed
            ? `Showing matches for "${trimmed}".`
            : "Start typing in the search bar at the top of the page to look up substances, categories, or effects."
        }
      />

      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
          <p className="text-lg font-semibold text-white">No matches found.</p>
          {trimmed ? (
            <p className="mt-2 text-sm text-white/70">
              Try a different spelling, search for a chemical class, or browse the Substances index instead.
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/70">
              Use the search bar at the top of the page to quickly jump around the library.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {results.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => handleSelect(match)}
                className="flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:border-fuchsia-400/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              >
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] uppercase tracking-[0.34em] text-white/60">
                    {typeLabel(match)}
                  </span>
                  <span className="text-xl font-semibold text-fuchsia-200">{match.label}</span>
                  {match.secondary && (
                    <span className="text-sm text-white/70">{match.secondary}</span>
                  )}
                  {(() => {
                    const tokens = extractMetaTokens(match.meta);
                    if (tokens.length === 0) {
                      return null;
                    }
                    return (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {tokens.map((token) => (
                          <span
                            key={`${match.id}-badge-${token}`}
                            className="inline-flex items-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-0.5 text-[10px] uppercase tracking-[0.24em] text-fuchsia-200/90"
                          >
                            {token}
                          </span>
                        ))}
                      </span>
                    );
                  })()}
                </div>
                <span className="mt-1 hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-white/60 sm:inline-flex">
                  View
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
