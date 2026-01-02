import { useEffect, useMemo, useState } from "react";
import { Compass, Sparkles } from "lucide-react";

import type articlesSource from "../../../../data/articles";
import { buildSubstanceRecord, type SubstanceRecord } from "../../../../data/contentBuilder";
import type { RouteKey } from "../../../../types/content";
import { LayoutLabPreview } from "./LayoutLabPreview";
import { LayoutLabSearch } from "./LayoutLabSearch";
import { useLayoutLabSelection, type LayoutLabOption } from "./useLayoutLabSelection";
import { IconBadge } from "../../../common/IconBadge";

type ArticleRecord = (typeof articlesSource)[number];

interface LayoutLabTabProps {
  articles: ArticleRecord[];
  defaultSlug: string | null;
  onSelectArticleIndex?: (index: number) => void;
  onOpenEditor?: () => void;
}

interface NormalizedLayoutRecord {
  record: SubstanceRecord;
  index: number;
}

export function LayoutLabTab({
  articles,
  defaultSlug,
  onSelectArticleIndex,
  onOpenEditor,
}: LayoutLabTabProps) {
  const { optionList, recordBySlug } = useMemo(() => {
    const lookup = new Map<string, NormalizedLayoutRecord>();
    const options: LayoutLabOption[] = [];

    articles.forEach((article, index) => {
      const normalized = buildSubstanceRecord(article);
      if (!normalized) {
        return;
      }

      lookup.set(normalized.slug, { record: normalized, index });

      const nameVariants = normalized.content.nameVariants.flatMap((variant) => variant.values);
      const candidateTokens = [
        normalized.name,
        normalized.slug,
        ...normalized.aliases,
        ...normalized.content.aliases,
        ...nameVariants,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      const uniqueTokens = Array.from(new Set(candidateTokens.map((value) => value.trim())));
      const displayAliases = uniqueTokens.filter(
        (value) => value.toLowerCase() !== normalized.name.toLowerCase() && value.toLowerCase() !== normalized.slug.toLowerCase(),
      );

      const label = normalized.name;
      const searchText = uniqueTokens
        .map((value) => value.toLowerCase())
        .join(" ");

      options.push({
        slug: normalized.slug,
        label,
        searchText,
        index,
        aliases: displayAliases,
      });
    });

    options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

    return { optionList: options, recordBySlug: lookup };
  }, [articles]);

  const { query, setQuery, selectedSlug, selectSlug, suggestions, selectedOption } = useLayoutLabSelection(
    optionList,
    defaultSlug,
  );

  const selectedRecordEntry = selectedSlug ? recordBySlug.get(selectedSlug) ?? null : null;

  useEffect(() => {
    if (!selectedRecordEntry || !onSelectArticleIndex) {
      return;
    }
    onSelectArticleIndex(selectedRecordEntry.index);
  }, [onSelectArticleIndex, selectedRecordEntry]);

  const [activeRouteKey, setActiveRouteKey] = useState<RouteKey | null>(null);

  useEffect(() => {
    if (!selectedRecordEntry) {
      setActiveRouteKey(null);
      return;
    }
    const nextDefaultRoute = selectedRecordEntry.record.content.routeOrder[0] ?? null;
    setActiveRouteKey(nextDefaultRoute);
  }, [selectedRecordEntry]);

  const handleRouteChange = (route: RouteKey) => {
    setActiveRouteKey(route);
  };

  return (
    <div className="mt-10 space-y-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <LayoutLabSearch
          query={query}
          onQueryChange={setQuery}
          suggestions={suggestions}
          onSelect={(slug) => selectSlug(slug)}
          activeSlug={selectedSlug}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/12 via-violet-500/8 to-white/5 p-5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
            <p className="flex items-center gap-3 text-sm font-semibold text-fuchsia-200">
              <IconBadge icon={Sparkles} label="Preview tips" />
              Preview tips
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-white/60">
              <li>Select a substance to render the experimental desktop layout.</li>
              <li>Use the route chips inside the preview to explore dosage and duration variants.</li>
              <li>Click “Open in editor” from the metadata card to jump back to the Substances tab.</li>
            </ul>
          </div>

          {selectedRecordEntry && (
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.02] p-5 text-sm text-white/70 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
              <p className="flex items-center gap-3 text-sm font-semibold text-fuchsia-200">
                <IconBadge icon={Compass} label="Currently previewing" />
                Currently previewing
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">{selectedRecordEntry.record.name}</h3>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Slug · {selectedRecordEntry.record.slug}</p>
              {selectedRecordEntry.record.id !== null && (
                <p className="mt-3 text-xs text-white/45">Dataset ID #{selectedRecordEntry.record.id}</p>
              )}
              {selectedOption?.aliases && selectedOption.aliases.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedOption.aliases.slice(0, 8).map((alias) => (
                    <span key={alias} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/65">
                      {alias}
                    </span>
                  ))}
                  {selectedOption.aliases.length > 8 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-white/45">
                      +{selectedOption.aliases.length - 8}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[156.25rem] space-y-6">
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-6 py-5 text-sm text-white/60 shadow-inner shadow-black/30 xl:hidden">
          This experimental layout is optimised for desktop viewports. Expand your window or open the preview on a larger screen to explore the grid composition.
        </div>

        {selectedRecordEntry ? (
          <div className="hidden xl:block">
            <LayoutLabPreview
              record={selectedRecordEntry.record}
              activeRouteKey={activeRouteKey}
              onRouteChange={handleRouteChange}
              onOpenEditor={onOpenEditor}
            />
          </div>
        ) : (
          <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-sm text-white/60 shadow-inner shadow-black/30">
            Start typing a substance name to load the experimental layout.
          </div>
        )}
      </div>
    </div>
  );
}
