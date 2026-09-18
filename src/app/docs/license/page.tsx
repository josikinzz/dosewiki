import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentCard, Surface } from "@/components/ui/surface";
import { DocsInline } from "../_components/DocsProse";
import subjectiveEffectsProvenance from "@data/effects/subjectiveEffectsProvenance.json";

import { t } from "@/i18n/server";

const DOCS_LICENSE_COPY_KEYS = [
  "seo-docs-license-description",
  ...getCopyKeysByPrefix("docs-license-"),
];

export async function generateMetadata() {
  const copy = await getCopyByKeys(DOCS_LICENSE_COPY_KEYS);

  return buildPublicPageMetadata({
    title: t("Licensing and reuse"),
    description:
      copy.text("seo-docs-license-description") ||
      t("Reuse terms for dose.wiki content, dataset, molecule SVG pack, replication media, source code, trip reports, interaction ratings, and reagent-test data."),
    pathname: "/docs/license",
  });
}

const TOC_ITEMS = [
  { id: "s1", labelKey: "docs-license-toc-quick-answer", icon: "lucide:check-circle-2" },
  { id: "s2", labelKey: "docs-license-toc-reuse-matrix", icon: "lucide:table-2" },
  { id: "s3", labelKey: "docs-license-toc-cc0-scope", icon: "lucide:file-text" },
  { id: "s4", labelKey: "docs-license-toc-exceptions", icon: "lucide:triangle-alert" },
  { id: "s5", labelKey: "docs-license-toc-provenance", icon: "lucide:brain" },
  { id: "s6", labelKey: "docs-license-toc-source-code", icon: "lucide:code-2" },
  { id: "s7", labelKey: "docs-license-toc-attribution", icon: "lucide:quote" },
  { id: "s8", labelKey: "docs-license-toc-full-terms", icon: "lucide:book-open" },
] as const;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-3 text-sm font-semibold tabular-nums";
const SECTION_CLASS = "scroll-mt-24";
const MAJOR_SECTION_CLASS = "scroll-mt-24 pt-5";
const SECTION_HEADING_CLASS =
  "theme-accent-heading font-display text-[1.65rem] font-semibold tracking-tight";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]";
const CARD_TITLE_CLASS = "theme-accent-heading mb-1.5 text-base font-semibold";
const LIST_CLASS =
  "theme-text-secondary space-y-2 leading-7 marker:text-dose-accent-muted";
const PANEL_PROSE_CLASS = "theme-text-secondary leading-7";
// Right-edge fade hints at off-screen columns. It lives on the non-scrolling
// wrapper (not the scroll container) so the gradient stays pinned to the
// visible edge instead of scrolling away, and fades the card surface to
// transparent so the affordance tracks the theme in both modes.
const TABLE_WRAP_CLASS =
  "relative overflow-hidden border-dose-card-border shadow-[var(--theme-elevation-xl)] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-30 after:w-10 after:bg-gradient-to-l after:from-dose-surface after:to-transparent";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TABLE_CLASS =
  "w-full border-collapse text-left text-sm [&_tbody_td:first-child]:font-medium [&_tbody_td:first-child]:text-dose-text [&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3.5";
const TABLE_HEAD_ROW_CLASS =
  "border-b border-dose-divider bg-dose-surface-muted/55";
const TABLE_BODY_CLASS =
  "theme-text-secondary divide-y divide-dose-divider [&>tr:nth-child(even)]:bg-dose-surface-muted/35";
// Pin the row-label column so the "Material"/"You want to" label stays in view
// while the wider columns scroll. Opaque tokens keep scrolled content from
// bleeding through the pinned cells.
const TABLE_STICKY_HEAD_CLASS = "sticky left-0 z-20 bg-dose-surface-muted";
const TABLE_STICKY_CELL_CLASS = "sticky left-0 z-10 bg-dose-surface";
const PRE_CLASS =
  "theme-text-secondary overflow-x-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap";
// Matrix status chips are tone-driven via the shared StatusBadge primitive
// (style guide §7): the `tone` prop owns color, and className carries only the
// layout deltas the matrix needs (single-line, tabular-friendly sizing).
const MATRIX_BADGE_CLASS = "whitespace-nowrap text-[11px]";
const ROW_GROUP_CLASS = "mt-6 overflow-hidden";
const ROW_ITEM_CLASS =
  "grid gap-3 border-b border-dose-divider px-5 py-5 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6";
const TIMELINE_ITEM_CLASS =
  "grid gap-3 border-b border-dose-divider px-5 py-4 last:border-b-0 sm:grid-cols-[9rem_7rem_minmax(0,1fr)] sm:gap-5";
const TIMELINE_YEAR_LABEL_CLASS =
  "theme-text-faint text-[10px] font-semibold uppercase tracking-[0.16em]";
const TIMELINE_YEAR_CLASS =
  "theme-text-secondary text-sm font-semibold tabular-nums sm:mt-1";
const SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL = subjectiveEffectsProvenance.inBoundaryTotal;
const SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENT_STYLES = {
  "2015-or-earlier": {
    barClassName: "bg-dose-evidence",
    textClassName: "text-dose-evidence-strong",
  },
  "jan-jul-2016": {
    barClassName: "bg-dose-accent",
    textClassName: "text-dose-accent-strong",
  },
  "august-2016": {
    barClassName: "bg-dose-warning-strong",
    textClassName: "text-dose-warning-strong",
  },
} as const;
const SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENTS = subjectiveEffectsProvenance.summary.segments.map(
  (segment) => ({
    ...segment,
    width: segment.percent,
    ...SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENT_STYLES[
      segment.key as keyof typeof SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENT_STYLES
    ],
  }),
);

export default async function DocsLicensePage() {
  const copy = await getCopyByKeys(DOCS_LICENSE_COPY_KEYS);
  const tocItems = TOC_ITEMS.map((item) => ({
    id: item.id,
    label: copy.text(item.labelKey),
    icon: item.icon,
  }));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell min-h-screen focus:outline-none"
    >
      <StickyTocLayout
        toc={<PublicTableOfContents items={tocItems} variant="bare" />}
        maxWidthClass="max-w-4xl"
        className="theme-toc-strip-scope"
        contentClassName="gap-10"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={tocItems} />

        <header className="flex max-w-[72ch] flex-col gap-4 border-b border-dose-divider pb-8">
          <p className="theme-text-faint text-xs font-semibold uppercase tracking-[0.18em]">
            {copy.text("docs-license-header-updated")}
          </p>
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {copy.text("docs-license-header-title")}
          </h1>
          <p className="theme-text-muted text-base">
            <DocsInline>{copy.text("docs-license-header-tagline")}</DocsInline>
          </p>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            <DocsInline>{copy.text("docs-license-header-intro")}</DocsInline>
          </p>
          <p className={PROSE_CLASS}>
            <DocsInline>{copy.text("docs-license-header-terms-note")}</DocsInline>
          </p>
        </header>

        <section id="s1" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>1.</span>{" "}
            {copy.text("docs-license-s1-heading")}
          </h2>

          <Alert variant="success" role="note" className="mt-5">
            <AlertDescription>
              <DocsInline>{copy.text("docs-license-s1-cc0-alert")}</DocsInline>
            </AlertDescription>
          </Alert>

          <ContentCard className="mt-6" padding="md">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <div className={`${CARD_LABEL_CLASS} text-dose-evidence-strong`}>
                  {copy.text("docs-license-s1-freely-label")}
                </div>
                <ul className={`${LIST_CLASS} list-disc pl-5`}>
                  {copy.items("docs-license-s1-freely-items").map((item, index) => (
                    <li key={index}>
                      <DocsInline>{item}</DocsInline>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-dose-divider pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                <div className={`${CARD_LABEL_CLASS} text-dose-warning-strong`}>
                  {copy.text("docs-license-s1-check-label")}
                </div>
                <ul className={`${LIST_CLASS} list-disc pl-5`}>
                  {copy.items("docs-license-s1-check-items").map((item, index) => (
                    <li key={index}>
                      <DocsInline>{item}</DocsInline>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <DocsInline>{copy.text("docs-license-s1-disclaimer")}</DocsInline>
          </p>
        </section>

        <section id="s2" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>2.</span>{" "}
            {copy.text("docs-license-s2-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s2-intro")}</DocsInline>
          </p>

          <Surface
            variant="public"
            padding="none"
            radius="compactState"
            className={`${TABLE_WRAP_CLASS} mt-5`}
          >
            <div className={TABLE_SCROLL_CLASS}>
              <table className={`${TABLE_CLASS} min-w-[60rem]`}>
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th
                      className={`${TABLE_STICKY_HEAD_CLASS} theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]`}
                    >
                      {copy.text("docs-license-s2-col-material")}
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      {copy.text("docs-license-s2-col-terms")}
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      {copy.text("docs-license-s2-col-attribution")}
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      {copy.text("docs-license-s2-col-commercial")}
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      {copy.text("docs-license-s2-col-notes")}
                    </th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-articles-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        CC0&nbsp;1.0
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Not required
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-articles-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      <DocsInline>{copy.text("docs-license-s2-dataset-material")}</DocsInline>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Mixed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Interactions only
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Except interactions
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-dataset-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-molecules-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        CC0&nbsp;1.0
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Not required
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-molecules-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-replication-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Creator retained
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Always credit
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Ask creator
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-replication-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-code-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        MIT
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Keep notice
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-code-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-legacy-reports-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Author retained
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Per report
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Ask author
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-legacy-reports-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-new-reports-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        CC0&nbsp;1.0
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Not required
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-new-reports-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-interactions-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        TripSit terms
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Required
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Restricted
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-interactions-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-reagent-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        ProtestKit terms
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Consult source
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Consult source
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-reagent-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-fonts-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        OFL&nbsp;1.1
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Keep notice
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-fonts-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-openchemlib-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        BSD&nbsp;3-Clause
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Keep notice
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="green" className={MATRIX_BADGE_CLASS}>
                        Allowed
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-openchemlib-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-pw-captures-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        CC&nbsp;BY-SA&nbsp;4.0
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Required
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Share-alike
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-pw-captures-notes")}</DocsInline>
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      {copy.text("docs-license-s2-avatars-material")}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="gray" className={MATRIX_BADGE_CLASS}>
                        Artist retained
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Always credit
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <StatusBadge tone="orange" className={MATRIX_BADGE_CLASS}>
                        Ask artist
                      </StatusBadge>
                    </td>
                    <td className="p-3">
                      <DocsInline>{copy.text("docs-license-s2-avatars-notes")}</DocsInline>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>
        </section>

        <section id="s3" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>3.</span>{" "}
            {copy.text("docs-license-s3-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s3-intro")}</DocsInline>
          </p>
          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s3-dedication")}</DocsInline>
          </p>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s3-covered-label")}</div>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              {copy.items("docs-license-s3-covered-items").map((item, index) => (
                <li key={index}>
                  <DocsInline>{item}</DocsInline>
                </li>
              ))}
            </ul>
          </ContentCard>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s3-you-can-label")}</div>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              {copy.items("docs-license-s3-you-can-items").map((item, index) => (
                <li key={index}>
                  <DocsInline>{item}</DocsInline>
                </li>
              ))}
            </ul>

            <div
              role="presentation"
              className="theme-horizontal-divider my-5"
            />

            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s3-not-covered-label")}</div>
            <p className={PANEL_PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s3-not-covered-body")}</DocsInline>
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <DocsInline>{copy.text("docs-license-s3-attribution")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            <DocsInline>{copy.text("docs-license-s3-trademark")}</DocsInline>
          </p>
        </section>

        <section id="s4" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>4.</span>{" "}
            {copy.text("docs-license-s4-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s4-intro")}</DocsInline>
          </p>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className={ROW_GROUP_CLASS}
          >
            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s4-legacy-label")}</div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  {copy.text("docs-license-s4-legacy-title")}
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-license-s4-legacy-body")}</DocsInline>
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-license-s4-new-reports-label")}
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  {copy.text("docs-license-s4-new-reports-title")}
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-license-s4-new-reports-body")}</DocsInline>
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s4-replication-label")}</div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  {copy.text("docs-license-s4-replication-title")}
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-license-s4-replication-body")}</DocsInline>
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s4-interactions-label")}</div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-license-s4-interactions-body")}</DocsInline>
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s4-reagent-label")}</div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-license-s4-reagent-body")}</DocsInline>
                </p>
              </div>
            </div>
          </Surface>

          <Alert variant="warning" role="note" className="mt-5">
            <AlertDescription>
              <DocsInline>{copy.text("docs-license-s4-datasets-alert")}</DocsInline>
            </AlertDescription>
          </Alert>
        </section>

        <section id="s5" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>5.</span>{" "}
            {copy.text("docs-license-s5-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s5-intro")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s5-index-authorship")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s5-restored-sections")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s5-synthesized-sections")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s5-boundary-note")}</DocsInline>
          </p>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className="mt-5 overflow-hidden"
          >
            <div className="px-5 py-5 sm:px-6">
              <p className={CARD_LABEL_CLASS}>{copy.text("docs-license-s5-badges-label")}</p>
              <p className="theme-accent-heading text-base font-semibold">
                All {SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} of{" "}
                {SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} are August 2016 or earlier{" "}
                <span className="theme-text-faint font-normal">
                  (inside the boundary).
                </span>
              </p>

              <div
                className="mt-4 h-4 overflow-hidden rounded-full border border-dose-card-border bg-dose-surface-muted shadow-[var(--theme-elevation-inner)]"
                role="img"
                aria-label={`${SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} of ${SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} recovered subjective-effect date badges are August 2016 or earlier. ${SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENTS.map((segment) => `${segment.count} are from ${segment.label}`).join(", ")}.`}
              >
                <div className="flex h-full">
                  {SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENTS.map((segment) => (
                    <div
                      key={segment.label}
                      className={`${segment.barClassName} h-full`}
                      style={{ width: segment.width }}
                      title={`${segment.label}: ${segment.count} of ${SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} (${segment.percent})`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {SUBJECTIVE_EFFECT_ATTRIBUTION_SEGMENTS.map((segment) => (
                  <div
                    key={segment.label}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5"
                  >
                    <span
                      className={`${segment.barClassName} mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-dose-card-border/70`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="theme-text-secondary text-sm font-semibold">
                        {segment.label}{" "}
                        <span
                          className={`${segment.textClassName} font-semibold tabular-nums`}
                        >
                          {segment.count}/{SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} (
                          {segment.percent})
                        </span>
                      </p>
                      <p className="theme-text-faint text-xs leading-5">
                        {segment.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="theme-text-faint mt-4 text-xs leading-5">
                The site generates these counts from the live dataset. They
                will shift as dose.wiki recovers more sections. Every capture
                behind these numbers is listed with its Archive.org link in
                the{" "}
                <a
                  className={proseLinkClassName}
                  href="/subjective-effects-provenance.json"
                >
                  provenance manifest (JSON)
                </a>
                .
              </p>
            </div>
          </Surface>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className={ROW_GROUP_CLASS}
          >
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-origin-label")}</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-origin-year-label")}</div>
                <div className={TIMELINE_YEAR_CLASS}>2011</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>{copy.text("docs-license-s5-timeline-origin-title")}</p>
                <p className="theme-text-muted text-sm leading-6">
                  <DocsInline>{copy.text("docs-license-s5-timeline-origin-desc")}</DocsInline>
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-expanded-label")}</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-expanded-year-label")}</div>
                <div className={TIMELINE_YEAR_CLASS}>2013</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>{copy.text("docs-license-s5-timeline-expanded-title")}</p>
                <p className="theme-text-muted text-sm leading-6">
                  <DocsInline>{copy.text("docs-license-s5-timeline-expanded-desc")}</DocsInline>
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-formalized-label")}</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-formalized-year-label")}</div>
                <div className={TIMELINE_YEAR_CLASS}>2017</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>{copy.text("docs-license-s5-timeline-formalized-title")}</p>
                <p className="theme-text-muted text-sm leading-6">
                  <DocsInline>{copy.text("docs-license-s5-timeline-formalized-desc")}</DocsInline>
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-current-label")}</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>{copy.text("docs-license-s5-timeline-current-year-label")}</div>
                <div className={TIMELINE_YEAR_CLASS}>2026</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>{copy.text("docs-license-s5-timeline-current-title")}</p>
                <p className="theme-text-muted text-sm leading-6">
                  <DocsInline>{copy.text("docs-license-s5-timeline-current-desc")}</DocsInline>
                </p>
              </div>
            </div>
          </Surface>

          <Alert variant="default" role="note" className="mt-5">
            <AlertDescription>
              <DocsInline>{copy.text("docs-license-s5-scope-alert")}</DocsInline>
            </AlertDescription>
          </Alert>
        </section>

        <section id="s6" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>6.</span>{" "}
            {copy.text("docs-license-s6-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s6-intro")}</DocsInline>
          </p>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s6-condition-label")}</div>
            <p className={PANEL_PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s6-condition-body")}</DocsInline>
            </p>

            <div
              role="presentation"
              className="theme-horizontal-divider my-5"
            />

            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s6-boundary-label")}</div>
            <p className={PANEL_PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s6-boundary-body")}</DocsInline>
            </p>
            <p className={`${PANEL_PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-license-s6-third-party-body")}</DocsInline>
            </p>
          </ContentCard>
        </section>

        <section id="s7" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>7.</span>{" "}
            {copy.text("docs-license-s7-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s7-intro")}</DocsInline>
          </p>

          <div className="mt-5 grid gap-x-4 gap-y-5 md:grid-cols-2">
            <div>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-license-s7-dataset-label")}
              </div>
              <pre className={PRE_CLASS}>
                {`Includes material from dose.wiki (https://dose.wiki),
released under CC0 1.0.`}
              </pre>
            </div>
            <div>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-license-s7-interactions-label")}
              </div>
              <pre className={PRE_CLASS}>
                {`Includes CC0 material from dose.wiki.
Interaction ratings from TripSit (combo.tripsit.me).
See TripSit's terms before commercial reuse.`}
              </pre>
            </div>
            <div>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-license-s7-replication-label")}
              </div>
              <pre className={PRE_CLASS}>
                {`Replication media by [creator].
Rights remain with the creator or rightsholder unless the item states another license.`}
              </pre>
            </div>
          </div>

        </section>

        <section id="s8" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>8.</span>{" "}
            {copy.text("docs-license-s8-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-license-s8-intro")}</DocsInline>
          </p>

          <DisclosureCard
            summary={copy.text("docs-license-s8-cc0-summary")}
            className="mt-5"
          >
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s8-cc0-body")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-license-s8-cc0-links")}</DocsInline>
            </p>
          </DisclosureCard>

          <DisclosureCard summary={copy.text("docs-license-s8-mit-summary")} className="mt-3">
            <p className={`${CARD_LABEL_CLASS} mb-3`}>
              {t("Original canonical legal text (English)")}
            </p>
            <pre lang="en" className={PRE_CLASS}>{`MIT License

Copyright (c) 2026 Josie Kins / dose.wiki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}</pre>
          </DisclosureCard>

          {/* Open by default and directly addressable: the replication
              surfaces link here as their credit-correction and removal route. */}
          <DisclosureCard
            id="replication-media-terms"
            defaultOpen
            summary={copy.text("docs-license-s8-replication-summary")}
            className="mt-3 scroll-mt-24"
          >
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s8-replication-purpose")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-license-s8-replication-policy")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-license-s8-replication-provenance")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-license-s8-replication-corrections")}</DocsInline>
            </p>
          </DisclosureCard>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>{copy.text("docs-license-s8-contact-label")}</div>
            <p className={PANEL_PROSE_CLASS}>
              <DocsInline>{copy.text("docs-license-s8-contact-body")}</DocsInline>
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-license-s8-crosslinks")}</DocsInline>
          </p>
        </section>
      </StickyTocLayout>
    </main>
  );
}
