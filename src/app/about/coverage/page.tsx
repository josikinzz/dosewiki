import { getPublicCoverageSubstances } from "@server/data/publicData";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Surface } from "@/components/ui/surface";
import { CoverageLegend } from "@/features/coverage/CoverageLegend";
import {
  CoverageGlyphSprite,
  CoverageTable,
} from "@/features/coverage/CoverageTable";
import { getCoverageColumns } from "@/features/coverage/coverageModel";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;

/**
 * Unlisted by design. The page is reachable at its address but carries
 * `noIndex`, is absent from `STATIC_PUBLIC_PATHS` so it never enters the
 * sitemap, and nothing links to it — including the About page it sits under.
 */
export async function generateMetadata() {
  const copy = await getCopyByKeys([flavoredCopyKey("seo-about-coverage-description")]);

  return buildPublicPageMetadata({
    title: "Coverage",
    description: flavoredCopyText(
      copy,
      "seo-about-coverage-description",
      `Per-section content and citation coverage across every ${SITE_FLAVOR_CONFIG.name} substance article.`,
    ),
    pathname: "/about/coverage",
    noIndex: true,
  });
}

export default async function CoveragePage() {
  const rows = (await getPublicCoverageSubstances())
    .filter((row) => Boolean(row.slug))
    .sort((left, right) => left.name.localeCompare(right.name));
  const columns = getCoverageColumns();

  return (
    <PublicContentShell width="wide">
      <PageHeader
        title="Coverage"
        icon="ph:grid-four"
        description="Which article sections are written, and which carry citations."
      />

      <CoverageGlyphSprite />

      <div className="space-y-8">
        <CoverageTable columns={columns} rows={rows} />

        <Surface variant="subtle" padding="lg" radius="xl">
          <CoverageLegend />
          <p className="theme-text-faint mt-6 border-t border-dose-divider pt-4 text-xs">
            Content status comes from the same section-presence rules the article
            page and its table of contents use, so this table cannot disagree
            with what a reader sees. Citation status counts inline{" "}
            <code className="font-mono">[cite:…]</code> markers and structured
            reference ids within each section&rsquo;s own fields. Dosage counts
            as written only when a route carries dose numbers, duration numbers,
            bioavailability, half-life, or notes — a route object full of nulls
            is generator scaffolding, and the ROA column reports how many of an
            article&rsquo;s routes are that on at least one side. The stub column
            is the same verdict the article page banners, so it weighs the seven
            always-rendered sections rather than the eight columns here. Reagent
            testing is omitted because its presence partly depends on a
            client-side external lookup; the bibliography is omitted as a column
            because it is the citation axis rather than a section within it.
            The review column is the public-safe completion flag derived from
            the editor-only review status — it says a manual review finished,
            nothing more.
          </p>
        </Surface>
      </div>
    </PublicContentShell>
  );
}
