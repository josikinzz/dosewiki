"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { JsonSyntaxHighlight } from "@/components/pages/AboutArchivePreview";
import { Button } from "@/components/ui/button";
import type { TranslationSamplePair } from "@server/next/translationPacks";

/** A Markdown page as its source text, numbered like the JSON side. */
function MarkdownSource({ text }: { text: string }) {
  return (
    <div className="theme-json-preview-text font-mono text-xs leading-relaxed">
      {text.split("\n").map((line, index) => (
        <div key={index} className="grid grid-cols-[2.5rem_1fr] items-start gap-3">
          <span className="theme-json-preview-line-number select-none pr-2 text-right tabular-nums">{index + 1}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{line.length ? line : "\u00a0"}</span>
        </div>
      ))}
    </div>
  );
}

type LoadedPair = { translated: string; source: string; markdown?: Record<string, string> };

/**
 * One whole record from a dataset, its translation on the left (as JSON, or
 * as the emitted Markdown page) and its English on the right, in the About
 * page's code cell. Collapsed until
 * opened; the record is fetched when the cell opens, since a substance
 * article runs to a hundred kilobytes a side. Shuffle moves to another.
 */
export function TranslationSampleCompare({
  pairs,
  format,
  locale,
  translatedLabel,
  sourceLabel,
}: {
  pairs: TranslationSamplePair[];
  /** JSON compares the two JSON records; Markdown compares the two emitted pages. */
  format: "json" | "markdown";
  locale: string;
  translatedLabel: string;
  sourceLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => Math.floor(Math.random() * pairs.length));
  const [loaded, setLoaded] = useState<Record<string, LoadedPair>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const pair = pairs[current];

  useEffect(() => {
    if (!open || !pair || loaded[pair.href]) return;
    let cancelled = false;
    setFailed(null);
    fetch(pair.href)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.json() as Promise<LoadedPair>;
      })
      .then((record) => {
        if (!cancelled) setLoaded((previous) => ({ ...previous, [pair.href]: record }));
      })
      .catch(() => {
        if (!cancelled) setFailed(pair.href);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pair, loaded]);

  if (!pair) return null;
  const record = loaded[pair.href];

  const shuffle = () => {
    if (pairs.length < 2) return;
    let next = current;
    while (next === current) next = Math.floor(Math.random() * pairs.length);
    setCurrent(next);
  };

  return (
    <details className="group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="theme-text-secondary flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
        <Icon icon="lucide:chevron-right" size={16} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        <span lang="zh-Hans">对照样例</span>
        <span className="theme-text-faint" aria-hidden="true">
          ·
        </span>
        <span>Compare a record</span>
      </summary>

      <div className="theme-card-surface theme-about-json-preview mt-4 flex min-w-0 flex-col overflow-hidden rounded-2xl border">
        <div className="theme-about-json-preview-header flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <span className="theme-json-preview-muted min-w-0 truncate text-xs font-medium leading-4">
            <span lang="zh-Hans">{pair.labelZh}</span>
            {pair.label !== pair.labelZh ? <> · {pair.label}</> : null}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={shuffle}
            className="theme-json-preview-action h-8 min-h-0 gap-1.5 rounded-lg px-2.5 text-xs hover:bg-transparent"
          >
            <Icon icon="lucide:dices" size={12} />
            Shuffle
          </Button>
        </div>
        <div className="theme-about-json-preview-body relative overflow-hidden">
          <div aria-hidden="true" className="theme-json-preview-ambient pointer-events-none absolute inset-0 opacity-[0.65]" />
          {record ? (
            <div key={pair.href} className="relative grid max-h-[40rem] overflow-auto custom-scrollbar lg:grid-cols-2">
              <section aria-label={translatedLabel} lang="zh-Hans" className="theme-china-reveal-left min-w-0 py-4 pl-3 pr-4">
                {format === "markdown" && record.markdown?.[locale] ? (
                  <MarkdownSource text={record.markdown[locale]} />
                ) : (
                  <JsonSyntaxHighlight json={record.translated} truncated={false} />
                )}
              </section>
              <section
                aria-label={sourceLabel}
                lang="en"
                className="theme-china-reveal-right border-dose-divider min-w-0 border-t py-4 pl-3 pr-4 lg:border-l lg:border-t-0"
              >
                {format === "markdown" && record.markdown?.en ? (
                  <MarkdownSource text={record.markdown.en} />
                ) : (
                  <JsonSyntaxHighlight json={record.source} truncated={false} />
                )}
              </section>
            </div>
          ) : (
            <p className="theme-json-preview-muted relative px-4 py-6 font-mono text-xs">
              {failed === pair.href ? "Could not load this record." : "Loading…"}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
