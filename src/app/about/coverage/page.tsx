import type { Metadata } from "next";

import { getRawSubstances } from "@server/convex/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Surface } from "@/components/ui/surface";
import { CoverageLegend } from "@/features/coverage/CoverageLegend";
import {
  CoverageGlyphSprite,
  CoverageTable,
} from "@/features/coverage/CoverageTable";
import {
  buildCoverageRows,
  buildCoverageTotals,
  getCoverageColumns,
} from "@/features/coverage/coverageModel";
import type { SubstanceArticle } from "@/schema";

export const revalidate = 3600;

/**
 * Unlisted by design. The page is reachable at its address but carries
 * `noIndex`, is absent from `STATIC_PUBLIC_PATHS` so it never enters the
 * sitemap, and nothing links to it — including the About page it sits under.
 */
export const metadata: Metadata = buildPublicPageMetadata({
  title: "Coverage | dose.wiki",
  description:
    "Per-section content and citation coverage across every dose.wiki substance article.",
  pathname: "/about/coverage",
  noIndex: true,
});

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

export default async function CoveragePage() {
  const substances = await getRawSubstances();
  const columns = getCoverageColumns();
  const rows = buildCoverageRows(
    substances as (SubstanceArticle & { slug?: string })[],
    columns,
  );
  const totals = buildCoverageTotals(rows, columns);

  const emptySections = totals.sections - totals.filled;
  const percent = (part: number, whole: number) =>
    whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;

  return (
    <PublicContentShell width="wide">
      <PageHeader
        title="Coverage"
        icon="ph:grid-four"
        description={
          <>
            Which article sections are written, and which carry citations.{" "}
            {totals.articles.toLocaleString()} articles ×{" "}
            {columns.length.toLocaleString()} sections.
          </>
        }
      />

      <CoverageGlyphSprite />

      <div className="space-y-8">
        <Surface variant="public" padding="lg" radius="xl">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
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
          </div>
        </Surface>

        <CoverageTable columns={columns} rows={rows} />

        <Surface variant="subtle" padding="lg" radius="xl">
          <CoverageLegend />
          <p className="theme-text-faint mt-6 border-t border-dose-divider pt-4 text-xs">
            Content status comes from the same section-presence rules the article
            page and its table of contents use, so this table cannot disagree
            with what a reader sees. Citation status counts inline{" "}
            <code className="font-mono">[cite:…]</code> markers and structured
            reference ids within each section&rsquo;s own fields. Reagent testing
            is omitted because its presence partly depends on a client-side
            external lookup; the bibliography is omitted as a column because it
            is the citation axis rather than a section within it.
          </p>
        </Surface>
      </div>
    </PublicContentShell>
  );
}
