import Link from "next/link";
import { PageHeader } from "../layout/PageHeader";
import type { SearchMatch } from "../../data/builders/search";
import { HighlightedText } from "@/components/common/HighlightedText";
import { StateCard } from "@/components/common/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { interactiveSurfaceVariants } from "@/components/ui/surface";
import { publicHref } from "@/utils/publicHref";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";

interface SearchResultsPageProps {
  query: string;
  results: SearchMatch[];
  emptyState?: PublicRouteEmptyState;
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

export function SearchResultsPage({ query, results, emptyState }: SearchResultsPageProps) {
  const trimmed = query.trim();
  const resolvedEmptyState = emptyState ?? {
    badge: trimmed ? "No direct matches" : "Search ready",
    title: trimmed ? "No matches found" : "Start with a substance, class, or effect",
    description: trimmed
      ? "Try another spelling, search for a broader class, or jump into the public indexes instead."
      : "Use the search bar at the top of the page to jump quickly to substances, categories, and effect entries.",
    icon: trimmed ? "lucide:search-x" as const : "lucide:search" as const,
    footer: trimmed ? "Search terms are matched across labels, aliases, and related metadata." : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
                Nothing matched <span className="font-medium text-white">“{trimmed}”</span>. {resolvedEmptyState.description}
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
                <Link href={publicHref.substance("lsd")}>Browse a known substance</Link>
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
              <Button
                variant="card"
                size="card"
                asChild
                className={interactiveSurfaceVariants({ variant: "result" })}
              >
                <Link href={getMatchHref(match)}>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.28em] text-white/70">
                        {typeLabel(match)}
                      </span>
                      {index === 0 && trimmed ? (
                        <Badge variant="secondary" className="text-[10px] text-fuchsia-100">
                          Best match
                        </Badge>
                      ) : null}
                    </div>
                    <HighlightedText
                      text={match.label}
                      query={trimmed}
                      className="text-xl font-semibold text-fuchsia-200"
                    />
                    {match.secondary && (
                      <HighlightedText
                        text={match.secondary}
                        query={trimmed}
                        className="text-sm leading-6 text-white/70"
                        markClassName="bg-white/10 text-white"
                      />
                    )}
                    {(() => {
                      const tokens = extractMetaTokens(match.meta);
                      if (tokens.length === 0) {
                        return null;
                      }
                      return (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {tokens.map((token) => (
                            <Badge
                              key={`${match.id}-badge-${token}`}
                              variant="default"
                              className="text-[11px] transition-colors group-hover:border-fuchsia-400/30 group-hover:text-fuchsia-100"
                            >
                              <HighlightedText
                                text={token}
                                query={trimmed}
                                markClassName="bg-white/10 text-white"
                              />
                            </Badge>
                          ))}
                        </span>
                      );
                    })()}
                  </div>
                  <span className="mt-1 hidden shrink-0 text-sm font-semibold uppercase tracking-wide text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 sm:inline-flex">
                    View
                  </span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
