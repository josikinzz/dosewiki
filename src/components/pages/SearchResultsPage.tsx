import Link from "next/link";
import { PageHeader } from "../layout/PageHeader";
import type { SearchMatch } from "../../data/builders/search";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  PublicContentShell,
  SearchResultCard,
  type SearchMetaChipItem,
  type SearchResultCardModel,
} from "@/components/layout/PublicPagePrimitives";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";

interface SearchResultsPageProps {
  query: string;
  results: SearchMatch[];
  emptyState?: PublicRouteEmptyState;
}

const META_TOKEN_SPLIT = /[·,/]/;

const extractMetaTokens = (
  meta?: SearchMatch["meta"],
): SearchMetaChipItem[] => {
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

  return Array.from(tokens).map((token) => ({
    id: token,
    label: token,
  }));
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

const toSearchResultCardModel = (
  match: SearchMatch,
  index: number,
  trimmedQuery: string,
): SearchResultCardModel => ({
  id: match.id,
  href: getMatchHref(match),
  typeLabel: typeLabel(match),
  label: match.label,
  secondary: match.secondary,
  icon: match.icon,
  metaChips: extractMetaTokens(match.meta),
  isBestMatch: index === 0 && trimmedQuery.length > 0,
});

export function SearchResultsPage({
  query,
  results,
  emptyState,
}: SearchResultsPageProps) {
  const trimmed = query.trim();
  const resolvedEmptyState = emptyState ?? {
    badge: trimmed ? "No direct matches" : "Search ready",
    title: trimmed
      ? "No matches found"
      : "Start with a substance, class, or effect",
    description: trimmed
      ? "Try another spelling, search for a broader class, or jump into the public indexes instead."
      : "Use the search bar at the top of the page to jump quickly to substances, categories, and effect entries.",
    icon: trimmed ? ("lucide:search-x" as const) : ("lucide:search" as const),
    footer: trimmed
      ? "Search terms are matched across labels, aliases, and related metadata."
      : undefined,
  };

  return (
    <PublicContentShell focusTarget>
      <PageHeader
        title="Search results"
        icon="lucide:search"
        description={
          trimmed
            ? `${results.length} ${results.length === 1 ? "match" : "matches"} for “${trimmed}”.`
            : "Start typing in the search bar at the top of the page to look up substances, categories, or effects."
        }
      />

      {results.length === 0 ? (
        <StateCard
          badge={resolvedEmptyState.badge}
          badgeVariant="secondary"
          title={resolvedEmptyState.title}
          description={
            trimmed ? (
              <>
                Nothing matched{" "}
                <span className="theme-text-primary font-medium">
                  “{trimmed}”
                </span>
                . {resolvedEmptyState.description}
              </>
            ) : (
              resolvedEmptyState.description
            )
          }
          icon={resolvedEmptyState.icon}
          tone="neutral"
          actions={
            <>
              <Button variant="pill" size="pill" asChild>
                <Link href={publicHref.substance("lsd")}>
                  Browse a known substance
                </Link>
              </Button>
              <Button variant="outline" size="pill" asChild>
                <Link href={publicHref.effect("visuals")}>Explore effects</Link>
              </Button>
            </>
          }
          footer={resolvedEmptyState.footer}
        />
      ) : (
        <ul className="space-y-3">
          {results.map((match, index) => (
            <li key={match.id}>
              <SearchResultCard
                result={toSearchResultCardModel(match, index, trimmed)}
                highlightedQuery={trimmed}
              />
            </li>
          ))}
        </ul>
      )}
    </PublicContentShell>
  );
}
