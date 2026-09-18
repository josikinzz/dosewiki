"use client";

import { useId, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { GlossaryUsageResponse } from "@/lib/glossary/glossaryUsage";

const COMPACT_LINK_COUNT = 3;

/** Public-safe and lazy on both the public glossary and the editor's review table. */
export function GlossaryUsageDisclosure({ term }: { term: string }) {
  const t = useT();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<GlossaryUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load(offset = 0) {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/glossary-usage?${new URLSearchParams({ term, offset: String(offset) })}`);
      if (!response.ok) throw new Error("Usage request failed");
      const next: GlossaryUsageResponse = await response.json();
      setData((current) => offset && current
        ? { ...next, nodes: [...new Map([...current.nodes, ...next.nodes].map((node) => [node.id, node])).values()] }
        : next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  const visibleNodes = data ? (showAll ? data.nodes : data.nodes.slice(0, COMPACT_LINK_COUNT)) : [];
  const hiddenCount = data ? data.nodes.length - COMPACT_LINK_COUNT : 0;

  return (
    <div className="mt-1 w-full text-xs theme-text-secondary">
      <ExpandButton
        variant="faint"
        isExpanded={expanded}
        ariaControls={id}
        ariaLabel={`${t("Where it is used")}: ${term}`}
        onToggle={() => {
          setExpanded(!expanded);
          if (expanded) setShowAll(false);
          if (!expanded && !data && !loading) void load();
        }}
      >
        {t("Where it is used")}
      </ExpandButton>
      <div id={id} hidden={!expanded} aria-busy={loading} className="mt-1 space-y-1.5">
        {data ? (
          <>
            <p className="theme-text-muted" title={data.coverage}>
              {data.totalSourceNodes} {t("matching source locations")} · {t("Partial coverage")}
            </p>
            {data.nodes.length ? (
              <ul id={`${id}-links`} className="space-y-1 break-words">
                {visibleNodes.map((node) => (
                  <li key={node.id} className="leading-snug">
                    <a href={node.href} className="theme-accent-underline underline underline-offset-2 hover:theme-text-primary" lang="en">
                      {node.title}
                    </a>
                    <span className="theme-text-muted" lang="en"> · {node.context}</span>
                  </li>
                ))}
              </ul>
            ) : <p>{t("No matching source locations in the covered sources.")}</p>}
            {hiddenCount > 0 ? (
              <ExpandButton
                variant="faint"
                isExpanded={showAll}
                ariaControls={`${id}-links`}
                ariaLabel={`${t("More source links")}: ${term}`}
                onToggle={() => setShowAll(!showAll)}
              >
                {showAll ? t("Show fewer links") : t("Show {{count}} more", { count: hiddenCount })}
              </ExpandButton>
            ) : null}
          </>
        ) : null}
        {loading ? <p role="status">{t("Loading usage sources...")}</p> : null}
        {error ? (
          <div role="alert" className="space-y-2">
            <p>{t("Usage sources could not be loaded.")}</p>
            <Button type="button" variant="outline" size="xs" onClick={() => void load(data?.nextOffset ?? 0)}>{t("Try again")}</Button>
          </div>
        ) : showAll && data?.nextOffset != null ? (
          <Button type="button" variant="outline" size="xs" disabled={loading} onClick={() => void load(data.nextOffset!)}>{t("Show more source locations")}</Button>
        ) : null}
      </div>
    </div>
  );
}
