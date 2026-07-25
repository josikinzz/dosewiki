"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { COVERAGE_GLYPHS, GLYPH_SIZE, coverageGlyphId } from "./coverageGlyphs";
import {
  buildCoverageTotals,
  roaHollowCount,
  type CoverageColumn,
  type CoverageRoaCounts,
  type CoverageRow,
  type CoverageTotals,
} from "./coverageModel";
import {
  COVERAGE_BIBLIOGRAPHY_DISPLAY,
  COVERAGE_CITATION_DISPLAY,
  COVERAGE_CONTENT_DISPLAY,
  COVERAGE_STUB_DISPLAY,
  COVERAGE_STUB_REASON_LABEL,
  COVERAGE_TONE_CLASS,
  type CoverageStatusDisplay,
} from "./coverageStatusDisplay";

export type CoverageMode = "content" | "citations";

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
// The two article-level columns sit outside the per-section grid, so the group
// is fenced off with a divider rather than reading as a ninth and tenth section.
const ARTICLE_COLUMN_EDGE_CLASS = "border-l border-dose-divider";
const FOOT_ROW_CLASS = "border-t border-dose-divider bg-dose-surface-muted";
const FOOT_LABEL_CLASS =
  "sticky bottom-0 left-0 z-30 w-full min-w-52 bg-dose-surface-muted px-4 py-2 text-left font-normal";
const FOOT_CELL_CLASS =
  "sticky bottom-0 z-10 bg-dose-surface-muted px-1 py-2 text-center text-xs tabular-nums";
const BODY_CLASS =
  "divide-y divide-dose-divider [&>tr:nth-child(even)>th]:bg-dose-surface-muted/35 [&>tr:nth-child(even)]:bg-dose-surface-muted/35";

/** Short badge for an article that is not listed on the substance index. */
const UNLISTED_LABEL: Record<string, string> = {
  hidden: "hidden",
  low_priority: "low priority",
};

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

/**
 * The two columns that describe the article rather than one of its sections:
 * how many of its route tables are empty shells, and whether the article page
 * banners it as a stub.
 */
const ARTICLE_COLUMNS = [
  {
    id: "roa",
    label: "Routes with an empty table, over routes carried",
    shortLabel: "ROA",
    icon: "ph:table",
  },
  {
    id: "stub",
    label: "Stub verdict",
    shortLabel: "Stub",
    icon: "ph:file-dashed",
  },
] as const;

/**
 * Empty route tables over routes carried, drawn as text rather than a status
 * mark: the ratio is the point. One hollow ROA out of four is a different
 * problem from four out of four, and a single glyph cannot say which.
 */
function RoaMark({ roa }: { roa: CoverageRoaCounts }) {
  if (roa.total === 0) {
    return (
      <span
        aria-hidden
        className={cn("block leading-none", COVERAGE_TONE_CLASS.blank)}
      >
        –
      </span>
    );
  }

  const hollow = roaHollowCount(roa);
  return (
    <span
      aria-hidden
      className={cn(
        "block text-xs leading-none tabular-nums",
        COVERAGE_TONE_CLASS[hollow === 0 ? "quiet" : "warning"],
      )}
    >
      {hollow === 0 ? roa.total : `${hollow}/${roa.total}`}
    </span>
  );
}

function roaCellLabel(roa: CoverageRoaCounts): string {
  if (roa.total === 0) return "No routes";
  const plural = roa.total === 1 ? "" : "s";
  if (roaHollowCount(roa) === 0) {
    return `${roa.total} route${plural}, every table populated`;
  }
  const parts: string[] = [];
  if (roa.blank > 0) parts.push(`${roa.blank} rendering nothing at all`);
  if (roa.partial > 0) parts.push(`${roa.partial} empty on one side`);
  return `${roaHollowCount(roa)} of ${roa.total} routes carry an empty table: ${parts.join(", ")}`;
}

function stubCellLabel(row: CoverageRow): string {
  if (!row.stub.isStub) return COVERAGE_STUB_DISPLAY.complete.label;
  const reasons = row.stub.reasons
    .map((reason) => COVERAGE_STUB_REASON_LABEL[reason])
    .join("; ");
  return reasons ? `Stub — ${reasons}` : COVERAGE_STUB_DISPLAY.stub.label;
}

/** A footer tally, coloured only when there is something to act on. */
function FootCount({ value }: { value: number }) {
  return (
    <span
      className={value > 0 ? "text-dose-warning" : "text-dose-text-ghost"}
    >
      {value}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="theme-accent-heading font-display text-2xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="theme-text-faint text-xs">{label}</div>
    </div>
  );
}

/**
 * Headline numbers for the audited corpus.
 *
 * These follow the scope toggle but not the search box: they describe what is
 * being measured, not what happens to be on screen.
 */
function CoverageSummary({
  totals,
  scope,
}: {
  totals: CoverageTotals;
  scope: boolean;
}) {
  const percent = (part: number, whole: number) =>
    whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
  const emptySections = totals.sections - totals.filled;

  return (
    <Surface variant="public" padding="lg" radius="xl">
      <p className="theme-text-faint mb-4 text-xs">
        {scope
          ? "Every substance article, including those kept off the public index."
          : "Substance articles listed on the public index."}{" "}
        {totals.articles.toLocaleString()} articles.
      </p>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat
          value={percent(totals.filled, totals.sections)}
          label={`sections written (${emptySections.toLocaleString()} empty)`}
        />
        <Stat
          value={percent(totals.articlesWithPass, totals.articles)}
          label={`articles with a citation pass (${totals.articlesWithPass.toLocaleString()})`}
        />
        <Stat
          value={percent(totals.cited, totals.filled)}
          label={`written sections cited (${totals.cited.toLocaleString()})`}
        />
        <Stat
          value={totals.bare.toLocaleString()}
          label="written sections a pass reached but left uncited"
        />
        <Stat
          value={roaHollowCount(totals.roa).toLocaleString()}
          label={`empty route tables in ${totals.roa.articlesWithHollow.toLocaleString()} articles (of ${totals.roa.total.toLocaleString()} routes)`}
        />
        <Stat
          value={totals.stubs.toLocaleString()}
          label="articles the stub banner covers"
        />
      </div>
    </Surface>
  );
}

export interface CoverageTableProps {
  columns: CoverageColumn[];
  rows: CoverageRow[];
}

export function CoverageTable({ columns, rows }: CoverageTableProps) {
  const [mode, setMode] = useState<CoverageMode>("content");
  const [includeUnlisted, setIncludeUnlisted] = useState(false);
  const [query, setQuery] = useState("");
  const [gapsFirst, setGapsFirst] = useState(false);
  const [stubsOnly, setStubsOnly] = useState(false);
  const [blankRoaOnly, setBlankRoaOnly] = useState(false);

  // Typing re-filters 577 rows on every keystroke; deferring keeps the field
  // responsive while the table catches up.
  const deferredQuery = useDeferredValue(query);

  // The audited corpus. Search narrows what you look at; this decides what is
  // being measured, so the headline totals follow it and ignore the search box.
  const scopedRows = useMemo(
    () =>
      includeUnlisted
        ? rows
        : rows.filter((row) => row.visibility === "public"),
    [rows, includeUnlisted],
  );

  const totals = useMemo(
    () => buildCoverageTotals(scopedRows, columns),
    [scopedRows, columns],
  );

  const visibleRows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = scopedRows.filter((row) => {
      if (stubsOnly && !row.stub.isStub) return false;
      if (blankRoaOnly && roaHollowCount(row.roa) === 0) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.slug.toLowerCase().includes(needle)
      );
    });

    if (!gapsFirst) return filtered;

    const gapCount = (row: CoverageRow) =>
      mode === "content" ? row.emptyCount : row.bareCount;
    return [...filtered].sort((left, right) => {
      const bySection = gapCount(right) - gapCount(left);
      if (bySection !== 0) return bySection;
      // Section counts tie constantly, so empty route tables break the tie:
      // among articles with the same empty sections, the ones whose dosage
      // section is half scaffolding come first.
      const byRoa = roaHollowCount(right.roa) - roaHollowCount(left.roa);
      if (byRoa !== 0) return byRoa;
      return left.name.localeCompare(right.name);
    });
  }, [scopedRows, deferredQuery, gapsFirst, mode, stubsOnly, blankRoaOnly]);

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

  // Article-level gaps across the rows currently on screen, so the two extra
  // footer cells read the same way the per-column ones do.
  const articleGaps = useMemo(
    () =>
      visibleRows.reduce(
        (acc, row) => ({
          roaHollow: acc.roaHollow + roaHollowCount(row.roa),
          stubs: acc.stubs + (row.stub.isStub ? 1 : 0),
        }),
        { roaHollow: 0, stubs: 0 },
      ),
    [visibleRows],
  );

  const unlistedCount = useMemo(
    () => rows.filter((row) => row.visibility !== "public").length,
    [rows],
  );

  const modeLabel = mode === "content" ? "content" : "citation";
  const gapLabel = mode === "content" ? "empty" : "uncited after a pass";

  return (
    <div className="space-y-5">
      <CoverageSummary totals={totals} scope={includeUnlisted} />

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
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeUnlisted}
            onChange={(event) => setIncludeUnlisted(event.target.checked)}
            className="accent-dose-accent-strong"
          />
          Include unlisted ({unlistedCount.toLocaleString()})
        </label>
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={gapsFirst}
            onChange={(event) => setGapsFirst(event.target.checked)}
            className="accent-dose-accent-strong"
          />
          Most gaps first
        </label>
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={stubsOnly}
            onChange={(event) => setStubsOnly(event.target.checked)}
            className="accent-dose-accent-strong"
          />
          Stubs only
        </label>
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={blankRoaOnly}
            onChange={(event) => setBlankRoaOnly(event.target.checked)}
            className="accent-dose-accent-strong"
          />
          Empty route tables only
        </label>
        <span className="theme-text-faint ml-auto text-xs tabular-nums">
          {visibleRows.length.toLocaleString()} of{" "}
          {scopedRows.length.toLocaleString()} articles
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
                {ARTICLE_COLUMNS.map((column, index) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      COLUMN_HEAD_CLASS,
                      index === 0 && ARTICLE_COLUMN_EDGE_CLASS,
                    )}
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
                        ) : row.visibility !== "public" ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-dose-text-ghost">
                            {UNLISTED_LABEL[row.visibility]}
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
                    <td
                      className={cn(CELL_CLASS, ARTICLE_COLUMN_EDGE_CLASS)}
                      title={`${row.name} — ${roaCellLabel(row.roa)}`}
                      aria-label={roaCellLabel(row.roa)}
                    >
                      <RoaMark roa={row.roa} />
                    </td>
                    <td
                      className={CELL_CLASS}
                      title={`${row.name} — ${stubCellLabel(row)}`}
                      aria-label={stubCellLabel(row)}
                    >
                      <StatusMark
                        display={
                          COVERAGE_STUB_DISPLAY[
                            row.stub.isStub ? "stub" : "complete"
                          ]
                        }
                      />
                    </td>
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
                  <td key={column.id} className={FOOT_CELL_CLASS}>
                    <FootCount value={columnGaps[index]} />
                  </td>
                ))}
                <td
                  className={cn(FOOT_CELL_CLASS, ARTICLE_COLUMN_EDGE_CLASS)}
                  title="Empty route tables among the visible rows"
                >
                  <FootCount value={articleGaps.roaHollow} />
                </td>
                <td
                  className={FOOT_CELL_CLASS}
                  title="Stub articles among the visible rows"
                >
                  <FootCount value={articleGaps.stubs} />
                </td>
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
