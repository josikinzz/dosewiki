import { buildPublicPageMetadata } from "@server/next/publicSite";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How you can use dose.wiki",
    description:
      "Licensing and reuse for dose.wiki: our content and dataset are public domain (CC0), the code is MIT, and the trip reports, interaction, and reagent-test data keep their own terms.",
    pathname: "/docs/license",
  });
}

const TOC_ITEMS = [
  { id: "s1", label: "1. At a glance", icon: "lucide:eye" },
  { id: "s2", label: "2. Why dose.wiki is this open", icon: "lucide:unlock" },
  { id: "s3", label: "3. The content — public domain", icon: "lucide:file-text" },
  { id: "s4", label: "4. The subjective effect work", icon: "lucide:brain" },
  { id: "s5", label: "5. The code — MIT", icon: "lucide:code-2" },
  { id: "s6", label: "6. Trip reports", icon: "lucide:scroll-text" },
  { id: "s7", label: "7. What we don’t own", icon: "lucide:hand" },
  { id: "s8", label: "8. How to reuse it", icon: "lucide:download" },
  { id: "s9", label: "9. Why we can release it this way", icon: "lucide:scale" },
  { id: "s10", label: "10. The licenses in full", icon: "lucide:book-open" },
] as const;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-2 text-sm font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "theme-accent-heading text-2xl font-semibold";
const PROSE_CLASS = "theme-text-secondary leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const CARD_TITLE_CLASS =
  "theme-accent-heading mb-1.5 text-base font-semibold";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const TABLE_WRAP_CLASS =
  "theme-card-surface overflow-x-auto rounded-2xl p-0";
const PRE_CLASS =
  "theme-card-surface theme-text-secondary overflow-x-auto rounded-2xl border p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap";

export default function DocsLicensePage() {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={<PublicTableOfContents items={[...TOC_ITEMS]} variant="bare" />}
        maxWidthClass="max-w-4xl"
        contentClassName="gap-8"
      >
        <header className="flex flex-col gap-4">
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            How you can use dose.wiki
          </h1>
          <p className="theme-text-muted text-base">
            licensing &amp; reuse — the code, the content, and the two parts we don’t own
          </p>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            dose.wiki is built to be <strong>taken</strong>. Almost everything here — every article we
            wrote and the entire structured dataset behind them — is released into the{" "}
            <strong>public domain</strong>: use it, remix it, sell it, build on it, with no permission
            and no credit required. The website’s source code is <strong>MIT</strong>. The main
            exceptions are the <strong>older trip reports</strong>, whose rights stay with the people who
            wrote them (newer ones submitted through the report form are public domain too), plus two
            sections we don’t own — <strong>interaction ratings</strong> from TripSit and{" "}
            <strong>reagent test results</strong> from protestkit.eu. This page lays out exactly what you
            can do with each part.
          </p>
        </header>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        <div className="min-[1200px]:hidden">
          <PublicTableOfContents items={[...TOC_ITEMS]} />
        </div>

        <section id="s1" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span> At a glance
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            dose.wiki has three licensing layers. Most of it is as free as content can be; a small,
            clearly-marked part comes from elsewhere and keeps its own terms.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <div className={CARD_LABEL_CLASS}>Content &amp; data</div>
              <p className={CARD_TITLE_CLASS}>CC0&nbsp;1.0 — public domain</p>
              <p className={PROSE_CLASS}>
                Every article we wrote and the whole dataset. No attribution, no permission, commercial
                use fine.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Molecule art pack</div>
              <p className={CARD_TITLE_CLASS}>CC0&nbsp;1.0 — public domain</p>
              <p className={PROSE_CLASS}>
                ~572 structure SVGs generated from SMILES with RDKit, plus a manifest. Downloadable on
                the About page.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Source code</div>
              <p className={CARD_TITLE_CLASS}>MIT License</p>
              <p className={PROSE_CLASS}>
                The website and its tooling. Reuse freely; just keep the short copyright notice.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Trip reports</div>
              <p className={CARD_TITLE_CLASS}>Two cases</p>
              <p className={PROSE_CLASS}>
                Personal accounts. Ones already on the site: up to the author (credit them). New ones via
                the form: public domain (CC0).
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Interactions</div>
              <p className={CARD_TITLE_CLASS}>TripSit’s terms</p>
              <p className={PROSE_CLASS}>
                Combination ratings come from TripSit. Free for non-commercial use; credit + link back
                required.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Reagent tests</div>
              <p className={CARD_TITLE_CLASS}>protestkit.eu’s terms</p>
              <p className={PROSE_CLASS}>
                Color reactions are pulled live from protestkit.eu and aren’t part of the dataset.
              </p>
            </Card>
          </div>

          <p className={`${PROSE_CLASS} mt-7`}>The whole picture in one table:</p>

          <div className={`${TABLE_WRAP_CLASS} mt-3`}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    Part of dose.wiki
                  </th>
                  <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    License
                  </th>
                  <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    Credit required?
                  </th>
                  <th className="theme-text-faint p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    Commercial use?
                  </th>
                  <th className="theme-text-faint min-w-[16rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="theme-text-secondary">
                <tr className="border-b align-top">
                  <td className="p-3">Articles &amp; written content</td>
                  <td className="p-3">
                    <Badge variant="success">CC0&nbsp;1.0</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">No</Badge>
                    <small className="theme-text-faint mt-1 block">appreciated, not required</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">Yes</Badge>
                  </td>
                  <td className="p-3">
                    Everything dose.wiki authored — summaries, pharmacology, history, dosing notes, the
                    subjective effects work.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">
                    The dataset <code>SubstanceIndex.json</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">CC0&nbsp;1.0</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">No</Badge>
                    <small className="theme-text-faint mt-1 block">appreciated, not required</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">Yes</Badge>
                  </td>
                  <td className="p-3">
                    The entire database in one file — one-click download on the About page.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">
                    Molecule art pack <small className="theme-text-faint">SVGs + manifest</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">CC0&nbsp;1.0</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">No</Badge>
                    <small className="theme-text-faint mt-1 block">appreciated, not required</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">Yes</Badge>
                  </td>
                  <td className="p-3">
                    ~572 substance structure SVGs generated by dose.wiki from SMILES (RDKit), plus a
                    SMILES/metadata JSON. Download on the About page.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Website source code</td>
                  <td className="p-3">
                    <Badge variant="default">MIT</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Yes</Badge>
                    <small className="theme-text-faint mt-1 block">keep the short notice</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">Yes</Badge>
                  </td>
                  <td className="p-3">The repository behind the public site.</td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">
                    Trip reports <small className="theme-text-faint">already on the site</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Up to the author</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Yes</Badge>
                    <small className="theme-text-faint mt-1 block">credit the author</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Ask author</Badge>
                  </td>
                  <td className="p-3">
                    Donated or emailed personal accounts. Rights stay with each author; not in the
                    dataset.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">
                    Trip reports <small className="theme-text-faint">new, via the form</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">CC0</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">No</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="success">Yes</Badge>
                  </td>
                  <td className="p-3">
                    Dedicated to the public domain by the submitter through the report form.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Interaction ratings</td>
                  <td className="p-3">
                    <Badge variant="secondary">TripSit</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Yes</Badge>
                    <small className="theme-text-faint mt-1 block">+ link back</small>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">No</Badge>
                    <small className="theme-text-faint mt-1 block">without permission</small>
                  </td>
                  <td className="p-3">
                    Sourced from TripSit’s combination research. We don’t own it — see §7.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="p-3">Reagent test results</td>
                  <td className="p-3">
                    <Badge variant="secondary">ProtestKit</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Per their terms</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">Per their terms</Badge>
                  </td>
                  <td className="p-3">
                    Live from protestkit.eu at view time. Not included in the dataset.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span> Why dose.wiki is this open
          </h2>

          <p className="theme-accent-heading theme-accent-emphasis mt-5 border-l-2 border-current pl-4 text-lg font-medium leading-8">
            dose.wiki exists to be a modern, open, comprehensive harm-reduction resource — and a{" "}
            <strong>dataset so easy to download, build on, and fork</strong> that nobody ever has to
            research and rebuild an encyclopedia of this kind from scratch again.
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            That goal only works if the license gets out of the way. An attribution or share-alike
            requirement is a small tax, but it is still a tax: it makes people stop, check, and worry
            about whether they are allowed. We would rather remove the question entirely. So the content
            and the dataset are dedicated to the <strong>public domain under CC0</strong> — the most
            permissive release there is. No attribution, no share-alike, no permission, no strings.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            If dose.wiki vanished tomorrow, the dataset would already be in a thousand other hands, free
            for anyone to carry forward. That is the point.
          </p>
        </section>

        <section id="s3" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span> The content — public domain (CC0)
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Every article dose.wiki wrote, and the entire structured dataset, is released under{" "}
            <strong>CC0&nbsp;1.0 Universal</strong>. In plain terms, we have waived our copyright and
            placed the work into the public domain. You can do essentially anything with it:
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <div className={CARD_LABEL_CLASS}>You may</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  <strong>Copy &amp; redistribute</strong> the text and data anywhere, in any format.
                </li>
                <li>
                  <strong>Remix, adapt, translate</strong> and build on it however you like.
                </li>
                <li>
                  <strong>Use it commercially</strong> — paid apps, books, products, research.
                </li>
                <li>
                  <strong>Skip attribution</strong> — no credit line is required.
                </li>
                <li>
                  <strong>Skip permission</strong> — you never need to ask us.
                </li>
                <li>
                  <strong>Relicense your version</strong> — there is no share-alike obligation.
                </li>
              </ul>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>What this covers</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  All written article sections we authored — summary, pharmacology, tolerance, harm
                  potential, history &amp; culture, legality, and the dosing/duration notes.
                </li>
                <li>
                  The <strong>subjective effects</strong> content and the{" "}
                  <strong>Subjective Effect Index</strong>, written by founder{" "}
                  <a
                    href="https://en.wikipedia.org/wiki/Josie_Kins"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Josie Kins
                  </a>{" "}
                  — its own history is set out in §4.
                </li>
                <li>
                  The full <strong>structured dataset</strong> and its schema —{" "}
                  <code>SubstanceIndex.json</code>.
                </li>
                <li>
                  The <strong>molecule art pack</strong> — ~572 substance structure SVGs generated from
                  SMILES with RDKit, plus the <code>molecules.json</code> manifest.
                </li>
              </ul>
            </Card>
          </div>

          <Alert variant="success" className="mt-5">
            <AlertDescription>
              <strong>Credit is appreciated, never required.</strong> CC0 asks nothing of you. But if
              dose.wiki is useful, a link back to{" "}
              <a href="https://dose.wiki" target="_blank" rel="noopener noreferrer">
                dose.wiki
              </a>{" "}
              or a mention of{" "}
              <a
                href="https://en.wikipedia.org/wiki/Josie_Kins"
                target="_blank"
                rel="noopener noreferrer"
              >
                Josie Kins
              </a>{" "}
              genuinely helps the project keep going — it is a courtesy, not an obligation.
            </AlertDescription>
          </Alert>

          <Alert variant="default" className="mt-4">
            <AlertDescription>
              <strong>What sits outside this.</strong> The <strong>older</strong> trip reports stay with
              the people who wrote them (§6), and the interaction and reagent data are not ours to dedicate
              (§7). Everything else — our writing, the dataset, the molecule pack, and trip reports
              submitted through the form — is CC0.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s4" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span> The subjective effect work
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Two parts of dose.wiki carry a longer history than the rest, and deserve their own note: the{" "}
            <strong>Subjective Effect Index</strong> — the catalogue of individual effects, their
            definitions and analyses — and the per-substance{" "}
            <strong>subjective effects sections</strong> that map which of those effects a given
            substance can produce. Both were written by dose.wiki’s founder,{" "}
            <a
              href="https://en.wikipedia.org/wiki/Josie_Kins"
              target="_blank"
              rel="noopener noreferrer"
            >
              Josie Kins
            </a>
            , and they predate this site by more than a decade.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            This body of work has moved between several projects over the years —{" "}
            <strong>every one of them founded by Josie</strong>. It began on{" "}
            <strong>Disregard Everything I Say</strong>, grew into a structured reference on{" "}
            <strong>PsychonautWiki</strong>, and was later expanded and formalised at{" "}
            <strong>Effect Index</strong>. dose.wiki is simply its current home. The platform has changed
            more than once; the author has not.
          </p>

          <p className="theme-text-faint mt-7 text-xs font-semibold uppercase tracking-[0.18em]">
            One body of work, several homes
          </p>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <li className="theme-card-surface rounded-2xl p-4">
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                ORIGIN
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">
                Disregard Everything I Say
              </div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Josie’s original project, where the effect documentation began
              </div>
            </li>
            <li className="theme-card-surface rounded-2xl p-4">
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                GREW
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">PsychonautWiki</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                founded by Josie; the index became a structured, collaborative reference
              </div>
            </li>
            <li className="theme-card-surface rounded-2xl p-4">
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                FORMALISED
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Effect Index</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                founded by Josie to expand the index into its fullest form
              </div>
            </li>
            <li className="theme-card-surface rounded-2xl p-4">
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                NOW
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">dose.wiki</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                its current home — the same author throughout
              </div>
            </li>
          </ol>

          <p className="theme-accent-heading theme-accent-emphasis mt-7 border-l-2 border-current pl-4 text-lg font-medium leading-8">
            As the original author, Josie Kins now dedicates the{" "}
            <strong>Subjective Effect Index</strong> and the{" "}
            <strong>subjective effects sections</strong> to the{" "}
            <strong>public domain under CC0</strong> — the same terms as everything else dose.wiki owns.
            This dedication <strong>supersedes every earlier license</strong> these works were released
            under, on any previous platform.
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            Because that history runs across several projects, the text here was sourced with care. Every
            effect definition was{" "}
            <strong>
              forked from the Internet Archive, from snapshots dated no later than August&nbsp;2016
            </strong>{" "}
            — comfortably before Josie stepped away from the PsychonautWiki project in 2017. Drawing the
            line there keeps this corpus clear of anything the project’s current administrators later
            edited or might lay claim to, so what dose.wiki publishes traces back to its original author
            and to no one else.
          </p>

          <Alert variant="success" className="mt-5">
            <AlertDescription>
              <strong>The result is the same as everywhere else on this page.</strong> The subjective
              effect work is yours to copy, remix, translate, and build on — commercially or not, with no
              permission and no credit required. A nod to{" "}
              <a
                href="https://en.wikipedia.org/wiki/Josie_Kins"
                target="_blank"
                rel="noopener noreferrer"
              >
                Josie Kins
              </a>{" "}
              is appreciated, never owed.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span> The code — MIT
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            dose.wiki is open-source software as well as open content, and the two are licensed
            separately. The website, the data tooling, and the build that runs the public site are
            released under the <strong>MIT License</strong> — short, permissive, and familiar to any
            developer.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <div className={CARD_LABEL_CLASS}>You may</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>Use the code in your own projects — open or closed source.</li>
                <li>Modify, merge, publish, distribute, sublicense, or sell it.</li>
                <li>Use it commercially, with no royalty.</li>
              </ul>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>The one condition</div>
              <p className={PROSE_CLASS}>
                Keep the MIT copyright and permission notice in copies or substantial portions of the
                code. That is the entire obligation. The software is provided “as is,” without warranty.
              </p>
            </Card>
          </div>

          <Alert variant="default" className="mt-5">
            <AlertDescription>
              <strong>Code vs. content.</strong> MIT covers the <em>software</em>; the{" "}
              <em>content and data</em> are CC0 (§3). If you fork the repository you are taking both — the
              code under MIT, the data under CC0.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s6" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>06</span> Trip reports
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Trip reports are different from everything above. They are personal, first-person accounts
            written by other people — some donated by friends years ago “to do whatever with,” others
            emailed in by strangers, and more recently submitted through the report form. They are
            creative works, and <strong>copyright stays with the author who wrote each one</strong>. We
            publish them with permission; we don’t claim to own them, so they are{" "}
            <strong>not part of the CC0 dedication of our own content</strong> and not included in the
            downloadable dataset. How a report may be reused depends on how it reached us — and every
            report on the site carries a small marker saying which case it falls under:
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <div className={CARD_LABEL_CLASS}>Already on the site</div>
              <p className={CARD_TITLE_CLASS}>Up to the author</p>
              <p className={PROSE_CLASS}>
                The legacy archive — donated by friends or emailed in by strangers, often years ago.{" "}
                <strong>Rights stay with the original author.</strong> Read and share them freely{" "}
                <strong>with credit to the author</strong>, but reuse beyond that — especially anything
                commercial — is up to that author, so check with them first. If a report is yours and you
                want it credited differently, relicensed, or removed, just ask — we’ll honor it.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>New, via the submission form</div>
              <p className={CARD_TITLE_CLASS}>Public domain (CC0)</p>
              <p className={PROSE_CLASS}>
                Reports submitted through the report form are{" "}
                <strong>dedicated to the public domain under CC0</strong> by the person who submits them:
                anyone may reuse them, including commercially, with{" "}
                <strong>no attribution required</strong> — the same terms as the rest of our own content.
                The submission form makes this dedication explicit before a report is sent.
              </p>
            </Card>
          </div>

          <Alert variant="default" className="mt-5">
            <AlertDescription>
              <strong>Why the difference?</strong> The older reports were given to us informally, long
              before any license existed, and we can’t reach most of those authors to confirm broader terms
              — so we leave the rights with them and just ask reusers to credit them. New submissions come
              in through a form that asks the submitter to release the report into the public domain, so
              those can be fully free. Either way, a contributor can always ask us to change or remove their
              report.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span> What we don’t own
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Two sections on every article come straight from other projects. dose.wiki did not write them
            and does not own them, so we <strong>cannot place them in the public domain</strong>. They
            keep the terms their creators set. These are the only carve-outs from the CC0 dedication.
          </p>

          <Card className="mt-5">
            <div className={CARD_LABEL_CLASS}>Interactions — TripSit</div>
            <p className={PROSE_CLASS}>
              The combination risk ratings shown on every article come from{" "}
              <strong>
                <a
                  href="https://wiki.tripsit.me/wiki/Drug_combinations"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TripSit’s drug combination research
                </a>
              </strong>
              . TripSit publishes this data under its own terms, not a standard open license:
            </p>
          </Card>

          <Alert variant="default" className="mt-4">
            <AlertDescription>
              “Use of the data the combination chart and app are built upon is free-of-charge for
              non-commercial purposes… we only require that you link back to either this page, or
              combo.tripsit.me. This should be accompanied with a note citing TripSit as the source for the
              information wherever it appears. The presentation should also include a note that the
              information is only intended for a quick overview and reference, and that it is necessary for
              users to perform more individual research before making a decision.”
              <br />
              <br />—{" "}
              <a
                href="https://wiki.tripsit.me/wiki/Drug_combinations"
                target="_blank"
                rel="noopener noreferrer"
              >
                TripSit, “Drug combinations” (Use &amp; Attribution)
              </a>
            </AlertDescription>
          </Alert>

          <p className={`${PROSE_CLASS} mt-5`}>If you reuse the interaction data, you must:</p>
          <ul className={`${LIST_CLASS} mt-2 list-disc pl-5 text-sm`}>
            <li>
              <strong>Credit TripSit</strong> and link back to their combination page or
              combo.tripsit.me.
            </li>
            <li>
              Keep it <strong>non-commercial</strong> — commercial use, reselling printed charts, or
              editing the chart needs TripSit’s written permission.
            </li>
            <li>
              Include the <strong>“quick reference, do your own research”</strong> disclaimer.
            </li>
          </ul>
          <p className={`${PROSE_CLASS} mt-3`}>
            This applies whether you take the data from TripSit or from us — it is their data, cleared
            with them, not with dose.wiki.
          </p>

          <Card className="mt-6">
            <div className={CARD_LABEL_CLASS}>Reagent tests — protestkit.eu</div>
            <p className={PROSE_CLASS}>
              The reagent color reactions (Marquis, Mecke, Mandelin, Simon’s, Froehde, Liebermann,
              Ehrlich, and others) are fetched{" "}
              <strong>
                live from{" "}
                <a href="https://protestkit.eu" target="_blank" rel="noopener noreferrer">
                  protestkit.eu
                </a>
              </strong>{" "}
              when you open an article. Because they are pulled at view time,{" "}
              <strong>they are not part of the downloadable dataset</strong>, and they remain under
              ProtestKit’s own terms. To reuse reagent results, get them from — and clear them with —
              protestkit.eu directly, and credit protestkit.eu as the source.
            </p>
          </Card>

          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <strong>The CC0 dedication does not extend to these two sections.</strong> Everything else on
              dose.wiki — all of our own writing and the entire dataset — is yours to use freely.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span> How to reuse it
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>The whole database is one file. Grab it and go:</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <div className={CARD_LABEL_CLASS}>Get the data</div>
              <p className={PROSE_CLASS}>
                Download <code>SubstanceIndex.json</code> — the entire substance database — from the
                one-click button on the{" "}
                <a href="/about" target="_top">
                  About page
                </a>
                , or pull it straight from{" "}
                <a
                  href="https://raw.githubusercontent.com/josikinzz/dosewiki/main/src/data/SubstanceIndex.json"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                . The <strong>molecule art pack</strong> (an SVG <code>.zip</code> plus{" "}
                <code>molecules.json</code>) downloads from that same{" "}
                <a href="/about" target="_top">
                  About page
                </a>{" "}
                — also public domain.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Get the code</div>
              <p className={PROSE_CLASS}>
                The full source lives at{" "}
                <a
                  href="https://github.com/josikinzz/dosewiki"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/josikinzz/dosewiki
                </a>
                , under the MIT License.
              </p>
            </Card>
          </div>

          <p className={`${PROSE_CLASS} mt-6`}>
            You don’t have to credit us — but if you’d like to, something like this is perfect:
          </p>

          <pre className={`${PRE_CLASS} mt-3`}>
            {`Includes data from dose.wiki (https://dose.wiki),
dedicated to the public domain under CC0 1.0.
Interaction data © TripSit (non-commercial, credit + link back).`}
          </pre>

          <p className={`${PROSE_CLASS} mt-6`}>A few common situations:</p>
          <div className={`${TABLE_WRAP_CLASS} mt-3`}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="theme-text-faint min-w-[14rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    You want to…
                  </th>
                  <th className="theme-text-faint min-w-[18rem] p-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    What applies
                  </th>
                </tr>
              </thead>
              <tbody className="theme-text-secondary">
                <tr className="border-b align-top">
                  <td className="p-3">Build a free or paid app on the dataset</td>
                  <td className="p-3">
                    Fine under CC0 — no permission, no credit needed. If you display interactions,
                    follow TripSit’s terms.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Use article text in a book, video, or course</td>
                  <td className="p-3">Fine under CC0, commercial included. Credit is optional.</td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Reuse a trip report</td>
                  <td className="p-3">
                    Check the report’s marker: ones already on the site are up to the author (credit
                    them, ask before commercial use); ones submitted through the form are public domain
                    (CC0) — reuse freely, no credit needed. Always honor a removal request.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Reuse the interaction ratings specifically</td>
                  <td className="p-3">
                    Follow TripSit’s terms: non-commercial, credit + link back, include the disclaimer.
                  </td>
                </tr>
                <tr className="border-b align-top">
                  <td className="p-3">Reuse reagent test results</td>
                  <td className="p-3">
                    Get them from protestkit.eu and follow their terms — they aren’t in our dataset.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="p-3">Fork the website</td>
                  <td className="p-3">Code is MIT (keep the notice); content and data are CC0.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span> Why we can release it this way
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            dose.wiki’s pipeline starts from other people’s published pages, so it is fair to ask how we
            can turn around and place the result in the public domain. Here is the reasoning.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <div className={CARD_LABEL_CLASS}>The published text is new writing</div>
              <p className={PROSE_CLASS}>
                Source text exists only in our internal excerpt notes — working material, like a
                researcher’s quotations. The published prose is written fresh under prompts that forbid
                copying sentences, then edited by a human reviewer. The expression is ours.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>Facts are not owned</div>
              <p className={PROSE_CLASS}>
                That a substance was first made in a given year, that a dose range is what it is, that a
                law schedules it — these are facts, and nobody owns facts. Copyright protects expression,
                and ours is original, re-verified against citable references.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>The dataset is our compilation</div>
              <p className={PROSE_CLASS}>
                The schema, the normalization, and the selection and arrangement of every field into one
                consistent structure are dose.wiki’s own work. That compilation is ours to give away.
              </p>
            </Card>
            <Card>
              <div className={CARD_LABEL_CLASS}>So we give away as much as we can</div>
              <p className={PROSE_CLASS}>
                What we own — our writing and our dataset — we release under CC0. What belongs to others —
                the trip reports their authors wrote, and the TripSit and protestkit.eu sections — we
                leave under their own terms and credit honestly. No more, no less.
              </p>
            </Card>
          </div>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span> The licenses in full
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The exact terms for each layer, plus links to the canonical sources.
          </p>

          <details className="theme-card-surface group mt-5 rounded-2xl p-4">
            <summary className="theme-accent-heading cursor-pointer text-sm font-semibold">
              CC0 1.0 Universal — content &amp; data
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                CC0 places a work as completely as possible into the public domain. The person who
                associated the work with this dedication has waived all of their copyright and related
                rights worldwide, to the extent allowed by law. You can copy, modify, distribute, and
                perform the work, even for commercial purposes, all without asking permission. The work is
                provided without warranties of any kind.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Summary and full legal code:{" "}
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

          <details className="theme-card-surface group mt-3 rounded-2xl p-4">
            <summary className="theme-accent-heading cursor-pointer text-sm font-semibold">
              MIT License — source code
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

          <details className="theme-card-surface group mt-3 rounded-2xl p-4">
            <summary className="theme-accent-heading cursor-pointer text-sm font-semibold">
              Trip reports — contributor terms
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                Trip reports are published with the contributors’ permission and are not part of the CC0
                dataset of our own content. Each report on the site carries a marker showing which case it
                falls under.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                <strong>Already on the site (legacy archive):</strong> rights remain with the original
                author — “up to the author.” Free to read and share with credit to the author; any further
                reuse, especially commercial, is at that author’s discretion, so check with them.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                <strong>Submitted through the report form:</strong> dedicated to the{" "}
                <strong>public domain under CC0</strong> by the submitter — reuse freely, including
                commercially, with no attribution required.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Any contributor may ask us to change their credit, relicense, or remove their report at
                any time.
              </p>
            </div>
          </details>

          <details className="theme-card-surface group mt-3 rounded-2xl p-4">
            <summary className="theme-accent-heading cursor-pointer text-sm font-semibold">
              TripSit terms — interaction data
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                TripSit’s combination data is free for <strong>non-commercial</strong> use, with
                attribution and a link back to their combination page or combo.tripsit.me, and a “quick
                reference, do your own research” disclaimer. Commercial use, reselling printed charts, or
                editing the chart require TripSit’s written permission.
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
                ·{" "}
                <a href="https://combo.tripsit.me" target="_blank" rel="noopener noreferrer">
                  combo.tripsit.me
                </a>
              </p>
            </div>
          </details>

          <details className="theme-card-surface group mt-3 rounded-2xl p-4">
            <summary className="theme-accent-heading cursor-pointer text-sm font-semibold">
              ProtestKit terms — reagent test data
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                Reagent results are pulled live from protestkit.eu and remain under ProtestKit’s own
                terms. They are not redistributed in the dose.wiki dataset. Credit protestkit.eu and
                follow their terms when reusing reagent data.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                Source:{" "}
                <a href="https://protestkit.eu" target="_blank" rel="noopener noreferrer">
                  protestkit.eu
                </a>
              </p>
            </div>
          </details>

          <Alert variant="default" className="mt-6">
            <AlertDescription>
              <strong>Want the bigger picture?</strong> See{" "}
              <a href="/docs/how" target="_top">
                how dose.wiki articles are made
              </a>{" "}
              for the full content pipeline, or{" "}
              <a href="/docs/code" target="_top">
                how dose.wiki is built
              </a>{" "}
              for a tour of the codebase.
            </AlertDescription>
          </Alert>

          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              <strong>Not medical advice.</strong> dose.wiki is community harm-reduction information. This
              page governs how you may <em>reuse</em> the material; it is not a safety guarantee. Always
              verify critical information against primary sources before relying on it.
            </AlertDescription>
          </Alert>
        </section>
      </StickyTocLayout>
    </main>
  );
}
