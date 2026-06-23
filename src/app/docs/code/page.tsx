import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/ui/surface";
import { Mermaid } from "../_components/Mermaid";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How dose.wiki is built",
    description:
      "An educational tour of the dose.wiki codebase: its architecture, data pipeline, and the systems that power the public site.",
    pathname: "/docs/code",
  });
}

const TOC_ITEMS = [
  { id: "s1", label: "1. The big picture", icon: "lucide:telescope" },
  { id: "s2", label: "2. System overview", icon: "lucide:network" },
  { id: "s3", label: "3. Tech stack", icon: "lucide:layers" },
  { id: "s4", label: "4. Repository map", icon: "lucide:folder-tree" },
  { id: "s5", label: "5. Frontend", icon: "lucide:monitor" },
  { id: "s6", label: "6. Convex data layer", icon: "lucide:database" },
  { id: "s7", label: "7. Public vs /dev", icon: "lucide:split" },
  { id: "s8", label: "8. Content pipelines", icon: "lucide:workflow" },
  { id: "s9", label: "9. Two key flows", icon: "lucide:git-branch" },
  { id: "s10", label: "10. Vocabulary", icon: "lucide:book-marked" },
  { id: "s11", label: "11. Where to start", icon: "lucide:compass" },
] as const;

// Diagram palette — these match the Mermaid classDef stroke colours below so the
// legend, card accents, and pipeline steps stay color-consistent with the
// diagrams (whose source is kept verbatim).
const DIAGRAM = {
  blue: "#7dd3fc",
  gold: "#e879f9",
  green: "#6ee7b7",
  orange: "#fdba74",
  plum: "#f9a8d4",
} as const;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-2 text-sm font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "theme-accent-heading text-2xl font-semibold";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] break-words leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const CARD_TITLE_CLASS = "theme-accent-heading mb-1.5 text-base font-semibold";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const NODE_LIST_CLASS = "theme-text-secondary space-y-2 leading-7 text-sm";
const CONTENT_CARD_CLASS = "min-w-0 shadow-sm";
const STAT_CARD_CLASS =
  "flex min-h-[7.5rem] min-w-0 flex-col justify-between shadow-sm";
const STAT_NUMBER_CLASS =
  "theme-accent-heading font-semibold tabular-nums";
const TABLE_WRAP_CLASS = "overflow-hidden rounded-2xl";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TH_CLASS =
  "theme-text-faint bg-dose-surface-muted/55 p-3 text-xs font-semibold uppercase tracking-[0.14em]";
const TABLE_ROW_CLASS =
  "border-b border-dose-border align-top odd:bg-dose-surface-muted/35";
const TABLE_ROW_LAST_CLASS =
  "align-top odd:bg-dose-surface-muted/35";
const TABLE_BADGE_CLASS =
  "border-dose-border bg-dose-surface-muted/45 px-2 py-0.5 text-[10px] tracking-[0.14em] text-dose-text-secondary";
const PRE_CLASS =
  "theme-public-card-subtle theme-text-secondary max-w-full overflow-x-auto rounded-2xl border border-dose-divider p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap shadow-inner [scrollbar-gutter:stable]";
const ARROW_CLASS =
  "theme-text-faint flex items-center justify-center self-center text-base";
const STEP_PANEL_CLASS =
  "min-w-0 border-t shadow-sm";
const DETAILS_SUMMARY_CLASS =
  "theme-accent-heading flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors hover:bg-dose-surface-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong group-open:bg-dose-surface-muted/70 [&::-webkit-details-marker]:hidden";

function StepPanel({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <ContentCard
      variant="subtle"
      padding="sm"
      className={STEP_PANEL_CLASS}
      style={{ borderTopColor: color }}
    >
      {children}
    </ContentCard>
  );
}

function SummaryChevron() {
  return (
    <ChevronRight
      aria-hidden="true"
      className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90"
    />
  );
}

export default function DocsCodePage() {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={<PublicTableOfContents items={[...TOC_ITEMS]} variant="bare" />}
        maxWidthClass="max-w-4xl"
        contentClassName="gap-8"
      >
        <header className="flex flex-col gap-4">
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            dose.wiki — codebase overview
          </h1>
          <p className="theme-text-muted max-w-[68ch] text-base">
            next.js 16 + convex + ai editorial pipelines — written for someone new to the repo
          </p>
          <p className="theme-text-secondary max-w-[68ch] text-[1.0625rem] leading-7">
            dose.wiki is a <strong>harm-reduction encyclopedia</strong>: a public website of substance
            articles, subjective-effect documentation, and trip reports. The repository contains{" "}
            <strong>three systems</strong>: the public Next.js site that renders content, a
            login-protected <code>/dev</code> editing surface where that content is written and cited,
            and a set of command-line pipelines that scrape, generate, and migrate it. All three read
            and write the same <strong>Convex database</strong>, which is the source of truth.
          </p>
        </header>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        <div className="min-[1200px]:hidden">
          <PublicTableOfContents items={[...TOC_ITEMS]} />
        </div>

        <section id="s1" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span>{" "}The big picture in numbers
          </h2>

          <div className="mt-6 grid gap-3 sm:grid-cols-6">
            <ContentCard
              variant="public"
              padding="md"
              className={`${STAT_CARD_CLASS} border-dose-accent-muted sm:col-span-3 lg:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-4xl`}>577</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">
                Substance articles
                <br />
                in Convex
              </div>
            </ContentCard>
            <ContentCard
              variant="subtle"
              padding="md"
              className={`${STAT_CARD_CLASS} sm:col-span-3 lg:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-3xl`}>233</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">Subjective effects</div>
            </ContentCard>
            <ContentCard
              variant="subtle"
              padding="md"
              className={`${STAT_CARD_CLASS} sm:col-span-3 lg:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-3xl`}>163</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">Trip reports</div>
            </ContentCard>
            <ContentCard
              variant="subtle"
              padding="md"
              className={`${STAT_CARD_CLASS} sm:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-2xl`}>~1.9k</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">Prerendered pages</div>
            </ContentCard>
            <ContentCard
              variant="subtle"
              padding="md"
              className={`${STAT_CARD_CLASS} sm:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-2xl`}>698</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">
                TS/TSX files in <code>src/</code>
              </div>
            </ContentCard>
            <ContentCard
              variant="subtle"
              padding="md"
              className={`${STAT_CARD_CLASS} sm:col-span-2`}
            >
              <div className={`${STAT_NUMBER_CLASS} text-2xl`}>322</div>
              <div className="theme-text-muted mt-2 text-sm leading-6">
                Pipeline scripts in <code>scripts/</code>
              </div>
            </ContentCard>
          </div>

          <p className={`${PROSE_CLASS} mt-6`}>
            <strong>Roughly half of this repository is not the website.</strong> The{" "}
            <code>scripts/</code> directory is nearly as large as the app itself, because most content
            is produced by pipelines: scraped from source wikis, drafted by Claude through OpenRouter,
            cited against real literature, and reviewed by a person before publication. Reading{" "}
            <code>src/</code> alone covers the site but not the tooling that fills it.
          </p>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span>{" "}System overview
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Everything flows through <strong>Convex</strong> (a hosted realtime database with
            serverless functions). Content enters via scrapers and AI pipelines, gets edited in{" "}
            <code>/dev</code>, and is read on the public site. The colors below are used the same way
            for the rest of this page.
          </p>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DIAGRAM.blue }}
              />{" "}
              Public site
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DIAGRAM.gold }}
              />{" "}
              /dev editor
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DIAGRAM.green }}
              />{" "}
              Convex data
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DIAGRAM.orange }}
              />{" "}
              Scripts &amp; pipelines
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DIAGRAM.plum }}
              />{" "}
              External / AI services
            </div>
          </div>

          <div className="mt-6">
            <Mermaid
              chart={`graph TD
  SRC["Scraped sources — 10 sites<br/>PsychonautWiki, TripSit, Erowid,<br/>Wikipedia, DrugBank, Isomer Design,<br/>SaferParty, The Drug Classroom,<br/>Disregard Everything I Say,<br/>Drug Users Bible"]:::ext
  AI["OpenRouter AI<br/>Claude Opus 4.5 + Gemini"]:::ext
  SCRIPTS["Data pipelines<br/>scripts/ — parse, generate,<br/>cite, migrate, sync"]:::scripts
  DB[("Convex database<br/>convex/ — substanceIndex,<br/>effects, reports, citations...")]:::data
  APP["Next.js app<br/>src/app/ routes +<br/>src/features/ modules"]:::pub
  PUBLIC["Public site<br/>articles, effects, reports,<br/>search, category indexes"]:::pub
  DEV["/dev editor surface<br/>forms, AI generation,<br/>citation review, layouts"]:::dev
  AUTH["Auth.js + GitHub OAuth<br/>auth.ts + middleware.ts"]:::dev

  SRC -->|"scrape + parse"| SCRIPTS
  AI -->|"drafts sections"| SCRIPTS
  SCRIPTS -->|"writes via admin key"| DB
  DB -->|"queries"| APP
  APP --> PUBLIC
  APP --> DEV
  AUTH -.->|"gates access"| DEV
  DEV -->|"saves via<br/>/api/save-to-convex"| DB
  AI -->|"in-editor<br/>section generation"| DEV

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef scripts fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb
  classDef dev fill:#391a40,stroke:#e879f9,color:#f6e2fa`}
            />
          </div>

          <Alert variant="success" className="mt-5">
            <AlertDescription>
              <strong>There is no separate REST backend.</strong> Convex hosts the database and the
              server functions (<code>convex/*.ts</code>) that read and write it. The Next.js app, the
              editor, and the scripts all talk to the same Convex deployment: the public site reads
              through <code>lib/convex/publicData.ts</code>, the editor writes through the{" "}
              <code>/api/save-to-convex</code> route, and scripts use an admin key.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s3" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span>{" "}Tech stack — what each tool is for
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Framework</div>
              <div className={CARD_TITLE_CLASS}>Next.js 16 + React 19</div>
              <p className={PROSE_CLASS}>
                App Router with <strong>server components by default</strong>: pages fetch data on the
                server and ship mostly-static HTML. ~1,900 pages are prerendered at build time.
                Deployed on <strong>Vercel</strong>.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Database + backend</div>
              <div className={CARD_TITLE_CLASS}>Convex</div>
              <p className={PROSE_CLASS}>
                Hosted document database with TypeScript server functions (queries, mutations). The{" "}
                <code>convex/</code> directory <em>is</em> the backend. Separate dev and production
                deployments, synced by script with confirmation gates.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Auth</div>
              <div className={CARD_TITLE_CLASS}>Auth.js (next-auth) + GitHub OAuth</div>
              <p className={PROSE_CLASS}>
                Configured in <code>auth.ts</code>; <code>middleware.ts</code> walls off{" "}
                <code>/dev</code> and, pre-launch, gates the production hosts (<code>dose.wiki</code>,{" "}
                <code>www.dose.wiki</code>) behind an under-construction homepage. Editor roles (admin
                / editor / viewer) live in the Convex <code>memberships</code> table.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>AI generation</div>
              <div className={CARD_TITLE_CLASS}>OpenRouter SDK</div>
              <p className={PROSE_CLASS}>
                One API gateway to many models. <strong>Claude Opus 4.5</strong> writes article
                sections; <strong>Gemini Flash</strong> handles cheaper jobs like quote extraction.
                Used by both batch scripts and the in-editor section generator.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Styling + UI</div>
              <div className={CARD_TITLE_CLASS}>Tailwind CSS 4 + Radix UI</div>
              <p className={PROSE_CLASS}>
                Utility-first styling with a token-based design system in <code>src/theme/</code>.
                Radix supplies accessible primitives; Framer Motion handles animation; React Hook Form
                drives the editor&apos;s forms.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Tooling + safety</div>
              <div className={CARD_TITLE_CLASS}>Bun, Vitest, Zod</div>
              <p className={PROSE_CLASS}>
                Bun is the package manager. <strong>Zod schemas</strong> (in <code>src/schema/</code>{" "}
                and <code>schemas/</code>) validate every article shape before it is stored or
                rendered, so malformed or AI-mangled content is rejected early. ~131 Vitest test
                files.
              </p>
            </ContentCard>
          </div>
        </section>

        <section id="s4" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span>{" "}Repository map — where things live
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Most of the code lives in four directories: <code>src/</code> (the app),{" "}
            <code>convex/</code> (the backend), <code>scripts/</code> (the pipelines), and{" "}
            <code>lib/</code> (server-side helpers shared between them). Everything else is
            documentation, assets, or configuration.
          </p>

          <pre className={`${PRE_CLASS} mt-5`}>
            {`dose.wiki/
├── `}
            <span className="theme-accent-heading font-semibold">src/</span>
            {`                      `}
            <span className="theme-text-faint">— the Next.js application (698 files)</span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">app/</span>
            {`                  `}
            <span className="theme-text-faint">— App Router: one folder per URL route</span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">features/</span>
            {`             `}
            <span className="theme-text-faint">— article, effects, reports, dev (313 files)</span>
            {`
│   ├── components/           `}
            <span className="theme-text-faint">— shared UI: layout, pages, ui primitives</span>
            {`
│   ├── schema/               `}
            <span className="theme-text-faint">— Zod schemas validating article shapes</span>
            {`
│   ├── data/                 `}
            <span className="theme-text-faint">— local JSON artifacts + generated maps</span>
            {`
│   └── theme/                `}
            <span className="theme-text-faint">— design tokens</span>
            {`
├── `}
            <span
              className="font-semibold"
              style={{ color: DIAGRAM.green }}
            >
              convex/
            </span>
            {`                   `}
            <span className="theme-text-faint">— the backend: schema.ts + one file per table</span>
            {`
├── `}
            <span
              className="font-semibold"
              style={{ color: DIAGRAM.orange }}
            >
              scripts/
            </span>
            {`                  `}
            <span className="theme-text-faint">— data pipelines (322 files; see section 08)</span>
            {`
│   ├── parsers/  batch/  citations/  prepopulate/
│   ├── convex/   migrate/  seed/  build/  analyze/
│   └── lib/                  `}
            <span className="theme-text-faint">— shared CLI plumbing, OpenRouter client</span>
            {`
├── lib/                      `}
            <span className="theme-text-faint">— server-side helpers shared by app + scripts</span>
            {`
│   ├── convex/               `}
            <span className="theme-text-faint">— publicData.ts: how pages read Convex</span>
            {`
│   ├── auth/  http/  next/  citations/  runtime/
├── `}
            <span
              className="font-semibold"
              style={{ color: DIAGRAM.blue }}
            >
              auth.ts
            </span>
            {`  `}
            <span
              className="font-semibold"
              style={{ color: DIAGRAM.blue }}
            >
              middleware.ts
            </span>
            {`   `}
            <span className="theme-text-faint">— sign-in config + /dev gatekeeper</span>
            {`
├── public/                   `}
            <span className="theme-text-faint">
              — molecule images, flags, favicons, SubstanceIndex.json
            </span>
            {`
├── docs/  notes-and-plans/   `}
            <span className="theme-text-faint">— architecture docs, ADRs, plans</span>
            {`
├── .claude/skills/           `}
            <span className="theme-text-faint">— ~25 runbooks for the AI content workflows</span>
            {`
└── README.md  ARCHITECTURE.md  CLAUDE.md  CONTEXT.md`}
          </pre>

          <Alert variant="default" className="mt-5">
            <AlertDescription>
              <strong>One thing you won&apos;t see in most repos:</strong> <code>.claude/skills/</code>{" "}
              holds ~25 markdown runbooks for the AI content tooling — how to run batch section
              generation, the rules the citation workflow must follow, how Convex data changes should
              be handled. Because a lot of text processing here is automated, these procedures are
              written down so every run follows the same rules.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span>{" "}Frontend — routes and feature modules
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The main split: <code>src/app/</code> holds thin <strong>route folders</strong> (one per
            URL, mostly data-fetching and metadata), while <code>src/features/</code> holds the{" "}
            <strong>rendering logic</strong>, grouped by domain. A route file fetches from Convex and
            hands off to a feature module.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>src/app/ — public routes</div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                <li>
                  <code>/[slug]</code> — <strong>a substance article</strong> (the core page)
                </li>
                <li>
                  <code>/substances</code> — browse all substances
                </li>
                <li>
                  <code>/effects</code>, <code>/effect/[slug]</code> — subjective effects
                </li>
                <li>
                  <code>/reports</code> — trip reports
                </li>
                <li>
                  <code>/psychoactive · /chemical · /mechanism · /category</code> — classification
                  indexes
                </li>
                <li>
                  <code>/interactions</code>, <code>/search</code>, <code>/about</code>,{" "}
                  <code>/contributors</code>
                </li>
              </ul>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>src/app/ — protected routes</div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                <li>
                  <code>/dev</code> — editor home (auth required via <code>middleware.ts</code>)
                </li>
                <li>
                  <code>/dev/articles/[slug]</code> — edit a substance
                </li>
                <li>
                  <code>
                    /dev/change-log · tag-editor · index-layout · about · citation-review · profile
                  </code>
                </li>
                <li>
                  <code>/api/save-to-convex</code> — the editor&apos;s main write endpoint
                </li>
                <li>
                  <code>/sign-in</code> — GitHub OAuth entry
                </li>
              </ul>
            </ContentCard>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS} style={{ color: DIAGRAM.blue }}>
                src/features/ — public-facing (3 modules)
              </div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                <li>
                  <strong>
                    <code>article/</code>
                  </strong>{" "}
                  — renders substance articles: dosage tables, duration charts, interaction grids,
                  citation markers
                </li>
                <li>
                  <strong>
                    <code>effects/</code>
                  </strong>{" "}
                  — effect pages, including a custom &quot;VCode&quot; markup renderer for effect
                  descriptions
                </li>
                <li>
                  <strong>
                    <code>reports/</code>
                  </strong>{" "}
                  — trip report pages
                </li>
              </ul>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS} style={{ color: DIAGRAM.gold }}>
                src/features/dev/ — the editor (209 files, the largest module)
              </div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                <li>
                  <strong>
                    <code>forms/</code>
                  </strong>{" "}
                  — one React Hook Form section per article field group
                </li>
                <li>
                  <strong>
                    <code>tools/</code>
                  </strong>{" "}
                  — substance editor + AI section generator, layout editor, citation review, about
                  editor
                </li>
                <li>
                  <strong>
                    <code>save-orchestrator/</code>
                  </strong>{" "}
                  — coordinates multi-endpoint saves
                </li>
                <li>
                  <strong>
                    <code>context/ · notices/ · profile/ · tags/ · prompts/</code>
                  </strong>{" "}
                  — editor state, toasts, profile &amp; tag editing
                </li>
              </ul>
            </ContentCard>
          </div>
        </section>

        <section id="s6" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>06</span>{" "}The Convex data layer — what&apos;s in the
            database
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Each table has a matching <code>{"convex/<table>.ts"}</code> file exporting its queries and
            mutations, with the shapes declared in <code>convex/schema.ts</code>. Three groups: the{" "}
            <strong>content</strong> readers see, the <strong>editorial</strong> records that govern
            who can change it and how, and the <strong>workflow</strong> tables feeding the AI
            pipelines.
          </p>

          <ContentCard
            variant="subtle"
            padding="none"
            className={`${TABLE_WRAP_CLASS} mt-5`}
          >
            <div className={TABLE_SCROLL_CLASS}>
              <table className="min-w-[48rem] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-dose-border">
                    <th className={TH_CLASS}>Table</th>
                    <th className={TH_CLASS}>Group</th>
                    <th className={`${TH_CLASS} min-w-[20rem]`}>What it holds</th>
                    <th className={`${TH_CLASS} text-right`}>Docs</th>
                  </tr>
                </thead>
                <tbody className="theme-text-secondary">
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>substanceIndex</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    The main table: one document per substance with every section — summary, dosage,
                    duration, pharmacology, harm potential, legality, citations, references.
                  </td>
                  <td className="p-3 text-right tabular-nums">577</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>subjectiveEffects</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Effect articles (e.g. &quot;geometry&quot;, &quot;euphoria&quot;) with VCode
                    markup bodies, galleries, and audio replications.
                  </td>
                  <td className="p-3 text-right tabular-nums">233</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>tripReports</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    First-person experience reports linked to substances and doses.
                  </td>
                  <td className="p-3 text-right tabular-nums">163</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>replications</code> / <code>effectIndexArticles</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Effect gallery media (video/image recreations of effects) and methodology
                    articles.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>indexLayouts</code> / <code>siteConfig</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Hand-curated classification trees (psychoactive / chemical / mechanism) and
                    about-page configuration.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>memberships</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Who may edit: email → role (admin / editor / viewer), synced from GitHub OAuth
                    sign-ins.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>changelog</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Audit trail: every editor save records who, when, and a markdown diff. Browsable
                    at <code>/dev/change-log</code>.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>contributorProfiles</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Public bios, aliases, links, and avatars for contributors.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>articleSources</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>workflow</Badge>
                  </td>
                  <td className="p-3">
                    Raw scraped source text per substance, from the ten sites in the source list
                    (section 08) — the input the AI generators quote from.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>prompts</code> / <code>quotes</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>workflow</Badge>
                  </td>
                  <td className="p-3">
                    The editable AI prompts used for section generation, and quotes extracted from
                    sources.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_LAST_CLASS}>
                  <td className="p-3">
                    <code>citationEvidence</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>workflow</Badge>
                  </td>
                  <td className="p-3">
                    The citation audit trail: each claim in an article mapped to reference IDs,
                    supporting quotes, and a review status.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                </tbody>
              </table>
            </div>
          </ContentCard>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span>{" "}Two surfaces, one database
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DIAGRAM.blue }}
              >
                Public site — read path
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <strong>Who:</strong> anyone, no login. Crawlable, SEO-tuned, mostly static.
                  (Pre-launch: the production hosts serve only the under-construction homepage at{" "}
                  <code>/</code>; previews and local dev serve the full site.)
                </p>
                <p className={PROSE_CLASS}>
                  <strong>How it gets data:</strong> server components call{" "}
                  <code>lib/convex/publicData.ts</code>, which queries Convex (read-only URL),
                  validates the result against the Zod schemas, and renders via{" "}
                  <code>src/features/article|effects|reports</code>.
                </p>
                <p className={PROSE_CLASS}>
                  <strong>Key property:</strong> no client-side database access; pages can be
                  prerendered at build time and revalidated when editors save.
                </p>
              </div>
            </ContentCard>
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DIAGRAM.gold }}
              >
                /dev editor — write path
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <strong>Who:</strong> authenticated editors only. <code>middleware.ts</code>{" "}
                  redirects everyone else to <code>/sign-in</code>; the Convex{" "}
                  <code>memberships</code> role decides what they may touch.
                </p>
                <p className={PROSE_CLASS}>
                  <strong>How it writes:</strong> React Hook Form state → the{" "}
                  <code>save-orchestrator</code> → <code>POST /api/save-to-convex</code> (auth +
                  rate-limit checked) → Convex mutations → automatic <code>changelog</code> entry →
                  public pages revalidated.
                </p>
                <p className={PROSE_CLASS}>
                  <strong>Also built in:</strong> an AI section generator — editors can have Claude
                  draft a section from the scraped <code>articleSources</code>, preview it, edit, and
                  save.
                </p>
              </div>
            </ContentCard>
          </div>

          <Alert variant="default" className="mt-5">
            <AlertDescription>
              <strong>There is a third consumer: anyone who wants the raw data.</strong> The About
              page (<code>/about</code>) offers the entire substance database as one file,{" "}
              <code>SubstanceIndex.json</code> (~5&nbsp;MB, served from <code>public/</code>), with a
              one-click download button and a live preview of a sample record (
              <code className="break-all">src/components/pages/AboutArchivePreview.tsx</code>). The intent is to make the
              dataset easy to reuse in other projects and research: Convex stays the live source for
              pages, the JSON is a static snapshot of it, and the content is dedicated to the public
              domain under CC0, so it can be reused freely with no attribution required (see the{" "}
              <a href="/docs/license" target="_top">
                license page
              </a>
              ).
            </AlertDescription>
          </Alert>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span>{" "}Content pipelines — how an article gets built
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Articles are built in stages. Raw wiki text is parsed into structured data, loaded into
            Convex, extended with AI-generated prose, reviewed in <code>/dev</code>, then run through a
            citation workflow that ties each claim to a reference. Each stage is a separate{" "}
            <code>scripts/</code> subdirectory with its own <code>npm run</code> commands.
          </p>

          <Alert variant="default" className="mt-5">
            <AlertDescription>
              <strong>The scraped sources, in full.</strong> The parser registry (
              <code>scripts/parsers/source-identity.ts</code>) covers ten sites:{" "}
              <strong>PsychonautWiki</strong>, <strong>TripSit</strong> (three feeds: factsheets,
              wiki, and the combination guide), <strong>Erowid</strong>, <strong>Wikipedia</strong>,{" "}
              <strong>DrugBank</strong>, <strong>Isomer Design</strong>, <strong>SaferParty</strong>,{" "}
              <strong>The Drug Classroom</strong>, <strong>Disregard Everything I Say</strong>, and the{" "}
              <strong>Drug Users Bible</strong>. A few further sources (Bluelight, D.&nbsp;M.&nbsp;Turner,
              Nervewing, ProtestKit) are stored in the corpus but have no parser. Per repo policy,
              Wikipedia and PsychonautWiki text is used to discover references but is never itself cited
              as claim support on the public site.
            </AlertDescription>
          </Alert>

          <div className="mt-6">
            <Mermaid
              chart={`graph TD
  A["Scraped source text<br/>(10 sites — listed above)"]:::ext
  B["Parse into structured data<br/>scripts/parsers/"]:::scripts
  C["Prepopulate articles<br/>scripts/prepopulate/"]:::scripts
  D[("Convex<br/>substanceIndex +<br/>articleSources")]:::data
  E["AI section drafting<br/>scripts/batch/ — Claude Opus 4.5<br/>summary, legality, harm potential..."]:::scripts
  F["Human review + editing<br/>/dev/articles/[slug]"]:::dev
  G["Citation workflow<br/>scripts/citations/ — adds<br/>[cite:ref-id] markers + evidence"]:::scripts
  H["Workbench review<br/>then apply-workbench --write"]:::dev
  I["Public page<br/>src/app/[slug]"]:::pub

  A --> B
  B --> C
  C -->|"initial articles"| D
  D -->|"extracted quotes + prompts"| E
  E -->|"drafted sections"| F
  F -->|"save"| D
  D --> G
  G --> H
  H -->|"citations applied"| D
  D -->|"render"| I

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef scripts fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb
  classDef dev fill:#391a40,stroke:#e879f9,color:#f6e2fa`}
            />
          </div>

          <p className="theme-accent-heading mt-7 text-lg font-semibold">
            The prompting system, zoomed in (quotes → prompts → sections)
          </p>

          <p className={`${PROSE_CLASS} mt-2`}>
            The &quot;AI section drafting&quot; box above is itself a two-stage process. The full
            scraped articles are too long and too mixed to hand to a model directly, so a cheap model
            first <strong>extracts verbatim excerpts by topic</strong> — copy-pasted text only, no
            paraphrasing — and a stronger model then{" "}
            <strong>writes one section from those excerpts</strong> against a section-specific prompt.
            The generation prompts forbid claims that are not present in the excerpts, which keeps the
            output checkable against its sources.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
            <StepPanel color={DIAGRAM.orange}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 1
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Gather</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Full scraped articles for
                <br />
                one substance, from
                <br />
                <code>articleSources</code>
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden sm:flex`}>→</div>
            <StepPanel color={DIAGRAM.plum}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 2
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Extract quotes</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Gemini Flash + extraction
                <br />
                prompt pulls verbatim,
                <br />
                topic-relevant excerpts
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden sm:flex`}>→</div>
            <StepPanel color={DIAGRAM.green}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 3
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Store</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                One entry per substance ×
                <br />
                topic in the Convex
                <br />
                <code>quotes</code> table
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden sm:flex`}>→</div>
            <StepPanel color={DIAGRAM.plum}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 4
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Generate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Section prompt + that topic&apos;s
                <br />
                quotes → Claude Opus 4.5
                <br />→ YAML section output
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden sm:flex`}>→</div>
            <StepPanel color={DIAGRAM.gold}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 5
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Review</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Editor previews, edits,
                <br />
                and saves in <code>/dev</code>
              </div>
            </StepPanel>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Stage 1–3 — eight quote topics</div>
              <p className={`${PROSE_CLASS} mb-2.5`}>
                Extraction prompts (<code>scripts/prompts/</code>,{" "}
                <code>scripts/batch/extract-quotes/</code>) pull excerpts into eight topic buckets,
                defined in <code>lib/quoteSections.js</code>:
              </p>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>Intro text · Harm potential · Pharmacology</li>
                <li>History &amp; culture · Dosage &amp; duration</li>
                <li>Tolerance · Legality · Subjective effects</li>
              </ul>
              <p className={`${PROSE_CLASS} mt-2.5`}>
                The rules are strict: verbatim text only, complete paragraphs, keep formatting, and
                when in doubt include rather than drop.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>Stage 4 — eleven section prompts</div>
              <p className={`${PROSE_CLASS} mb-2.5`}>
                Each article section has its own markdown prompt in{" "}
                <code>src/data/config/sectionPrompts/</code> — base, summary, dosage/duration,
                pharmacology, subjective effects, interactions, harm potential, tolerance, legality,
                history &amp; culture, identification. They range from 2.5&nbsp;KB (base) to 32&nbsp;KB
                (pharmacology).
              </p>
              <p className={PROSE_CLASS}>
                Each one fixes the style, an evidence-only constraint, a YAML output shape, worked
                examples, and a validation checklist. The repo files are seeds; the live copies sit in
                the Convex <code>prompts</code> table and are editable in the <code>/dev</code> prompt
                workspace (registry: <code>src/data/config/promptRegistry.ts</code>).
              </p>
            </ContentCard>
          </div>

          <details className="theme-public-card-subtle group mt-5 rounded-2xl p-2 sm:p-3">
            <summary className={DETAILS_SUMMARY_CLASS}>
              Read a stage-1 prompt verbatim — legality quote extraction (2.9 KB)
              <SummaryChevron />
            </summary>
            <div className="mt-3">
              <p className={`${PROSE_CLASS} mb-3 text-sm`}>
                Unedited contents of <code>scripts/prompts/legality-extraction.md</code>. This is the
                instruction set the extraction model receives along with the full source text.
              </p>
              <pre className={PRE_CLASS}>{`# Legality Extraction Prompt

You are extracting legality-related content from source articles about a psychoactive substance.

## Task
Extract ALL verbatim text related to legal status, scheduling, and regulatory information from the provided source content.

## What to Extract

### International Status
- UN Convention classifications (1961, 1971, 1988)
- International scheduling (Schedule I, II, III, IV)
- WHO recommendations
- International treaties and agreements
- INCB (International Narcotics Control Board) status

### Country-Specific Legal Status
For each country mentioned, extract:
- Legal/illegal status
- Schedule/Class classification (e.g., Schedule I, Class A, Tabelle I, Anlage I)
- Controlled substance designation
- Prescription status
- Possession limits and thresholds
- Penalties for possession, sale, manufacture
- Decriminalization status
- Medical/research exemptions
- Recent legal changes
- Regional variations (states, territories, provinces)

### Historical Legal Context
- When the substance was first scheduled
- Legal history timeline
- Changes in legal status over time
- Reasons for scheduling
- Analog act coverage (e.g., Federal Analogue Act)

### Legal Terminology Reference

**US Scheduling:**
- Schedule I - High abuse potential, no accepted medical use
- Schedule II - High abuse potential, accepted medical use
- Schedule III - Moderate abuse potential
- Schedule IV - Low abuse potential
- Schedule V - Lowest abuse potential

**UK Classification:**
- Class A - Most harmful (heroin, cocaine, LSD, MDMA)
- Class B - Less harmful (cannabis, amphetamines)
- Class C - Least harmful of controlled (benzos, GHB)

**German Classification:**
- Anlage I - Not marketable, no medical use
- Anlage II - Marketable but not prescribable
- Anlage III - Prescribable controlled substances

**UN Conventions:**
- 1961 Single Convention - Narcotics (opioids, cannabis, coca)
- 1971 Convention on Psychotropic Substances - Psychedelics, stimulants, sedatives
- 1988 Convention - Precursors and trafficking

## Extraction Rules
1. Extract COMPLETE paragraphs and sections - do not truncate mid-sentence
2. Preserve all markdown formatting (headers, lists, bold, etc.)
3. Include surrounding context when legal information is embedded in other text
4. When in doubt, INCLUDE the content - it's better to have too much than miss critical legal info
5. Do NOT paraphrase - extract verbatim text only
6. Extract from ALL sources that contain legal content

## Output Format

For each source that has legal content, output:

\`\`\`
## Source: {Source Name}

{verbatim extracted text}

---
\`\`\`

If a source has NO legal content, output:

\`\`\`
## Source: {Source Name}

*No legality content found.*

---
\`\`\`

## Important
Legal information is CRITICAL for user safety. Be thorough and extract everything even tangentially related to legal status, penalties, or scheduling.`}</pre>
            </div>
          </details>

          <details className="theme-public-card-subtle group mt-3 rounded-2xl p-2 sm:p-3">
            <summary className={DETAILS_SUMMARY_CLASS}>
              Read a stage-4 prompt verbatim — summary section generation (4.8 KB)
              <SummaryChevron />
            </summary>
            <div className="mt-3">
              <p className={`${PROSE_CLASS} mb-3 text-sm`}>
                Unedited contents of <code>src/data/config/sectionPrompts/summary.md</code>. The model
                receives this plus the extracted quotes for the substance; the larger prompts
                (pharmacology, harm potential) follow the same structure at more depth.
              </p>
              <pre className={PRE_CLASS}>{`# Summary Section Generation

You are a harm-reduction database assistant generating ONLY the \`summary\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Phenomenologically precise yet accessible
- Clinical but not cold
- Neutral documentation (no advocacy)
- Technical accuracy with readable prose
- Information-dense but well-structured

---

## Critical Constraints

- SYNTHESIZE information from the provided excerpts into original prose
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard technical terminology (chemical names, drug class names) can remain as-is
- Restructure and reframe information in your own voice
- Include ONLY information present in the provided excerpts
- Do not reference or comment on sources; present information directly without meta-commentary

---

## Core Principles

**Evidence Only:** Every claim must be explicitly stated or clearly implied in the source quotes. If information cannot be verified from the provided sources, do not include it.

**Concise Overview:** The summary should be 50-80 words that introduce the substance to someone unfamiliar with it.

**Harm Reduction Focus:** Flag notable safety concerns, common adulterants, or caustic routes of administration when mentioned in sources.

**No Redundancy:** Do not repeat detailed information that belongs in other sections (dosage, duration, pharmacology, etc.). The summary provides context, not exhaustive detail.

---

## Output Format

Return ONLY valid YAML for this exact structure (no markdown code fences, no commentary):

\`\`\`yaml
summary: ""
\`\`\`

---

## Field Definition

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`summary\` | \`string\` | 50-80 word overview paragraph | See examples below |

---

## What to Include

The summary should briefly cover:
1. **What it is**: Chemical class and/or common name
2. **Psychoactive class**: Primary effects category (psychedelic, stimulant, etc.)
3. **Brief history/origin**: When first synthesized, by whom, or traditional use
4. **Notable characteristics**: What distinguishes it from similar substances
5. **Key safety notes**: Common adulterants, caustic routes, or other prominent warnings (if applicable)

---

## What NOT to Include

- Specific dosage numbers (belongs in \`dosage\` section)
- Duration timelines (belongs in \`duration\` section)
- Detailed mechanism of action (belongs in \`pharmacology\` section)
- Legal status details (belongs in \`legality\` section)
- Exhaustive effect lists (belongs in \`subjective_effects\` section)

---

## Example Outputs

### Example 1: Classic Psychedelic

\`\`\`yaml
summary: "LSD (lysergic acid diethylamide) is a semisynthetic psychedelic of the lysergamide class. First synthesized by Albert Hofmann in 1938, its psychoactive properties were discovered in 1943. LSD is known for producing profound alterations in perception, thought, and mood, with effects lasting 8-12 hours. It remains one of the most potent psychoactive substances known, active in the microgram range."
\`\`\`

### Example 2: Research Chemical with Safety Note

\`\`\`yaml
summary: "25I-NBOMe is a synthetic psychedelic of the substituted phenethylamine class, specifically an N-benzylated derivative of the 2C-x family. First synthesized in 2003, it gained notoriety as a dangerous LSD adulterant. Unlike classical psychedelics, 25I-NBOMe has been associated with fatalities at recreational doses and is notably caustic when insufflated, causing severe nasal damage."
\`\`\`

### Example 3: Dissociative

\`\`\`yaml
summary: "Ketamine is an arylcyclohexylamine dissociative originally developed as an anesthetic in 1962. It produces dose-dependent effects ranging from mild dissociation to complete anesthetic states. Ketamine has gained attention for its rapid-acting antidepressant properties and is used clinically for treatment-resistant depression. Chronic use is associated with urinary tract damage."
\`\`\`

---

## Validation Checklist

Before returning output:
- [ ] Summary is 50-80 words
- [ ] YAML is valid (no tabs, proper quoting)
- [ ] No markdown code fences in output
- [ ] No commentary or explanation, just YAML
- [ ] Content derived only from provided sources
- [ ] Does not duplicate detailed content from other sections
- [ ] Includes safety warnings if mentioned prominently in sources`}</pre>
            </div>
          </details>

          <p className="theme-accent-heading mt-7 text-lg font-semibold">
            The citation workflow, zoomed in (scripts/citations/)
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <StepPanel color={DIAGRAM.green}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 1
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Pick sections</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                6 citable sections:
                <br />
                summary, pharmacology,
                <br />
                tolerance, harm, history, legality
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.orange}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 2
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Section workers</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Parallel AI workers
                <br />
                (batches of ≤3) find real
                <br />
                references per claim
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.orange}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 3
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Insert markers</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>[cite:ref-id]</code> markers only —
                <br />
                article text must stay
                <br />
                byte-identical otherwise
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.plum}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 4
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Validation gate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Six-section status check;
                <br />
                every marker must map
                <br />
                to evidence + quotes
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.gold}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 5
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Human workbench</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Draft reviewed externally,
                <br />
                then applied with
                <br />
                <code>--write</code> confirmation
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.green}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                STAGE 6
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Stored</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                References on the article,
                <br />
                audit trail in
                <br />
                <code>citationEvidence</code>
              </div>
            </StepPanel>
          </div>

          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <strong>The marker-only contract</strong> is the strictest rule in the repo: citation
              tooling may add <code>[cite:reference-id]</code> markers to the six citable sections, but
              must not change any other byte of article text. Wikipedia and PsychonautWiki may be used
              to find references but are never themselves cited as claim support. Both rules are
              written into <code>CLAUDE.md</code> and checked by the validation gate.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span>{" "}Two flows worth tracing
          </h2>

          <p className="theme-accent-heading mt-5 text-lg font-semibold">
            Flow A — a reader opens dose.wiki/lsd
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <StepPanel color={DIAGRAM.blue}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                1
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Route</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>src/app/[slug]/page.tsx</code>
                <br />
                server component runs
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.green}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                2
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Fetch</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>lib/convex/publicData.ts</code>
                <br />
                queries <code>substanceIndex.getBySlug</code>
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.blue}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                3
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Validate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Zod schema check from
                <br />
                <code>src/schema/</code>
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.blue}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                4
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Render</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>src/features/article/</code>
                <br />
                sections, tables, citations
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.blue}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                5
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Serve</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Mostly-static HTML;
                <br />
                prerendered when possible
              </div>
            </StepPanel>
          </div>

          <p className="theme-accent-heading mt-7 text-lg font-semibold">
            Flow B — an editor saves an article in /dev
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <StepPanel color={DIAGRAM.gold}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                1
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Edit</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                React Hook Form state in
                <br />
                <code>src/features/dev/forms/</code>
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.gold}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                2
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Orchestrate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>save-orchestrator/</code>
                <br />
                collects dirty articles
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.plum}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                3
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Gate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>/api/save-to-convex</code>:
                <br />
                auth role + rate limit +
                <br />
                Zod contract checks
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.green}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                4
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Mutate</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                <code>substanceIndex.saveSubstance</code>
                <br />+ auto <code>changelog</code> entry
              </div>
            </StepPanel>
            <div className={`${ARROW_CLASS} hidden lg:flex`}>→</div>
            <StepPanel color={DIAGRAM.blue}>
              <div className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.18em]">
                5
              </div>
              <div className="theme-accent-heading mt-1 text-sm font-semibold">Refresh</div>
              <div className="theme-text-muted mt-1 text-sm leading-6">
                Public paths revalidated;
                <br />
                toast confirms the save
              </div>
            </StepPanel>
          </div>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span>{" "}Recurring vocabulary
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>Substance article</div>
              <p className={PROSE_CLASS}>
                The central data object: one large structured document per drug, with ~15 sections
                (dosage, duration, pharmacology, legality...). Defined by Zod schemas in{" "}
                <code>src/schema/</code>, stored in <code>substanceIndex</code>.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>Citable sections</div>
              <p className={PROSE_CLASS}>
                The six prose sections allowed to carry citations: <code>summary</code>,{" "}
                <code>pharmacology</code>, <code>tolerance</code>, <code>harm_potential</code>,{" "}
                <code>history_culture</code>, <code>legality</code>. Everything else (dosage tables
                etc.) is structured data, not cited prose.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>Workbench</div>
              <p className={PROSE_CLASS}>
                An external review staging area for citation drafts. The pipeline exports a task, the
                draft is reviewed outside the repo, then <code>citations:apply-workbench</code> writes
                the approved result back to Convex.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>VCode</div>
              <p className={PROSE_CLASS}>
                A custom markup format used for subjective-effect article bodies, stored alongside a
                parsed AST and rendered by <code>src/features/effects/</code>.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>Prepopulate vs. generate</div>
              <p className={PROSE_CLASS}>
                <strong>Prepopulate</strong> = deterministic import of parsed source data
                (high-confidence facts like dosage tables). <strong>Generate</strong> = AI-drafted
                prose sections that always pass through human review.
              </p>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_TITLE_CLASS}>Dev vs. production Convex</div>
              <p className={PROSE_CLASS}>
                Two separate Convex deployments. Day-to-day work hits dev;{" "}
                <code>npm run convex:sync-production</code> promotes data with explicit confirmation
                gates, and <code>convex:export</code> snapshots production to local JSON.
              </p>
            </ContentCard>
          </div>
        </section>

        <section id="s11" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>11</span>{" "}Where to start reading
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>A reasonable reading order for a first session:</p>

          <ol className={`${LIST_CLASS} mt-3 list-decimal pl-5`}>
            <li>
              <strong>
                <code>README.md</code> and <code>ARCHITECTURE.md</code>
              </strong>{" "}
              — the maintainers&apos; own orientation docs, covering routes, npm scripts, and system
              layout.
            </li>
            <li>
              <strong>
                <code>convex/schema.ts</code>
              </strong>{" "}
              — the data model that everything else is built around. Skim the{" "}
              <code>substanceIndex</code> table definition first.
            </li>
            <li>
              <strong>
                <code>src/app/[slug]/page.tsx</code> → <code>lib/convex/publicData.ts</code> →{" "}
                <code>src/features/article/</code>
              </strong>{" "}
              — Flow A from section 09; this covers the whole public read path.
            </li>
            <li>
              <strong>
                <code>middleware.ts</code> + <code>auth.ts</code>
              </strong>{" "}
              — short files that show how <code>/dev</code> is protected and how roles work.
            </li>
            <li>
              <strong>
                <code>src/features/dev/save-orchestrator/</code> and{" "}
                <code>src/app/api/save-to-convex/</code>
              </strong>{" "}
              — Flow B; how edits land in the database with an audit trail.
            </li>
            <li>
              <strong>
                <code>scripts/lib/workflow-command-surface.mjs</code>
              </strong>{" "}
              — the registry of pipeline commands; from here you can find whichever pipeline (batch,
              citations, migrate, sync) you need.
            </li>
          </ol>

          <details className="theme-public-card-subtle group mt-5 rounded-2xl p-2 sm:p-3">
            <summary className={DETAILS_SUMMARY_CLASS}>
              Caveats about this page
              <SummaryChevron />
            </summary>
            <div className="mt-3">
              <p className={PROSE_CLASS}>
                Counts (577 substances, 698 files, etc.) are a snapshot as of June 2026 and will
                drift. Some operational detail — exact sync gating, the full citation validation
                rules, rate-limit policies — is simplified here; <code>CLAUDE.md</code>,{" "}
                <code>CONTEXT.md</code>, and <code>docs/architecture/</code> in the repo are the
                authoritative versions.
              </p>
            </div>
          </details>

          <Alert variant="default" className="mt-6">
            <AlertDescription>
              <strong>Want the content side?</strong> This page covers the codebase. For a detailed
              walkthrough of how each article is created, from scraping and quote extraction through AI
              synthesis, citations, and human review, read{" "}
              <a href="/docs/how" target="_top">
                How dose.wiki articles are made
              </a>
              .
            </AlertDescription>
          </Alert>
        </section>
      </StickyTocLayout>
    </main>
  );
}
