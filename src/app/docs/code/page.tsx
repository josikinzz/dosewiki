import { Children, type ReactNode } from "react";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { DefinitionList, DefinitionRow } from "@/components/common/DefinitionList";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
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
  { id: "s1", label: "01 · The big picture in numbers", icon: "lucide:telescope" },
  { id: "s2", label: "02 · System overview", icon: "lucide:network" },
  { id: "s3", label: "03 · Tech stack", icon: "lucide:layers" },
  { id: "s4", label: "04 · Repository map", icon: "lucide:folder-tree" },
  { id: "s5", label: "05 · Frontend", icon: "lucide:monitor" },
  { id: "s6", label: "06 · The Convex data layer", icon: "lucide:database" },
  { id: "s7", label: "07 · Two surfaces, one database", icon: "lucide:split" },
  { id: "s8", label: "08 · Content pipelines", icon: "lucide:workflow" },
  { id: "s9", label: "09 · Two flows worth tracing", icon: "lucide:git-branch" },
  { id: "s10", label: "10 · Recurring vocabulary", icon: "lucide:book-marked" },
  { id: "s11", label: "11 · Where to start reading", icon: "lucide:compass" },
] as const;

// Diagram palette reference — the five domain hues are written verbatim into the
// Mermaid classDef strokes below (blue #7dd3fc public, gold #e879f9 /dev,
// green #6ee7b7 Convex, orange #fdba74 scripts, plum #f9a8d4 external/AI). Those
// raw hexes live ONLY inside <Mermaid> because the chart source is kept verbatim.
// Every other surface that mirrors the same five domains (legend dots, repo-tree
// labels, card labels, step chips) uses the theme-aware --theme-doc-domain-*
// tokens instead, so the hues darken/desaturate in light mode.

// Theme-aware equivalents of the five domain hues now live in the shared theme
// layer as --theme-doc-domain-* (src/styles/site-colors.css + the docDomain
// group in theme-token-interface.json): equal-lightness OKLCH per domain,
// lighter/lower-chroma in dark mode and deeper in light mode so colored text and
// chips keep contrast on near-white cards. The five hues stay recognizably
// blue/gold/green/orange/plum in both themes.

// Maps a domain key to its theme-aware page-chrome token.
const DOMAIN_VAR = {
  blue: "var(--theme-doc-domain-blue)",
  gold: "var(--theme-doc-domain-gold)",
  green: "var(--theme-doc-domain-green)",
  orange: "var(--theme-doc-domain-orange)",
  plum: "var(--theme-doc-domain-plum)",
} as const;

type DomainKey = keyof typeof DOMAIN_VAR;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-2 text-sm font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "theme-accent-heading text-2xl font-semibold";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] break-words leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const CARD_TITLE_CLASS = "theme-accent-heading mb-1.5 text-base font-semibold";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const NODE_LIST_CLASS = "theme-text-secondary space-y-2 leading-7 text-sm";
const CONTENT_CARD_CLASS = "min-w-0 shadow-[var(--theme-elevation-sm)]";
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
  "theme-public-card-subtle theme-text-secondary max-w-full overflow-x-auto rounded-2xl border border-dose-divider p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap shadow-[var(--theme-elevation-inner)] [scrollbar-gutter:stable]";
const STEP_PANEL_CLASS = "w-full min-w-0 shadow-[var(--theme-elevation-sm)]";
const STEP_BODY_CLASS = "theme-text-muted mt-2.5 text-sm leading-6";

// A pipeline / flow step. The domain colour now lives in a small leading chip
// carrying the step marker rather than a top-border accent stripe, which removes
// the templated stripe-card look and reads as a quieter, more compact artifact
// than the heavyweight Mermaid diagrams above it.
function StepPanel({
  domain,
  step,
  title,
  children,
}: {
  domain: DomainKey;
  step: string;
  title: string;
  children: ReactNode;
}) {
  const accent = DOMAIN_VAR[domain];
  return (
    <ContentCard variant="subtle" padding="sm" className={STEP_PANEL_CLASS}>
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums"
          style={{
            color: accent,
            backgroundColor: `color-mix(in oklch, ${accent} 16%, var(--theme-surface-muted))`,
          }}
        >
          {step}
        </span>
        <span className="theme-accent-heading text-sm font-semibold leading-tight">
          {title}
        </span>
      </div>
      <div className={STEP_BODY_CLASS}>{children}</div>
    </ContentCard>
  );
}

// Flow strips: step cards in a wrapping grid (never more than three per row)
// with badge connectors floating in the grid gaps. The column count is fixed
// per breakpoint (1 / sm:2 / lg:3), so each card knows whether its successor
// sits to the right (arrow badge in the column gap) or on the next row (a
// typewriter-return badge under the row-ending card). Connectors survive
// wrapping, which is what lets long flows stop cramming onto a single row.
const FLOW_BADGE_CLASS =
  "theme-text-muted absolute z-10 h-6 w-6 items-center justify-center rounded-full border border-dose-card-border bg-dose-surface shadow-[var(--theme-elevation-sm)]";

function FlowConnector({ index, total }: { index: number; total: number }) {
  if (index === total - 1) return null;
  const smRowEnd = (index + 1) % 2 === 0;
  const lgRowEnd = (index + 1) % 3 === 0;
  const rightClass = smRowEnd
    ? lgRowEnd
      ? null
      : "hidden lg:flex"
    : lgRowEnd
      ? "hidden sm:flex lg:hidden"
      : "hidden sm:flex";
  const wrapClass = smRowEnd
    ? lgRowEnd
      ? "hidden sm:flex"
      : "hidden sm:flex lg:hidden"
    : lgRowEnd
      ? "hidden lg:flex"
      : null;
  return (
    <>
      <span
        aria-hidden="true"
        className={`${FLOW_BADGE_CLASS} -bottom-7 left-1/2 flex -translate-x-1/2 sm:hidden`}
      >
        <Icon icon="lucide:arrow-down" size={13} />
      </span>
      {rightClass ? (
        <span
          aria-hidden="true"
          className={`${FLOW_BADGE_CLASS} -right-7 top-1/2 -translate-y-1/2 ${rightClass}`}
        >
          <Icon icon="lucide:arrow-right" size={13} />
        </span>
      ) : null}
      {wrapClass ? (
        <span
          aria-hidden="true"
          className={`${FLOW_BADGE_CLASS} -bottom-7 left-1/2 -translate-x-1/2 ${wrapClass}`}
        >
          <Icon icon="lucide:corner-down-left" size={13} />
        </span>
      ) : null}
    </>
  );
}

function FlowGrid({ children, className }: { children: ReactNode; className?: string }) {
  const steps = Children.toArray(children);
  return (
    <div
      className={`grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3${className ? ` ${className}` : ""}`}
    >
      {steps.map((step, index) => (
        <div key={index} className="relative flex">
          {step}
          <FlowConnector index={index} total={steps.length} />
        </div>
      ))}
    </div>
  );
}

export default function DocsCodePage() {
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
        contentClassName="gap-8"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={[...TOC_ITEMS]} />

        <header className="flex flex-col gap-4">
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            dose.wiki — codebase overview
          </h1>
          <p className="theme-text-muted max-w-[68ch] text-base">
            Next.js 16 + Convex + AI editorial pipelines — written for someone new to the repository
          </p>
          <p className="theme-text-secondary max-w-[68ch] text-[1.0625rem] leading-7">
            dose.wiki is a <strong>harm-reduction encyclopedia</strong>: a public website of substance
            articles, subjective-effect documentation, and trip reports. The repository contains{" "}
            <strong>three systems</strong>. The public Next.js site renders content. The
            login-protected <code>/dev</code> editor is where editors write and cite that content.
            Command-line pipelines scrape, generate, and migrate it. All three read and write the same{" "}
            <strong>Convex database</strong>, which is the source of truth.
          </p>
        </header>

        <section id="s1" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span>{" "}The big picture in numbers
          </h2>

          {/* Flattened from a six-card hero-metric grid to one open figure row:
              plain figure blocks separated by spacing and a leading hairline,
              no per-stat box. The lead stat reads first and largest by type
              scale and weight rather than a bordered accent tile. */}
          <div
            role="presentation"
            className="theme-horizontal-divider mt-6"
          />
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-4xl sm:text-5xl`}>~580</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                Substance articles in Convex
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>~230</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">Subjective effects</dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>~160</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">Trip reports</dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~1.9k</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">Prerendered pages</dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~900</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                TS/TSX files in <code>src/</code>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~400</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                Pipeline scripts in <code>scripts/</code>
              </dd>
            </div>
          </dl>
          <div
            role="presentation"
            className="theme-horizontal-divider mt-6"
          />

          <p className={`${PROSE_CLASS} mt-6`}>
            <strong>Roughly half of this repository is not the website.</strong> The{" "}
            <code>scripts/</code> directory is nearly as large as the app itself, because pipelines
            produce most content. Scripts scrape content from source wikis. Claude generates prose through
            OpenRouter. A citation workflow ties claims to real literature, and a person reviews
            everything before publication. If you read only <code>src/</code>, you see the site but not
            the tooling that fills it.
          </p>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span>{" "}System overview
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Everything flows through <strong>Convex</strong> (a hosted realtime database with
            serverless functions). Content enters through scrapers and AI pipelines. Editors change it
            in <code>/dev</code>. The public site reads it. The colors below keep the same meaning for
            the rest of this page.
          </p>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.blue }}
              />{" "}
              Public site
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.gold }}
              />{" "}
              /dev editor
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.green }}
              />{" "}
              Convex data
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.orange }}
              />{" "}
              Scripts &amp; pipelines
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.plum }}
              />{" "}
              External / AI services
            </div>
          </div>

          <div className="mt-6">
            <Mermaid
              chart={`graph TD
  SRC["Scraped sources — 10 sites<br/>(listed in section 08)"]:::ext
  AI["OpenRouter AI<br/>Claude · Gemini · DeepSeek"]:::ext
  SCRIPTS["Data pipelines<br/>scripts/ — parse, generate,<br/>cite, migrate, sync"]:::scripts
  DB[("Convex database<br/>convex/ — substanceIndex,<br/>effects, reports, citations...")]:::data
  APP["Next.js app<br/>src/app/ routes +<br/>src/features/ modules"]:::pub
  PUBLIC["Public site<br/>articles, effects, reports,<br/>search, category indexes"]:::pub
  DEV["/dev editor<br/>forms, AI generation,<br/>citation review, layouts"]:::dev
  AUTH["Auth.js editor sign-in<br/>auth.ts + middleware.ts"]:::dev

  SRC -->|"scrape + parse"| SCRIPTS
  AI -->|"generates sections"| SCRIPTS
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
              title="System overview: scraped sources and OpenRouter AI feed the data pipelines, which write to the Convex database read by the Next.js app, the public site, and the /dev editor"
            />
          </div>

          <Alert variant="success" className="mt-5">
            <AlertDescription>
              <strong>There is no separate REST backend.</strong> Convex hosts the database and the
              server functions (<code>convex/*.ts</code>) that read and write it. The Next.js app, the{" "}
              <code>/dev</code> editor, and the scripts all connect to the same Convex deployment. The
              public site reads through <code>lib/convex/publicData.ts</code>. The <code>/dev</code>{" "}
              editor writes through the <code>/api/save-to-convex</code> route. Scripts use an admin
              key.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s3" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span>{" "}Tech stack — what each tool is for
          </h2>

          {/* Flattened from a six-card grid to one surface of hairline-separated
              definition rows (style-guide §9). Same label/title/body, calmer. */}
          <ContentCard variant="subtle" padding="lg" className="mt-6 divide-y divide-dose-border shadow-[var(--theme-elevation-sm)]">
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>Framework</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>Next.js 16 + React 19</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                App Router with <strong>server components by default</strong>: pages fetch data on the
                server and serve mostly-static HTML, prerendered at build time wherever possible.
                The app deploys on <strong>Vercel</strong>.
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>Database + backend</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>Convex</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                Hosted document database with TypeScript server functions (queries, mutations). The{" "}
                <code>convex/</code> directory <em>is</em> the backend. Every environment — local
                dev, previews, production — targets the single production deployment{" "}
                (<code>glad-minnow-656</code>); the dev deployment is retired (see <code>AGENTS.md</code>).
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>Auth</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>Auth.js (next-auth) + GitHub OAuth</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <code>auth.ts</code> configures sign-in. <code>middleware.ts</code> protects{" "}
                <code>/dev</code> and, before launch, the production hosts (section 07). Editor roles
                (admin / editor / viewer) live in the Convex <code>memberships</code> table.
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>AI generation</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>OpenRouter SDK</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                One API gateway to many models, chosen per job in each pipeline&apos;s{" "}
                <code>cli.mjs</code>: <strong>Claude Opus 4.6</strong> (summary, pharmacology),{" "}
                <strong>Claude Opus 4.5</strong> (harm potential, history &amp; culture, legality,
                tolerance), <strong>Claude Haiku 4.5</strong> (dosage &amp; duration),{" "}
                <strong>Gemini 3 Flash</strong> (quote extraction), and{" "}
                <strong>DeepSeek V4 Pro</strong> (formal citations). Both the batch scripts and the
                in-editor section generator use it.
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>Styling + UI</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>Tailwind CSS 4 + Radix UI</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                Utility-first styling with a token-based design system in <code>src/theme/</code>.
                Radix supplies accessible primitives. Framer Motion handles animation. React Hook Form
                drives the forms in the editor.
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>Tooling + safety</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>Bun, Vitest, Zod</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                Bun is the package manager. <strong>Zod schemas</strong> (in <code>src/schema/</code>{" "}
                and <code>schemas/</code>) validate every article shape before the app stores or
                renders it, so the app rejects malformed or AI-mangled content early. The repository
                has ~475 Vitest test files.
              </p>
            </DefinitionRow>
          </ContentCard>
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
            <span className="theme-text-faint">— the Next.js application (~900 files)</span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">app/</span>
            {`                  `}
            <span className="theme-text-faint">— App Router: one folder per URL route</span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">features/</span>
            {`             `}
            <span className="theme-text-faint">— article, effects, reports, dev (~420 files)</span>
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
              style={{ color: DOMAIN_VAR.green }}
            >
              convex/
            </span>
            {`                   `}
            <span className="theme-text-faint">— the backend: schema.ts + one file per table</span>
            {`
├── `}
            <span
              className="font-semibold"
              style={{ color: DOMAIN_VAR.orange }}
            >
              scripts/
            </span>
            {`                  `}
            <span className="theme-text-faint">— data pipelines (~400 files; see section 08)</span>
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
              style={{ color: DOMAIN_VAR.blue }}
            >
              auth.ts
            </span>
            {`  `}
            <span
              className="font-semibold"
              style={{ color: DOMAIN_VAR.blue }}
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
            <span className="theme-text-faint">— ~45 runbooks for the AI content workflows</span>
            {`
└── README.md  ARCHITECTURE.md  CLAUDE.md  CONTEXT.md`}
          </pre>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <code>.claude/skills/</code> holds ~45 markdown runbooks for the AI content tooling. Most
            repositories do not have this directory. The runbooks describe how to run batch section
            generation, the rules that the citation workflow must obey, and the rules for Convex data
            changes. Much of the text processing here is automated, so the runbooks record these
            procedures and every run follows the same rules.
          </p>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span>{" "}Frontend — routes and feature modules
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The code splits two ways. <code>src/app/</code> holds thin <strong>route folders</strong>{" "}
            (one per URL, mostly data-fetching and metadata). <code>src/features/</code> holds the{" "}
            <strong>rendering logic</strong>, grouped by domain. A route file fetches from Convex and
            passes the data to a feature module.
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
                <li>
                  <code>/open-data</code> — the three dataset JSON downloads (section 07), reached
                  from the <code>/data</code> Open Data &amp; Tools tab
                </li>
                <li>
                  <code>/replications</code>, <code>/articles</code>, <code>/chemical-classes</code>,{" "}
                  <code>/mantras</code>, <code>/blog</code>, <code>/documentation-style-guide</code>{" "}
                  — media gallery, articles, class pages, mandala, announcements, contributor style
                  guide
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
                  <code>/api/save-to-convex</code> — the main write endpoint for the editor
                </li>
                <li>
                  <code>/sign-in</code> — Auth.js sign-in entry
                </li>
              </ul>
            </ContentCard>
          </div>
          <p className={`${PROSE_CLASS} mt-4`}>
            One codebase builds two publications — <strong>dose.wiki</strong> and the{" "}
            <strong>Effect Index</strong> sister site — selected at build time by{" "}
            <code>NEXT_PUBLIC_SITE_FLAVOR</code>. The route tree therefore also holds Effect Index
            surfaces; which ones render depends on the flavor (<code>src/config/siteFlavor.ts</code>).
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS} style={{ color: DOMAIN_VAR.blue }}>
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
              <div className={CARD_LABEL_CLASS} style={{ color: DOMAIN_VAR.gold }}>
                src/features/dev/ — the editor (~210 files, the largest module)
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
            <span className={SECTION_NUM_CLASS}>06</span>{" "}The Convex data layer — what is in the
            database
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Each table has a matching <code>{"convex/<table>.ts"}</code> file that exports its queries
            and mutations. <code>convex/schema.ts</code> declares the shapes. There are three groups:
            content, editorial, and workflow. Readers see the <strong>content</strong>. The{" "}
            <strong>editorial</strong> records control who can change it and how. The{" "}
            <strong>workflow</strong> tables feed the AI pipelines.
          </p>

          {/* Flattened: the table is its own bounded surface (header tint, row
              borders, odd-row tint), so it no longer sits inside a frosted card.
              A single rounded overflow wrapper + token border keeps the corners
              and horizontal scroll without a second card chrome layer. */}
          <div className={`${TABLE_WRAP_CLASS} mt-5 border border-dose-border`}>
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
                  <td className="p-3 text-right tabular-nums">~580</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>subjectiveEffects</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Effect articles (for example &quot;geometry&quot; and &quot;euphoria&quot;) with
                    VCode markup bodies, galleries, and audio replications.
                  </td>
                  <td className="p-3 text-right tabular-nums">~230</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>tripReports</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Trip reports linked to substances and doses.
                  </td>
                  <td className="p-3 text-right tabular-nums">~160</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>tripReportSubmissions</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    The private submission queue from the report form. Editors accept, reject, or
                    promote a submission into <code>tripReports</code> before it goes public.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
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
                    <code>categoryLayout</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    The table that the public <code>/substances</code> page reads: the hand-curated
                    psychoactive index layout. Saves to <code>indexLayouts</code> also update this
                    table, so the page never reads <code>indexLayouts</code> directly.
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
                    <code>moleculeOverrides</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Hand-authored skeletal-diagram fixes from the <code>/dev</code> Molecules editor.
                    When an override is present, the public article uses its SVG instead of the
                    generated one.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>copyBlocks</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Editable site copy, one document per block. The <code>/dev</code> Copy Studio
                    edits it without a deploy.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>reagentTests</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Point-in-time ProtestKit reagent-test results, keyed by substance slug.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>substanceGalleries</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>content</Badge>
                  </td>
                  <td className="p-3">
                    Per-substance curation of the Replication Showcase: a pinned head and a
                    suppression list over <code>replications</code> slugs.
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
                    Who can edit: email → role (admin / editor / viewer), synced from Auth.js
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
                    Audit trail: when an editor saves, the table records who, when, and a markdown
                    diff. Browsable at <code>/dev/change-log</code>.
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
                    <code>articleFeedback</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Private per-article &quot;report an issue / suggest an edit&quot; intake.
                    Editor-only; never rendered publicly.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>siteFeedback</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Private site-wide general feedback intake. Editor-only; never rendered publicly.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>moleculeClassTemplates</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>editorial</Badge>
                  </td>
                  <td className="p-3">
                    Editor-authored plain-scaffold orientation templates for the Molecules editor.
                    Editor-only cosmetics; saving one never changes a published molecule.
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
                    (section 08) — the input that the AI generators quote from.
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
                <tr className={TABLE_ROW_CLASS}>
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
                <tr className={TABLE_ROW_CLASS}>
                  <td className="p-3">
                    <code>effectIndexArchive</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>workflow</Badge>
                  </td>
                  <td className="p-3">
                    Lossless Effect Index source records retained for a future Effect Index
                    deployment. Not part of any dose.wiki read path.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                <tr className={TABLE_ROW_LAST_CLASS}>
                  <td className="p-3">
                    <code>generatedPublicationOperations</code>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={TABLE_BADGE_CLASS}>workflow</Badge>
                  </td>
                  <td className="p-3">
                    Successful reviewed section publications. The proposal ID is the idempotency
                    boundary for applying a generated section.
                  </td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span>{" "}Two surfaces, one database
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DOMAIN_VAR.blue }}
              >
                Public site — read path
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <strong>Who:</strong> anyone, no login. The site is crawlable, SEO-tuned, and mostly
                  static. (Before launch, the production hosts serve only the under-construction
                  homepage at <code>/</code>. Previews and local dev serve the full site.)
                </p>
                <p className={PROSE_CLASS}>
                  <strong>How it reads:</strong> server components read Convex through{" "}
                  <code>lib/convex/publicData.ts</code> (read-only URL). Flow A in section 09 traces
                  this path step by step.
                </p>
                <p className={PROSE_CLASS}>
                  <strong>Key property:</strong> there is no client-side database access. The build
                  can prerender pages. When an editor saves, the app revalidates them.
                </p>
              </div>
            </ContentCard>
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DOMAIN_VAR.gold }}
              >
                /dev editor — write path
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <strong>Who:</strong> authenticated editors only. <code>middleware.ts</code>{" "}
                  redirects everyone else to <code>/sign-in</code>. The Convex{" "}
                  <code>memberships</code> role decides what an editor can change.
                </p>
                <p className={PROSE_CLASS}>
                  <strong>How it writes:</strong> through the <code>save-orchestrator</code> and the{" "}
                  <code>/api/save-to-convex</code> route. Flow B in section 09 traces this path step
                  by step.
                </p>
                <p className={PROSE_CLASS}>
                  Source-backed generation runs only through authenticated local batch workflows.
                  The <code>/dev</code> editor supports manual review and editing without exposing
                  scraped source text in the browser.
                </p>
              </div>
            </ContentCard>
          </div>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <strong>There is a third consumer: anyone who wants the raw data.</strong> The{" "}
            <code>/open-data</code> route serves three datasets as JSON downloads —{" "}
            <code>SubstanceIndex.json</code>, <code>EffectIndex.json</code>, and{" "}
            <code>TripReports.json</code> — each with a per-dataset license envelope, linked from the{" "}
            <code>/data</code> Open Data &amp; Tools tab. Convex stays the live source for pages; the
            routes serve daily snapshots read from it. The base data is CC0, but each dataset is
            &quot;mixed&quot; — the substance index keeps TripSit&apos;s terms on its{" "}
            <code>interactions</code> field, the effect index references third-party replication
            media, and legacy trip reports keep their authors&apos; rights (see the{" "}
            <a href="/docs/license" target="_top" className={proseLinkClassName}>
              license page
            </a>
            ).
          </p>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span>{" "}Content pipelines — how the pipelines build an article
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The pipelines build articles in stages. Parsers turn raw wiki text into structured data.
            Scripts load it into Convex and extend it with AI-generated prose. Editors review it in{" "}
            <code>/dev</code>. Then a citation workflow ties each claim to a reference. Each stage is
            a separate <code>scripts/</code> subdirectory with its own <code>npm run</code> commands.
          </p>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <strong>The scraped sources, in full.</strong> The parser registry (
            <code>scripts/parsers/source-identity.ts</code>) covers ten sites:{" "}
            <strong>PsychonautWiki</strong>, <strong>TripSit</strong> (three feeds: factsheets,
            wiki, and the combination guide), <strong>Erowid</strong>, <strong>Wikipedia</strong>,{" "}
            <strong>DrugBank</strong>, <strong>Isomer Design</strong>, <strong>SaferParty</strong>,{" "}
            <strong>The Drug Classroom</strong>, <strong>Disregard Everything I Say</strong>, and the{" "}
            <strong>Drug Users Bible</strong>. The corpus also stores a few further sources
            (Bluelight, D.&nbsp;M.&nbsp;Turner, Nervewing, ProtestKit) that have no parser.
          </p>

          <div className="mt-6">
            <Mermaid
              chart={`graph TD
  A["Scraped source text<br/>(10 sites — listed above)"]:::ext
  B["Parse into structured data<br/>scripts/parsers/"]:::scripts
  C["Prepopulate articles<br/>scripts/prepopulate/"]:::scripts
  D[("Convex<br/>substanceIndex +<br/>articleSources")]:::data
  E["AI section generation<br/>scripts/batch/ — per-section<br/>Claude models"]:::scripts
  F["Human review + editing<br/>/dev/articles/[slug]"]:::dev
  G["Citation workflow<br/>scripts/citations/ — adds<br/>[cite:ref-id] markers + evidence"]:::scripts
  H["Workbench review<br/>then apply-workbench --write<br/>--confirm-citation-write"]:::dev
  I["Public page<br/>src/app/[slug]"]:::pub

  A --> B
  B --> C
  C -->|"initial articles"| D
  D -->|"extracted quotes + prompts"| E
  E -->|"generated sections"| F
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
              title="Content pipeline: scraping through parsing, prepopulation, AI generation, human review, citation workflow, and the public page"
            />
          </div>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            The prompting system, in detail (quotes → prompts → sections)
          </h3>

          <p className={`${PROSE_CLASS} mt-2`}>
            The &quot;AI section generation&quot; box above is itself a two-stage process. The full
            scraped articles are too long and too mixed to give to a model directly. First, an
            extraction pass <strong>copies verbatim excerpts out of the sources, by topic</strong>.
            Then a stronger model <strong>writes one section from those excerpts</strong>, against a
            section-specific prompt that forbids claims not found in them. This section covers where
            the pieces live in the repository.
          </p>

          <FlowGrid className="mt-6">
            <StepPanel domain="orange" step="1" title="Gather">
              Full scraped articles for one substance, from{" "}
              <code>articleSources</code>
            </StepPanel>
            <StepPanel domain="plum" step="2" title="Extract quotes">
              Block-selection extraction copies verbatim, topic-relevant
              excerpts
            </StepPanel>
            <StepPanel domain="green" step="3" title="Store">
              One entry per substance × topic in the Convex <code>quotes</code>{" "}
              table
            </StepPanel>
            <StepPanel domain="plum" step="4" title="Generate">
              Section prompt + quotes for that topic → per-section Claude model → YAML
              section output
            </StepPanel>
            <StepPanel domain="gold" step="5" title="Review">
              Editor previews, edits, and saves in <code>/dev</code>
            </StepPanel>
          </FlowGrid>

          {/* Flattened: the two sequential prompt tiers (extraction, then
              section generation) share one surface with a divider instead of a
              two-up card pair. */}
          <ContentCard variant="subtle" padding="lg" className="mt-6 shadow-[var(--theme-elevation-sm)]">
            <div className={CARD_LABEL_CLASS}>Stage 1–3 — eight quote topics</div>
            <p className={`${PROSE_CLASS} mb-2.5`}>
              Extraction prompts (<code>scripts/prompts/</code>,{" "}
              <code>scripts/batch/extract-quotes/</code>) pull excerpts into eight topic buckets,
              defined in <code>lib/quoteSections.mjs</code>:
            </p>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>Intro text · Harm potential · Pharmacology</li>
              <li>History &amp; culture · Dosage &amp; duration</li>
              <li>Tolerance · Legality · Subjective effects</li>
            </ul>
            <div role="presentation" className="theme-horizontal-divider my-5" />

            <div className={CARD_LABEL_CLASS}>Stage 4 — eleven section prompts</div>
            <p className={`${PROSE_CLASS} mb-2.5`}>
              Each article section has its own markdown prompt in{" "}
              <code>src/data/config/sectionPrompts/</code> — base, summary, dosage/duration,
              pharmacology, subjective effects, interactions, harm potential, tolerance, legality,
              history &amp; culture, identification. They range from 4&nbsp;KB (base) to 28&nbsp;KB
              (pharmacology).
            </p>
            <p className={PROSE_CLASS}>
              The repository files are seeds. The live copies sit in the Convex <code>prompts</code> table,
              and editors can change them in the <code>/dev</code> prompt workspace (registry:{" "}
              <code>src/data/config/promptRegistry.ts</code>).
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <a href="/docs/how" target="_top" className={proseLinkClassName}>
              How dose.wiki articles are made
            </a>{" "}
            publishes every prompt unedited — the eight extraction prompts and the section prompts. It
            also documents the block-selection contract that keeps extraction verbatim, and the audit
            that enforces it. That page is the canonical copy of the pipeline instructions.
          </p>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            The citation workflow, in detail (scripts/citations/)
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="green" step="1" title="Pick sections">
              The six citable sections: summary, pharmacology, tolerance, harm
              potential, history &amp; culture, legality
            </StepPanel>
            <StepPanel domain="orange" step="2" title="Section workers">
              Parallel AI workers (batches of ≤3) find real references per
              claim
            </StepPanel>
            <StepPanel domain="orange" step="3" title="Insert markers">
              <code>[cite:ref-id]</code> markers only — article text must stay
              byte-identical otherwise
            </StepPanel>
            <StepPanel domain="plum" step="4" title="Validation gate">
              Six-section status check; every marker must map to evidence +
              quotes
            </StepPanel>
            <StepPanel domain="gold" step="5" title="Human workbench">
              A person reviews the draft outside the repository. Then the pipeline applies it with{" "}
              <code>--write --confirm-citation-write</code>
            </StepPanel>
            <StepPanel domain="green" step="6" title="Stored">
              References on the article, audit trail in{" "}
              <code>citationEvidence</code>
            </StepPanel>
          </FlowGrid>

          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <strong>The marker-only contract</strong> is the strictest rule in the repository.
              Citation tooling can add <code>[cite:reference-id]</code> markers to the six citable
              sections, but must not change any other byte of article text. The tooling can use
              Wikipedia and PsychonautWiki to find references. It never cites them as claim support.{" "}
              <code>CLAUDE.md</code> records both rules, and the validation gate enforces them.
            </AlertDescription>
          </Alert>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span>{" "}Two flows worth tracing
          </h2>

          <h3 className="theme-accent-heading mt-5 text-lg font-semibold">
            Flow A — a reader opens dose.wiki/lsd
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="blue" step="1" title="Route">
              <code>src/app/[slug]/page.tsx</code> server component runs
            </StepPanel>
            <StepPanel domain="green" step="2" title="Fetch">
              <code>lib/convex/publicData.ts</code> queries{" "}
              <code>substanceIndex.getBySlug</code>
            </StepPanel>
            <StepPanel domain="blue" step="3" title="Validate">
              Zod schema validation from <code>src/schema/</code>
            </StepPanel>
            <StepPanel domain="blue" step="4" title="Render">
              <code>src/features/article/</code> sections, tables, citations
            </StepPanel>
            <StepPanel domain="blue" step="5" title="Serve">
              Mostly-static HTML, prerendered when possible
            </StepPanel>
          </FlowGrid>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            Flow B — an editor saves an article in /dev
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="gold" step="1" title="Edit">
              React Hook Form state in <code>src/features/dev/forms/</code>
            </StepPanel>
            <StepPanel domain="gold" step="2" title="Orchestrate">
              <code>save-orchestrator/</code> collects dirty articles
            </StepPanel>
            <StepPanel domain="plum" step="3" title="Gate">
              <code>/api/save-to-convex</code>: auth role + rate limit + Zod
              contract validation
            </StepPanel>
            <StepPanel domain="green" step="4" title="Mutate">
              <code>substanceIndex.saveSubstance</code> + auto{" "}
              <code>changelog</code> entry
            </StepPanel>
            <StepPanel domain="blue" step="5" title="Refresh">
              The app revalidates the public paths. A toast confirms the save
            </StepPanel>
          </FlowGrid>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span>{" "}Recurring vocabulary
          </h2>

          {/* Flattened from a six-card glossary grid to one surface of
              hairline-separated term/definition rows (style-guide §9). */}
          <ContentCard
            variant="subtle"
            padding="lg"
            asChild
            className={`mt-6 divide-y divide-dose-border ${CONTENT_CARD_CLASS}`}
          >
            <DefinitionList>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="Substance article"
              >
                The central data object: one large structured document per drug, with ~15 sections
                (dosage, duration, pharmacology, legality, and more). Defined by Zod schemas in{" "}
                <code>src/schema/</code>, stored in <code>substanceIndex</code>.
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="Citable sections"
              >
                The six prose sections allowed to carry citations: <code>summary</code>,{" "}
                <code>pharmacology</code>, <code>tolerance</code>, <code>harm_potential</code>,{" "}
                <code>history_culture</code>, <code>legality</code>. Everything else (for example,
                dosage tables) is structured data, not cited prose.
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="Workbench"
              >
                A staging area for external review of citation drafts. The pipeline exports a task, and
                a person reviews the draft outside the repository. Then <code>citations:apply-workbench --
                --write --confirm-citation-write</code> writes the approved result back to Convex —
                both flags are required.
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="VCode"
              >
                A custom markup format used for subjective-effect article bodies, stored alongside a
                parsed AST and rendered by <code>src/features/effects/</code>.
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="Prepopulate vs. generate"
              >
                <strong>Prepopulate</strong> = deterministic import of parsed source data
                (high-confidence facts like dosage tables). <strong>Generate</strong> = AI-generated
                prose sections that a person always reviews.
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term="Convex deployment"
              >
                One production deployment (<code>glad-minnow-656</code>). All environments — local
                dev, previews, production — read and write it directly; the old dev deployment is
                retired. Treat every Convex write as a production write (see <code>AGENTS.md</code>).
              </DefinitionRow>
            </DefinitionList>
          </ContentCard>
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
              — the orientation docs from the maintainers. They cover routes, npm scripts, and system
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
              — Flow A from section 09. This flow covers the whole public read path.
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
              — Flow B. These files show how edits reach the database with an audit trail.
            </li>
            <li>
              <strong>
                <code>scripts/lib/workflow-command-surface.mjs</code>
              </strong>{" "}
              — the registry of pipeline commands. From here you can find whichever pipeline (batch,
              citations, migrate, sync) you need.
            </li>
          </ol>

          <DisclosureCard
            variant="subtle"
            summary="Caveats about this page"
            className="mt-5"
          >
            <p className={PROSE_CLASS}>
              Counts (substances, files, tests) are point-in-time snapshots and will drift — prefer
              the live tree over the printed number (e.g.{" "}
              <code>find src -name &apos;*.ts&apos; | wc -l</code>). This page also simplifies
              operational detail — the full citation validation rules, rate-limit policies.{" "}
              <code>AGENTS.md</code>, <code>CLAUDE.md</code>, <code>CONTEXT.md</code>, and{" "}
              <code>docs/architecture/</code> in the repository are the authoritative versions.
            </p>
          </DisclosureCard>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <strong>Do you want the content side?</strong> This page covers the codebase. To see the
            full pipeline — scraping, quote extraction, AI synthesis, citations, and human review —
            read{" "}
            <a href="/docs/how" target="_top" className={proseLinkClassName}>
              How dose.wiki articles are made
            </a>
            .
          </p>
        </section>
      </StickyTocLayout>
    </main>
  );
}
