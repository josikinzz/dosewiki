import { buildPublicPageMetadata } from "@server/next/publicSite";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentCard, Surface } from "@/components/ui/surface";
import subjectiveEffectsProvenance from "@/data/generated/subjectiveEffectsProvenance.json";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "Licensing and reuse",
    description:
      "Reuse terms for dose.wiki content, dataset, molecule SVG pack, replication media, source code, trip reports, interaction ratings, and reagent-test data.",
    pathname: "/docs/license",
  });
}

const TOC_ITEMS = [
  { id: "s1", label: "1. Quick answer", icon: "lucide:check-circle-2" },
  { id: "s2", label: "2. Reuse matrix", icon: "lucide:table-2" },
  { id: "s3", label: "3. CC0 scope", icon: "lucide:file-text" },
  { id: "s4", label: "4. Important exceptions", icon: "lucide:triangle-alert" },
  { id: "s5", label: "5. Subjective effects provenance", icon: "lucide:brain" },
  { id: "s6", label: "6. Source code", icon: "lucide:code-2" },
  { id: "s7", label: "7. Attribution examples", icon: "lucide:quote" },
  { id: "s8", label: "8. Full terms", icon: "lucide:book-open" },
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

export default function DocsLicensePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell min-h-screen focus:outline-none"
    >
      <StickyTocLayout
        toc={<PublicTableOfContents items={[...TOC_ITEMS]} variant="bare" />}
        maxWidthClass="max-w-4xl"
        className="theme-toc-strip-scope"
        contentClassName="gap-10"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={[...TOC_ITEMS]} />

        <header className="flex max-w-[72ch] flex-col gap-4 border-b border-dose-divider pb-8">
          <p className="theme-text-faint text-xs font-semibold uppercase tracking-[0.18em]">
            Last updated August 15, 2026
          </p>
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Licensing and reuse
          </h1>
          <p className="theme-text-muted text-base">
            What you can reuse, what needs attribution, and what dose.wiki does
            not license.
          </p>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            Most dose.wiki-authored material is released under{" "}
            <strong>CC0&nbsp;1.0 Universal</strong>. You can copy, modify,
            redistribute, and use that material commercially without asking
            permission or giving attribution.
          </p>
          <p className={PROSE_CLASS}>
            The source code and several kinds of contributor and third-party
            material keep their own terms. The reuse matrix in section 2 is the
            authoritative inventory. Before you republish anything, check the
            matrix.
          </p>
        </header>

        <section id="s1" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>1.</span> Quick answer
          </h2>

          <Alert variant="success" role="note" className="mt-5">
            <AlertDescription>
              dose.wiki&apos;s own article text, structured dataset, schema, and
              generated molecule assets are CC0 unless a page or data field says
              otherwise.
            </AlertDescription>
          </Alert>

          <ContentCard className="mt-6" padding="md">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <div className={`${CARD_LABEL_CLASS} text-dose-evidence-strong`}>
                  Freely reusable
                </div>
                <ul className={`${LIST_CLASS} list-disc pl-5`}>
                  <li>
                    dose.wiki-authored article prose and structured fields.
                  </li>
                  <li>
                    The downloadable <code>SubstanceIndex.json</code> snapshot
                    and schema, apart from its <code>interactions</code> field.
                  </li>
                  <li>
                    Molecule SVGs generated from SMILES, plus their manifest.
                  </li>
                  <li>Trip reports submitted through the current report form.</li>
                </ul>
              </div>
              <div className="border-t border-dose-divider pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                <div className={`${CARD_LABEL_CLASS} text-dose-warning-strong`}>
                  Check before reuse
                </div>
                <ul className={`${LIST_CLASS} list-disc pl-5`}>
                  <li>
                    Legacy trip reports, where rights remain with the author.
                  </li>
                  <li>
                    Subjective-effect replication images, videos, and audio.
                  </li>
                  <li>TripSit interaction ratings and combination guidance.</li>
                  <li>Reagent-test data fetched from protestkit.eu.</li>
                  <li>
                    External sources cited by articles, trademarks, and
                    third-party names.
                  </li>
                </ul>
              </div>
            </div>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <strong>Not legal advice.</strong> This page describes
            dose.wiki&apos;s licensing intent and the reuse terms we apply to
            our own material. If your use is sensitive, commercial, or
            jurisdiction-specific, check the relevant terms yourself.
          </p>
        </section>

        <section id="s2" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>2.</span> Reuse matrix
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            This table separates material dose.wiki can license from material
            that belongs to contributors or third-party projects.
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
                      Material
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      Terms
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      Attribution
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      Commercial use
                    </th>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      dose.wiki-authored article content
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
                      CC0 covers dose.wiki&apos;s own copyrightable
                      contributions to summaries, pharmacology, tolerance, harm
                      potential, history, legality, dosage, duration, and
                      related article fields.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Structured dataset <code>SubstanceIndex.json</code>
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
                      CC0 covers the downloadable snapshot, the dose.wiki schema,
                      and the normalization work. Every article document also
                      carries an <code>interactions</code> object built from
                      TripSit combination guidance, which keeps TripSit&apos;s
                      terms (section 4). Strip or separately license that field
                      before commercial reuse. CC0 grants no rights to external
                      sources cited by articles.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Molecule SVG pack and manifest
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
                      Structure SVGs generated by dose.wiki from SMILES with
                      RDKit, plus the molecule metadata manifest.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Subjective-effect replication media
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
                      Images, videos, and audio that recreate subjective effects
                      remain owned by their original creators or rightsholders.
                      No open license covers them and none is CC0; reuse is the
                      artist&apos;s call unless an individual item states its own
                      license. dose.wiki displays and credits them; it does not
                      relicense them.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Website source code
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
                      MIT covers the application code and tooling only
                      (section 6).
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Legacy trip reports
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
                      Reports already on the site are contributor-authored
                      personal accounts. Reuse outside ordinary linking or
                      quotation depends on the report&apos;s marker or the
                      author&apos;s permission.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      New report-form submissions
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
                      CC0 applies when the submitter accepts the report
                      form&apos;s CC0 terms before they send the report.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Interaction ratings
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
                      Combination data comes from TripSit. Reuse follows
                      TripSit&apos;s own terms (section 4).
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className={`${TABLE_STICKY_CELL_CLASS} p-3`}>
                      Reagent-test data
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
                      dose.wiki fetches reagent results from protestkit.eu when
                      you view an article. The downloadable dataset does not
                      contain them.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>
        </section>

        <section id="s3" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>3.</span> CC0 scope
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The CC0 release covers dose.wiki&apos;s own copyrightable
            contributions. The rest of this page calls these the{" "}
            <strong>covered material</strong>.
          </p>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>Covered material</div>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>Original article prose.</li>
              <li>The dataset compilation and the schema design.</li>
              <li>Normalization work.</li>
              <li>Generated molecule assets.</li>
              <li>
                Report-form submissions whose contributors accepted CC0 terms.
              </li>
            </ul>
          </ContentCard>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>You can</div>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>Copy and redistribute the covered material in any format.</li>
              <li>
                Modify, translate, extract, remix, or combine it with other
                work.
              </li>
              <li>Use it in commercial projects.</li>
              <li>
                Skip attribution, permission requests, and share-alike
                obligations.
              </li>
            </ul>

            <div
              role="presentation"
              className="theme-horizontal-divider my-5"
            />

            <div className={CARD_LABEL_CLASS}>This does not cover</div>
            <p className={PANEL_PROSE_CLASS}>
              The carve-outs detailed in section 4, external sources cited or
              linked from articles, and third-party names, trademarks, logos,
              and site identities.
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <strong>Attribution is appreciated, not required.</strong> A link to
            dose.wiki helps other people find the source dataset, but CC0 does
            not require credit.
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            <strong>CC0 waives copyright, not trademark.</strong> Forks can use
            the covered material and the source code freely, including
            commercially. A fork must not use the &quot;dose.wiki&quot; name or
            logo to present itself as the official site or to claim
            endorsement.
          </p>
        </section>

        <section id="s4" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>4.</span> Important exceptions
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Five <strong>carve-outs</strong> do not inherit the blanket CC0
            release. This section is the authoritative statement of their terms.
          </p>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className={ROW_GROUP_CLASS}
          >
            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Legacy trip reports</div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  Rights remain with the author unless marked otherwise.
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  Trip reports are contributor-authored personal accounts.
                  dose.wiki publishes legacy reports with permission, but they
                  are not part of the covered material. Link to them freely. If
                  the report&apos;s license marker permits it, or if the author
                  agrees, you can republish or commercially use a report.
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                New report-form submissions
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  CC0 applies when the submitter accepted the form terms.
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  The submitter dedicates the report to the public domain
                  before the form sends it. A CC0 dedication cannot be revoked
                  after a report is public. dose.wiki honors good-faith
                  requests to correct attribution, to update identifying
                  details, or to remove a report from dose.wiki. dose.wiki
                  cannot retract copies that other sites already made.
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Subjective-effect replication media</div>
              <div>
                <p className={CARD_TITLE_CLASS}>
                  Rights stay with the creator or rightsholder.
                </p>
                <p className={PANEL_PROSE_CLASS}>
                  No subjective-effect replication image, video, or audio file is
                  open-licensed, and none of it is CC0. Reuse is entirely the
                  creator&apos;s or rightsholder&apos;s call, item by item.
                  dose.wiki credits them when known, and many items have no
                  recorded rightsholder at all — treat those as unknown rather
                  than free. The full terms, provenance notes, and the
                  credit-correction route are in{" "}
                  <a
                    className={proseLinkClassName}
                    href="#replication-media-terms"
                  >
                    section 8
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Interaction ratings</div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  The combination ratings shown on dose.wiki come from{" "}
                  <a
                    className={proseLinkClassName}
                    href="https://wiki.tripsit.me/wiki/Drug_combinations"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    TripSit&apos;s drug-combination guidance
                  </a>
                  . dose.wiki does not place that data under CC0. Reuse must
                  follow TripSit&apos;s terms: non-commercial use, attribution,
                  a link back to TripSit or{" "}
                  <a
                    className={proseLinkClassName}
                    href="https://combo.tripsit.me"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    combo.tripsit.me
                  </a>
                  , and a note that the information is only a quick reference.
                  Commercial use needs TripSit permission.
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Reagent-test data</div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  Reagent color reactions are fetched from{" "}
                  <a
                    className={proseLinkClassName}
                    href="https://protestkit.eu"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    protestkit.eu
                  </a>{" "}
                  when an article is viewed. They are not included in the
                  downloadable dataset, and dose.wiki does not grant reuse
                  rights for them. Consult ProtestKit directly before
                  republishing reagent-test data.
                </p>
              </div>
            </div>
          </Surface>

          <Alert variant="warning" role="note" className="mt-5">
            <AlertDescription>
              The downloadable datasets are not uniformly CC0:{" "}
              <code>SubstanceIndex.json</code> carries the TripSit{" "}
              <code>interactions</code> field, and <code>EffectIndex.json</code>{" "}
              carries the replication media it references — the{" "}
              <code>audio_replications</code> entries plus the{" "}
              <code>gallery_order</code> and <code>social_media_image</code>{" "}
              image references — credited to their creators. If you scrape full
              pages instead, also check your capture for reagent data,
              replication media, and legacy reports.
              None of those inherit CC0 terms.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s5" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>5.</span> Subjective effects
            provenance
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Subjective-effects material has a longer and more distributed
            publication history than the rest of the dataset, and it reaches
            dose.wiki by several separate paths. This section covers text and
            index material. Replication media stays creator-retained, as
            section 4 states.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            The Subjective Effect Index is a work authored by{" "}
            <a
              className={proseLinkClassName}
              href="https://en.wikipedia.org/wiki/Josie_Kins"
              target="_blank"
              rel="noopener noreferrer"
            >
              Josie Kins
            </a>
            {"."} She created it on her blog Disregard Everything I Say in 2011,
            before PsychonautWiki existed, and continued to develop it
            independently afterwards, including through Effect Index. dose.wiki
            includes this index material in its CC0 release to the extent it
            reflects Josie Kins / dose.wiki authorship.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            dose.wiki handles substance-article &quot;Subjective effects&quot;
            sections separately, and they are currently a mixture of two paths.
            Where an earlier Josie Kins version exists, dose.wiki restores it,
            working only from Internet Archive captures dated on or before
            August&nbsp;31, 2016, and including only material it has a
            good-faith basis to treat as her own authorship. It excludes
            contributions made after that boundary, and edits by others that it
            does not have the right to dedicate. The date is a rights boundary,
            not a measure of how current the information is. dose.wiki reviews
            and updates substance content independently of the boundary.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            Where no such section exists, dose.wiki synthesizes one from source
            material gathered across the internet, the same way it writes the
            other article sections. Those runs exclude every project Josie Kins
            was involved in — Disregard Everything I Say, PsychonautWiki, and
            Effect Index — to avoid a conflict of interest. Synthesized sections
            are dose.wiki&apos;s own authorship and fall under the covered
            material. dose.wiki intends to replace these sections entirely with
            Mindstate Design Labs data.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            Most of the recovered sections on substance pages are dated well
            before the boundary, not clustered against it.
          </p>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className="mt-5 overflow-hidden"
          >
            <div className="px-5 py-5 sm:px-6">
              <p className={CARD_LABEL_CLASS}>Recovered date badges</p>
              <p className="theme-accent-heading text-base font-semibold">
                All {SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} of{" "}
                {SUBJECTIVE_EFFECT_ATTRIBUTION_TOTAL} are August 2016 or earlier{" "}
                <span className="theme-text-faint font-normal">
                  &mdash; inside the boundary.
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
              <div className={CARD_LABEL_CLASS}>Origin</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>Founded</div>
                <div className={TIMELINE_YEAR_CLASS}>2011</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>Disregard Everything I Say</p>
                <p className="theme-text-muted text-sm leading-6">
                  Where the Subjective Effect Index began.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Expanded</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>Launched</div>
                <div className={TIMELINE_YEAR_CLASS}>2013</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>PsychonautWiki</p>
                <p className="theme-text-muted text-sm leading-6">
                  Structured collaborative reference.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Formalized</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>Launched</div>
                <div className={TIMELINE_YEAR_CLASS}>2017</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>Effect Index</p>
                <p className="theme-text-muted text-sm leading-6">
                  Dedicated subjective-effect index.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Current</div>
              <div className="flex items-baseline gap-2 sm:block">
                <div className={TIMELINE_YEAR_LABEL_CLASS}>Maintained since</div>
                <div className={TIMELINE_YEAR_CLASS}>2026</div>
              </div>
              <div>
                <p className={CARD_TITLE_CLASS}>dose.wiki</p>
                <p className="theme-text-muted text-sm leading-6">
                  Current maintained corpus.
                </p>
              </div>
            </div>
          </Surface>

          <Alert variant="default" role="note" className="mt-5">
            <AlertDescription>
              This provenance note is about licensing scope, not authorship
              credit requirements. Subjective-effect text and index material
              inside the boundary follows the same CC0 terms as the rest of the
              covered material.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s6" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>6.</span> Source code
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The website source code and tooling are released under the{" "}
            <strong>MIT License</strong>. MIT lets you use, copy, modify,
            distribute, sublicense, or sell copies of the software, including in
            commercial and closed-source projects.
          </p>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>Condition</div>
            <p className={PANEL_PROSE_CLASS}>
              Keep the MIT copyright and permission notice in copies or
              substantial portions of the code.
            </p>

            <div
              role="presentation"
              className="theme-horizontal-divider my-5"
            />

            <div className={CARD_LABEL_CLASS}>Boundary</div>
            <p className={PANEL_PROSE_CLASS}>
              MIT applies to the software only. The covered material is CC0
              (section 3), and the carve-outs keep the terms in section 4.
            </p>
          </ContentCard>
        </section>

        <section id="s7" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>7.</span> Attribution examples
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            If you choose to credit dose.wiki, or need to keep third-party data
            and media labels clear, these examples are ready to copy.
          </p>

          <div className="mt-5 grid gap-x-4 gap-y-5 md:grid-cols-2">
            <div>
              <div className={CARD_LABEL_CLASS}>
                Dataset or article text only
              </div>
              <pre className={PRE_CLASS}>
                {`Includes material from dose.wiki (https://dose.wiki),
released under CC0 1.0.`}
              </pre>
            </div>
            <div>
              <div className={CARD_LABEL_CLASS}>
                If you also display interactions
              </div>
              <pre className={PRE_CLASS}>
                {`Includes CC0 material from dose.wiki.
Interaction ratings from TripSit (combo.tripsit.me).
See TripSit's terms before commercial reuse.`}
              </pre>
            </div>
            <div>
              <div className={CARD_LABEL_CLASS}>
                If you display replication media
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
            <span className={SECTION_NUM_CLASS}>8.</span> Full terms
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Canonical license texts, the replication-media terms, and the
            rights contact. The carve-out terms themselves live in section 4.
          </p>

          <DisclosureCard
            summary="CC0 1.0 Universal - the covered material"
            className="mt-5"
          >
            <p className={PROSE_CLASS}>
              CC0 places a work as completely as possible into the public
              domain. The person who associates a work with CC0 waives
              copyright and related rights worldwide to the extent allowed by
              law. You can copy, modify, distribute, and commercially use the
              covered material without permission or attribution. It comes
              without warranties.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              Summary and legal code:{" "}
              <a
                className={proseLinkClassName}
                href="https://creativecommons.org/publicdomain/zero/1.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                creativecommons.org/publicdomain/zero/1.0
              </a>{" "}
              (
              <a
                className={proseLinkClassName}
                href="https://creativecommons.org/publicdomain/zero/1.0/legalcode"
                target="_blank"
                rel="noopener noreferrer"
              >
                legal code
              </a>
              ).
            </p>
          </DisclosureCard>

          <DisclosureCard summary="MIT License - source code" className="mt-3">
            <pre className={PRE_CLASS}>{`MIT License

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
            summary="Replication media - creator and rightsholder terms"
            className="mt-3 scroll-mt-24"
          >
            <p className={PROSE_CLASS}>
              Subjective-effect replication images, videos, and audio remain
              owned by the original creator or rightsholder unless an
              individual file states a different license. None of this library
              is open-licensed and no part of it is included in the CC0
              dedication. dose.wiki&apos;s default policy is to credit the
              creator when known, preserve source links when available, and
              treat reuse rights as the rightsholder&apos;s to grant. The
              public replications API reports a rights status per item —
              explicit license, creator-retained, or unknown — so check the
              item itself rather than assuming any dataset&apos;s terms carry
              over.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              Much of this library was originally published on{" "}
              <strong>Effect Index</strong>, and reaches dose.wiki through the
              Effect Index archive. Recovered files keep the creator credit
              and source link recorded for them there. Some original hosting
              services shut down, and their attribution did not survive.
              dose.wiki shows those items as creator unknown. It does not
              credit them to dose.wiki. These items are the most likely to
              need correction.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              If a replication file is miscredited, has no source link, or
              must be removed, email{" "}
              <a
                className={proseLinkClassName}
                href="mailto:contact@dose.wiki"
              >
                contact@dose.wiki
              </a>{" "}
              with the item title, creator name, and preferred correction.
            </p>
          </DisclosureCard>

          <ContentCard className="mt-6" padding="md">
            <div className={CARD_LABEL_CLASS}>Rights and takedown contact</div>
            <p className={PANEL_PROSE_CLASS}>
              For miscredited or disputed replication media, report-removal
              requests, trademark or name-use concerns, or any other rights
              question about material on dose.wiki, email{" "}
              <a className={proseLinkClassName} href="mailto:contact@dose.wiki">
                contact@dose.wiki
              </a>
              . Include the article or item, and what you want changed.
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-6`}>
            For content-generation provenance, see{" "}
            <a
              className={proseLinkClassName}
              href="/docs/how"
              target="_top"
            >
              how dose.wiki articles are made
            </a>
            . For the application architecture and data flow, see{" "}
            <a
              className={proseLinkClassName}
              href="/docs/code"
              target="_top"
            >
              how dose.wiki is built
            </a>
            .
          </p>
        </section>
      </StickyTocLayout>
    </main>
  );
}
