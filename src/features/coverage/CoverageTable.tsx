"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { COVERAGE_GLYPHS, GLYPH_SIZE, coverageGlyphId } from "./coverageGlyphs";
import type { CoverageColumn, CoverageRow } from "./coverageModel";
import {
  COVERAGE_BIBLIOGRAPHY_DISPLAY,
  COVERAGE_CITATION_DISPLAY,
  COVERAGE_CONTENT_DISPLAY,
  COVERAGE_TONE_CLASS,
  type CoverageStatusDisplay,
} from "./coverageStatusDisplay";

export type CoverageMode = "content" | "citations";
type PriorityFilter = "all" | "high" | "normal" | "low";

const TABLE_WRAP_CLASS =
  "relative overflow-hidden rounded-2xl border border-dose-card-border shadow-xl after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-30 after:w-10 after:bg-gradient-to-l after:from-dose-surface after:to-transparent";
const TABLE_SCROLL_CLASS = "max-h-[75vh] overflow-auto";
const TABLE_CLASS = "w-full border-collapse text-left text-sm";
const HEAD_ROW_CLASS = "border-b border-dose-divider bg-dose-surface-muted";
// The corner cell sits at the crossing of both pinned axes, so it needs the
// highest stacking order and an opaque fill of its own. `w-full` on the label
// column makes it absorb the table's slack, which keeps the eight status
// columns at their natural width instead of stretching them apart.
const CORNER_CELL_CLASS =
  "sticky left-0 top-0 z-40 w-full min-w-52 bg-dose-surface-muted px-4 py-3 text-left";
const COLUMN_HEAD_CLASS =
  "sticky top-0 z-20 w-16 min-w-16 bg-dose-surface-muted px-1 py-3 text-center align-bottom";
const ROW_LABEL_CLASS =
  "sticky left-0 z-10 h-8 w-full min-w-52 bg-dose-surface px-4 text-left font-normal";
const CELL_CLASS = "h-8 px-1 text-center align-middle";
const FOOT_ROW_CLASS = "border-t border-dose-divider bg-dose-surface-muted";
const FOOT_LABEL_CLASS =
  "sticky bottom-0 left-0 z-30 w-full min-w-52 bg-dose-surface-muted px-4 py-2 text-left font-normal";
const BODY_CLASS =
  "divide-y divide-dose-divider [&>tr:nth-child(even)>th]:bg-dose-surface-muted/35 [&>tr:nth-child(even)]:bg-dose-surface-muted/35";

const PRIORITY_TABS: { id: PriorityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" },
  { id: "low", label: "Low" },
];

/**
 * One status mark.
 *
 * Statuses with a glyph reference the inlined sprite rather than mounting an
 * icon component, because the table renders thousands of these. Statuses
 * without one draw a plain character, and `blank` draws nothing at all.
 */
function StatusMark({ display }: { display: CoverageStatusDisplay }) {
  const toneClass = COVERAGE_TONE_CLASS[display.tone];

  if (display.glyph) {
    return (
      <svg
        aria-hidden
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        className={cn("mx-auto block", toneClass)}
        focusable="false"
      >
        <use href={`#${coverageGlyphId(display.glyph)}`} />
      </svg>
    );
  }

  if (display.mark) {
    return (
      <span aria-hidden className={cn("block leading-none", toneClass)}>
        {display.mark}
      </span>
    );
  }

  return null;
}

export interface CoverageTableProps {
  columns: CoverageColumn[];
  rows: CoverageRow[];
}

export function CoverageTable({ columns, rows }: CoverageTableProps) {
  const [mode, setMode] = useState<CoverageMode>("content");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [query, setQuery] = useState("");
  const [gapsFirst, setGapsFirst] = useState(false);

  // Typing re-filters 577 rows on every keystroke; deferring keeps the field
  // responsive while the table catches up.
  const deferredQuery = useDeferredValue(query);

  const visibleRows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (priority !== "all" && row.priority !== priority) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.slug.toLowerCase().includes(needle)
      );
    });

    if (!gapsFirst) return filtered;

    const gapCount = (row: CoverageRow) =>
      mode === "content" ? row.emptyCount : row.bareCount;
    return [...filtered].sort(
      (left, right) =>
        gapCount(right) - gapCount(left) || left.name.localeCompare(right.name),
    );
  }, [rows, priority, deferredQuery, gapsFirst, mode]);

  // Gaps per column across the rows currently on screen, so the footer answers
  // "which section is worst off" for whatever slice the filters selected.
  const columnGaps = useMemo(
    () =>
      columns.map((_column, index) =>
        visibleRows.reduce((count, row) => {
          const isGap =
            mode === "content"
              ? row.content[index] === "empty"
              : row.citations[index] === "bare";
          return isGap ? count + 1 : count;
        }, 0),
      ),
    [columns, visibleRows, mode],
  );

  const modeLabel = mode === "content" ? "content" : "citation";
  const gapLabel = mode === "content" ? "empty" : "uncited after a pass";

  return (
    <div className="space-y-5">
      <PublicSegmentedTabs<CoverageMode>
        ariaLabel="Coverage view"
        value={mode}
        onValueChange={setMode}
        items={[
          {
            id: "content",
            label: "Content coverage",
            icon: "ph:article-medium",
            prominence: "major",
          },
          {
            id: "citations",
            label: "Citation coverage",
            icon: "ph:quotes",
            prominence: "major",
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name or slug"
          aria-label="Filter substances"
          className="w-full sm:w-64"
        />
        <PublicSegmentedTabs<PriorityFilter>
          ariaLabel="Priority filter"
          value={priority}
          onValueChange={setPriority}
          items={PRIORITY_TABS}
        />
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={gapsFirst}
            onChange={(event) => setGapsFirst(event.target.checked)}
            className="accent-dose-accent-strong"
          />
          Most gaps first
        </label>
        <span className="theme-text-faint ml-auto text-xs tabular-nums">
          {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
          articles
        </span>
      </div>

      <div className={TABLE_WRAP_CLASS}>
        <div className={TABLE_SCROLL_CLASS}>
          <table className={TABLE_CLASS}>
            <caption className="sr-only">
              Per-section {modeLabel} coverage for every dose.wiki substance
              article.
            </caption>
            <thead>
              <tr className={HEAD_ROW_CLASS}>
                <th scope="col" className={CORNER_CELL_CLASS}>
                  <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Substance
                  </span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={COLUMN_HEAD_CLASS}
                    title={column.label}
                  >
                    <span className="flex flex-col items-center gap-1">
                      <Icon
                        icon={column.icon}
                        size={16}
                        className="theme-text-faint"
                      />
                      <span className="theme-text-secondary text-[10px] font-semibold uppercase tracking-[0.08em]">
                        {column.shortLabel}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={BODY_CLASS}>
              {visibleRows.map((row) => {
                const bibliography =
                  COVERAGE_BIBLIOGRAPHY_DISPLAY[row.bibliography];
                return (
                  <tr key={row.slug}>
                    <th scope="row" className={ROW_LABEL_CLASS}>
                      <span className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/${row.slug}`}
                          className="theme-text-primary truncate rounded-sm text-sm hover:text-dose-accent-strong hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
                        >
                          {row.name}
                        </Link>
                        {mode === "citations" ? (
                          <span
                            className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-dose-text-ghost"
                            title={bibliography.description}
                          >
                            {bibliography.label}
                          </span>
                        ) : null}
                      </span>
                    </th>
                    {columns.map((column, index) => {
                      const display =
                        mode === "content"
                          ? COVERAGE_CONTENT_DISPLAY[row.content[index]]
                          : COVERAGE_CITATION_DISPLAY[row.citations[index]];
                      return (
                        <td
                          key={column.id}
                          className={CELL_CLASS}
                          title={`${row.name} — ${column.label}: ${display.label}`}
                          aria-label={`${column.label}: ${display.label}`}
                        >
                          <StatusMark display={display} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={FOOT_ROW_CLASS}>
                <th scope="row" className={FOOT_LABEL_CLASS}>
                  <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {gapLabel}
                  </span>
                </th>
                {columns.map((column, index) => (
                  <td
                    key={column.id}
                    className="sticky bottom-0 z-10 bg-dose-surface-muted px-1 py-2 text-center text-xs tabular-nums"
                  >
                    <span
                      className={
                        columnGaps[index] > 0
                          ? "text-dose-warning"
                          : "text-dose-text-ghost"
                      }
                    >
                      {columnGaps[index]}
                    </span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <p className="theme-text-faint text-sm">
          No articles match that filter.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sprite definitions for every glyph the table draws. Rendered once per page,
 * visually hidden, and referenced by `<use>` from each cell.
 */
export function CoverageGlyphSprite() {
  return (
    <svg aria-hidden className="hidden" focusable="false">
      {Object.entries(COVERAGE_GLYPHS).map(([key, glyph]) => (
        <symbol
          key={key}
          id={coverageGlyphId(key as keyof typeof COVERAGE_GLYPHS)}
          viewBox={glyph.viewBox}
          dangerouslySetInnerHTML={{ __html: glyph.body }}
        />
      ))}
    </svg>
  );
}
