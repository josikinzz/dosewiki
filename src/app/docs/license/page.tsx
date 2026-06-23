import { buildPublicPageMetadata } from "@server/next/publicSite";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ContentCard, Surface } from "@/components/ui/surface";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "Licensing and reuse",
    description:
      "Reuse terms for dose.wiki content, dataset, molecule assets, source code, trip reports, interaction data, and reagent-test data.",
    pathname: "/docs/license",
  });
}

const TOC_ITEMS = [
  { id: "s1", label: "1. Quick answer", icon: "lucide:check-circle-2" },
  { id: "s2", label: "2. Reuse matrix", icon: "lucide:table-2" },
  { id: "s3", label: "3. CC0 scope", icon: "lucide:file-text" },
  { id: "s4", label: "4. Exceptions", icon: "lucide:triangle-alert" },
  { id: "s5", label: "5. Subjective effects", icon: "lucide:brain" },
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
const TABLE_WRAP_CLASS =
  "overflow-hidden border-dose-card-border shadow-xl";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TABLE_CLASS =
  "w-full border-collapse text-left text-sm [&_tbody_td:first-child]:font-medium [&_tbody_td:first-child]:text-dose-text [&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3.5";
const TABLE_HEAD_ROW_CLASS =
  "border-b border-dose-divider bg-dose-surface-muted/55";
const TABLE_BODY_CLASS =
  "theme-text-secondary divide-y divide-dose-divider [&>tr:nth-child(even)]:bg-dose-surface-muted/35";
const PRE_CLASS =
  "theme-text-secondary overflow-x-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap";
const STATIC_CARD_CLASS = "h-full";
const SUCCESS_CARD_CLASS =
  "h-full border-dose-evidence-border bg-dose-evidence-bg";
const WARNING_CARD_CLASS =
  "h-full border-dose-warning-border bg-dose-warning-bg";
const MATRIX_BADGE_CLASS =
  "whitespace-nowrap px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal shadow-none";
const MATRIX_SUCCESS_BADGE_CLASS = `${MATRIX_BADGE_CLASS} border-dose-evidence-border/50 bg-dose-evidence-bg/20 text-dose-evidence`;
const MATRIX_NEUTRAL_BADGE_CLASS = `${MATRIX_BADGE_CLASS} border-dose-border bg-dose-surface-muted/35 text-dose-text-secondary`;
const MATRIX_WARNING_BADGE_CLASS = `${MATRIX_BADGE_CLASS} border-dose-warning-border-strong bg-dose-warning-bg text-dose-warning-strong font-semibold`;
const ROW_GROUP_CLASS = "mt-6 overflow-hidden";
const ROW_ITEM_CLASS =
  "grid gap-3 border-b border-dose-divider px-5 py-5 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6";
const TIMELINE_ITEM_CLASS =
  "grid gap-2 border-b border-dose-divider px-5 py-4 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5";
const DETAILS_CLASS =
  "theme-card-surface group rounded-2xl border border-dose-border p-2 transition-colors open:border-dose-card-border-strong open:bg-dose-surface-muted/30";
const DETAILS_SUMMARY_CLASS =
  "theme-accent-heading flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-dose-surface-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong group-open:bg-dose-surface-muted/45 [&::marker]:content-[''] [&::-webkit-details-marker]:hidden";
const DETAILS_ICON_CLASS =
  "theme-text-faint h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180 group-open:text-dose-accent";

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
        contentClassName="gap-10"
      >
        <header className="flex max-w-[72ch] flex-col gap-4 border-b border-dose-divider pb-8">
          <p className="theme-text-faint text-xs font-semibold uppercase tracking-[0.18em]">
            Last updated June 23, 2026
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
            <strong>CC0&nbsp;1.0 Universal</strong>. You may copy, modify,
            redistribute, and use that material commercially without asking
            permission or giving attribution.
          </p>
          <p className={PROSE_CLASS}>
            There are important exceptions: the source code is MIT licensed,
            legacy trip reports remain controlled by their authors, TripSit
            interaction data keeps TripSit&apos;s terms, and ProtestKit
            reagent-test data is not licensed by dose.wiki. Use the matrix below
            before republishing anything outside the core article dataset.
          </p>
        </header>

        <div className="min-[1200px]:hidden">
          <PublicTableOfContents items={[...TOC_ITEMS]} />
        </div>

        <section id="s1" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span> Quick answer
          </h2>

          <Alert variant="success" role="note" className="mt-5">
            <AlertDescription>
              <strong>The short version:</strong> dose.wiki&apos;s own article
              text, structured dataset, schema, and generated molecule assets
              are CC0 unless a page or data field says otherwise. Credit is
              welcome but not required.
            </AlertDescription>
          </Alert>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <ContentCard className={SUCCESS_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Freely reusable</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>dose.wiki-authored article prose and structured fields.</li>
                <li>
                  The downloadable <code>SubstanceIndex.json</code> snapshot and
                  schema.
                </li>
                <li>
                  Molecule SVGs generated from SMILES, plus their manifest.
                </li>
                <li>Trip reports submitted through the current report form.</li>
              </ul>
            </ContentCard>
            <ContentCard className={WARNING_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Check before reuse</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  Legacy trip reports, where rights remain with the author.
                </li>
                <li>TripSit interaction ratings and combination guidance.</li>
                <li>Reagent-test data fetched from protestkit.eu.</li>
                <li>
                  External sources cited by articles, trademarks, and
                  third-party names.
                </li>
              </ul>
            </ContentCard>
          </div>

          <Alert variant="default" role="note" className="mt-5">
            <AlertDescription>
              <strong>Not legal advice.</strong> This page describes
              dose.wiki&apos;s licensing intent and the reuse terms we apply to
              our own material. If your use is sensitive, commercial, or
              jurisdiction-specific, verify the relevant terms yourself.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s2" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span> Reuse matrix
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            This table is the fastest way to decide what applies. It separates
            material dose.wiki can license from material that belongs to
            contributors or third-party projects.
          </p>

          <Surface
            variant="public"
            padding="none"
            radius="compactState"
            className={`${TABLE_WRAP_CLASS} mt-5`}
          >
            <div className={TABLE_SCROLL_CLASS}>
              <table className={`${TABLE_CLASS} min-w-[72rem]`}>
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
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
                    <th className="theme-text-faint min-w-[18rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  <tr className="align-top">
                    <td className="p-3">dose.wiki-authored article content</td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        CC0&nbsp;1.0
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Not required
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Allowed
                      </Badge>
                    </td>
                    <td className="p-3">
                      Covers dose.wiki&apos;s own copyrightable contributions to
                      summaries, pharmacology, tolerance, harm potential,
                      history, legality, dosage, duration, and related article
                      fields.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">
                      Structured dataset <code>SubstanceIndex.json</code>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        CC0&nbsp;1.0
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Not required
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Allowed
                      </Badge>
                    </td>
                    <td className="p-3">
                      The downloadable dataset snapshot and dose.wiki
                      schema/normalization work. It does not grant rights to
                      external sources cited by articles.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Molecule SVG pack and manifest</td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        CC0&nbsp;1.0
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Not required
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Allowed
                      </Badge>
                    </td>
                    <td className="p-3">
                      Structure SVGs generated by dose.wiki from SMILES with
                      RDKit, plus the molecule metadata manifest.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Website source code</td>
                    <td className="p-3">
                      <Badge
                        variant="default"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        MIT
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        Keep notice
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Allowed
                      </Badge>
                    </td>
                    <td className="p-3">
                      MIT covers the application code and tooling, not the
                      article content or third-party data.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Legacy trip reports</td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        Author retained
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        Per report
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_WARNING_BADGE_CLASS}
                      >
                        Ask author
                      </Badge>
                    </td>
                    <td className="p-3">
                      Reports already on the site are contributor-authored
                      personal accounts. Reuse outside ordinary linking or
                      quotation depends on the report&apos;s marker or the
                      author&apos;s permission.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">New report-form submissions</td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        CC0&nbsp;1.0
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Not required
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="success"
                        className={MATRIX_SUCCESS_BADGE_CLASS}
                      >
                        Allowed
                      </Badge>
                    </td>
                    <td className="p-3">
                      Applies when the submitter accepts the report form&apos;s
                      CC0 terms before sending the report.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Interaction ratings</td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        TripSit terms
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_WARNING_BADGE_CLASS}
                      >
                        Required
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_WARNING_BADGE_CLASS}
                      >
                        Restricted
                      </Badge>
                    </td>
                    <td className="p-3">
                      Combination data comes from TripSit and requires TripSit
                      attribution, a link back, and their quick-reference
                      disclaimer. Commercial use needs TripSit permission.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Reagent-test data</td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_NEUTRAL_BADGE_CLASS}
                      >
                        ProtestKit terms
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_WARNING_BADGE_CLASS}
                      >
                        Consult source
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={MATRIX_WARNING_BADGE_CLASS}
                      >
                        Consult source
                      </Badge>
                    </td>
                    <td className="p-3">
                      Reagent results are fetched from protestkit.eu at view
                      time and are not redistributed as part of the downloadable
                      dose.wiki dataset.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>
        </section>

        <section id="s3" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span> CC0 scope
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The CC0 release covers dose.wiki&apos;s own copyrightable
            contributions: original prose, dataset compilation, schema design,
            normalization, generated molecule assets, and report-form
            submissions whose contributors accepted CC0 terms.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
            <ContentCard className={STATIC_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>You may</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  Copy and redistribute the covered material in any format.
                </li>
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
            </ContentCard>
            <ContentCard className={STATIC_CARD_CLASS} variant="subtle">
              <div className={CARD_LABEL_CLASS}>This does not cover</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  External sources cited or linked from dose.wiki articles.
                </li>
                <li>
                  Legacy contributor reports unless the report marker says
                  otherwise.
                </li>
                <li>
                  TripSit interaction data or ProtestKit reagent-test data.
                </li>
                <li>
                  Third-party names, trademarks, logos, or site identities.
                </li>
              </ul>
            </ContentCard>
          </div>

          <Alert variant="default" role="note" className="mt-5">
            <AlertDescription>
              <strong>Attribution is appreciated, not required.</strong> A link
              to dose.wiki helps other people find the source dataset, but CC0
              does not require credit.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s4" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span> Important exceptions
          </h2>

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
                  Legacy reports are published on dose.wiki with permission,
                  but they are not part of the CC0 dataset. Link to them freely;
                  republish or use them commercially only when the report&apos;s
                  license marker allows it or the author gives permission.
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
                  Reports submitted through the current form are dedicated to
                  the public domain by the submitter before they are sent.
                  dose.wiki will still honor good-faith requests to correct
                  attribution, update identifying details, or remove a report.
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Interactions from TripSit</div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  The combination ratings shown on dose.wiki come from{" "}
                  <a
                    href="https://wiki.tripsit.me/wiki/Drug_combinations"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    TripSit&apos;s drug-combination guidance
                  </a>
                  . dose.wiki does not place that data under CC0. Reuse must
                  follow TripSit&apos;s terms: non-commercial use, attribution,
                  a link back to TripSit or combo.tripsit.me, and a note that
                  the information is only a quick reference.
                </p>
              </div>
            </div>

            <div className={ROW_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                Reagent data from ProtestKit
              </div>
              <div>
                <p className={PANEL_PROSE_CLASS}>
                  Reagent color reactions are fetched from{" "}
                  <a
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
              If you are building from a full page scrape rather than the
              downloadable dataset, check whether you also captured interaction
              tables, reagent data, or legacy reports. Those parts do not
              inherit the dataset&apos;s CC0 terms.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s5" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span> Subjective effects
            provenance
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The Subjective Effect Index and dose.wiki subjective-effect
            descriptions have a longer publication history than the rest of the
            dataset. They are included in the CC0 release to the extent they are
            authored by{" "}
            <a
              href="https://en.wikipedia.org/wiki/Josie_Kins"
              target="_blank"
              rel="noopener noreferrer"
            >
              Josie Kins
            </a>{" "}
            and maintained by dose.wiki.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            Because this material previously appeared across multiple projects,
            dose.wiki reconstructed its corpus from archived versions dated no
            later than August&nbsp;2016 and excludes later third-party edits.
            The goal is to release only material dose.wiki has the right to
            dedicate under CC0.
          </p>

          <Surface
            variant="subtle"
            padding="none"
            radius="xl"
            className={ROW_GROUP_CLASS}
          >
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Origin</div>
              <div>
                <p className={CARD_TITLE_CLASS}>Disregard Everything I Say</p>
                <p className="theme-text-muted text-sm leading-6">
                  Early effect documentation.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Expanded</div>
              <div>
                <p className={CARD_TITLE_CLASS}>PsychonautWiki</p>
                <p className="theme-text-muted text-sm leading-6">
                  Structured collaborative reference.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Formalized</div>
              <div>
                <p className={CARD_TITLE_CLASS}>Effect Index</p>
                <p className="theme-text-muted text-sm leading-6">
                  Dedicated subjective-effect index.
                </p>
              </div>
            </div>
            <div className={TIMELINE_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Current</div>
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
              credit requirements. The subjective-effect material included in
              the dose.wiki dataset follows the same CC0 terms as the rest of
              the covered dataset.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s6" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>06</span> Source code
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The website source code and tooling are released under the{" "}
            <strong>MIT License</strong>. MIT lets you use, copy, modify,
            distribute, sublicense, or sell copies of the software, including in
            commercial and closed-source projects.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard className={STATIC_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Condition</div>
              <p className={PANEL_PROSE_CLASS}>
                Keep the MIT copyright and permission notice in copies or
                substantial portions of the code.
              </p>
            </ContentCard>
            <ContentCard className={STATIC_CARD_CLASS} variant="subtle">
              <div className={CARD_LABEL_CLASS}>Boundary</div>
              <p className={PANEL_PROSE_CLASS}>
                MIT applies to the software. dose.wiki-owned content and data
                are CC0, while contributor reports and third-party data keep
                their separate terms.
              </p>
            </ContentCard>
          </div>
        </section>

        <section id="s7" className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span> Attribution examples
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Attribution is optional for CC0 material. If you want to credit
            dose.wiki or need to keep third-party data labels clear, these
            examples are safe starting points.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ContentCard className={STATIC_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                Dataset or article text only
              </div>
              <pre className={`${PRE_CLASS} mt-3`}>
                {`Includes material from dose.wiki (https://dose.wiki),
released under CC0 1.0.`}
              </pre>
            </ContentCard>
            <ContentCard className={STATIC_CARD_CLASS} variant="subtle">
              <div className={CARD_LABEL_CLASS}>
                If you also display interactions
              </div>
              <pre className={`${PRE_CLASS} mt-3`}>
                {`Includes CC0 material from dose.wiki.
Interaction data from TripSit; follow TripSit terms:
non-commercial use, attribution, link back, and quick-reference disclaimer.`}
              </pre>
            </ContentCard>
          </div>

          <Surface
            variant="public"
            padding="none"
            radius="compactState"
            className={`${TABLE_WRAP_CLASS} mt-6`}
          >
            <div className={TABLE_SCROLL_CLASS}>
              <table className={`${TABLE_CLASS} min-w-[50rem]`}>
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="theme-text-faint min-w-[14rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      You want to
                    </th>
                    <th className="theme-text-faint min-w-[20rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                      What applies
                    </th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  <tr className="align-top">
                    <td className="p-3">
                      Build a free or paid app from the dataset
                    </td>
                    <td className="p-3">
                      Allowed under CC0 for covered dose.wiki material. If you
                      display interactions, follow TripSit&apos;s separate
                      terms.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">
                      Use article text in a book, video, course, or dataset
                    </td>
                    <td className="p-3">
                      Allowed under CC0 for dose.wiki-authored text. Credit is
                      optional.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Reuse a trip report</td>
                    <td className="p-3">
                      Check the report&apos;s marker. Legacy reports are
                      author-retained unless marked otherwise; report-form
                      submissions are CC0.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Reuse interaction ratings</td>
                    <td className="p-3">
                      Follow TripSit&apos;s terms and ask TripSit about
                      commercial use.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Reuse reagent-test results</td>
                    <td className="p-3">
                      Get reuse permission or terms from ProtestKit; dose.wiki
                      does not license that data.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="p-3">Fork the website</td>
                    <td className="p-3">
                      Code is MIT; covered article content, data, and molecule
                      assets are CC0.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>
        </section>

        <section id="s8" className={MAJOR_SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span> Full terms
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Canonical license summaries and source links for each layer.
          </p>

          <details className={`${DETAILS_CLASS} mt-5`}>
            <summary className={DETAILS_SUMMARY_CLASS}>
              <span>
                CC0 1.0 Universal - covered content, data, and molecule assets
              </span>
              <Icon
                icon="lucide:chevron-down"
                className={DETAILS_ICON_CLASS}
                size={16}
              />
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                CC0 places a work as completely as possible into the public
                domain. The person who associates a work with CC0 waives
                copyright and related rights worldwide to the extent allowed by
                law. Covered material may be copied, modified, distributed, and
                used commercially without permission or attribution. It is
                provided without warranties.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Summary and legal code:{" "}
                <a
                  href="https://creativecommons.org/publicdomain/zero/1.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  creativecommons.org/publicdomain/zero/1.0
                </a>{" "}
                (
                <a
                  href="https://creativecommons.org/publicdomain/zero/1.0/legalcode"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  legal code
                </a>
                ).
              </p>
            </div>
          </details>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <summary className={DETAILS_SUMMARY_CLASS}>
              <span>MIT License - source code</span>
              <Icon
                icon="lucide:chevron-down"
                className={DETAILS_ICON_CLASS}
                size={16}
              />
            </summary>
            <div className="mt-3">
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
            </div>
          </details>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <summary className={DETAILS_SUMMARY_CLASS}>
              <span>Trip reports - contributor terms</span>
              <Icon
                icon="lucide:chevron-down"
                className={DETAILS_ICON_CLASS}
                size={16}
              />
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                Legacy trip reports are not part of the CC0 dataset. Rights
                remain with the original author unless the individual report
                shows a more permissive license marker.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Reports submitted through the current report form are dedicated
                to the public domain under CC0 by the submitter when they accept
                the form terms.
              </p>
            </div>
          </details>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <summary className={DETAILS_SUMMARY_CLASS}>
              <span>TripSit terms - interaction data</span>
              <Icon
                icon="lucide:chevron-down"
                className={DETAILS_ICON_CLASS}
                size={16}
              />
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                TripSit combination data is separate from dose.wiki&apos;s CC0
                dataset. TripSit describes reuse as free for non-commercial
                purposes when users credit TripSit, link back to the combination
                page or combo.tripsit.me, and include a quick-reference
                disclaimer. Commercial use requires TripSit permission.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Source:{" "}
                <a
                  href="https://wiki.tripsit.me/wiki/Drug_combinations"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  wiki.tripsit.me/wiki/Drug_combinations
                </a>{" "}
                and{" "}
                <a
                  href="https://combo.tripsit.me"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  combo.tripsit.me
                </a>
                .
              </p>
            </div>
          </details>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <summary className={DETAILS_SUMMARY_CLASS}>
              <span>ProtestKit terms - reagent-test data</span>
              <Icon
                icon="lucide:chevron-down"
                className={DETAILS_ICON_CLASS}
                size={16}
              />
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                Reagent-test data is fetched from protestkit.eu and is not
                redistributed in the dose.wiki dataset. dose.wiki does not grant
                reuse rights for this data; consult ProtestKit directly before
                republishing it.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Source:{" "}
                <a
                  href="https://protestkit.eu"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  protestkit.eu
                </a>
                .
              </p>
            </div>
          </details>

          <Alert variant="default" role="note" className="mt-6">
            <AlertDescription>
              For content-generation provenance, see{" "}
              <a href="/docs/how" target="_top">
                how dose.wiki articles are made
              </a>
              . For the application architecture and data flow, see{" "}
              <a href="/docs/code" target="_top">
                how dose.wiki is built
              </a>
              .
            </AlertDescription>
          </Alert>
        </section>
      </StickyTocLayout>
    </main>
  );
}
