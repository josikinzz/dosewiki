import { Children, type ReactNode } from "react";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
import { DefinitionList, DefinitionRow } from "@/components/common/DefinitionList";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { Icon } from "@/components/common/Icon";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/ui/surface";
import { DocsInline } from "../_components/DocsProse";
import { Mermaid } from "../_components/Mermaid";

export async function generateMetadata() {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "How dose.wiki is built",
    description:
      copy.text("seo-docs-code-description") ||
      "An educational tour of the dose.wiki codebase: its architecture, data pipeline, and the systems that power the public site.",
    pathname: "/docs/code",
  });
}

const TOC_ITEMS = [
  { id: "s1", copyKey: "docs-code-toc-s1", icon: "lucide:telescope" },
  { id: "s2", copyKey: "docs-code-toc-s2", icon: "lucide:network" },
  { id: "s3", copyKey: "docs-code-toc-s3", icon: "lucide:layers" },
  { id: "s4", copyKey: "docs-code-toc-s4", icon: "lucide:folder-tree" },
  { id: "s5", copyKey: "docs-code-toc-s5", icon: "lucide:monitor" },
  { id: "s6", copyKey: "docs-code-toc-s6", icon: "lucide:database" },
  { id: "s7", copyKey: "docs-code-toc-s7", icon: "lucide:split" },
  { id: "s8", copyKey: "docs-code-toc-s8", icon: "lucide:workflow" },
  { id: "s9", copyKey: "docs-code-toc-s9", icon: "lucide:git-branch" },
  { id: "s10", copyKey: "docs-code-toc-s10", icon: "lucide:book-marked" },
  { id: "s11", copyKey: "docs-code-toc-s11", icon: "lucide:compass" },
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

export default async function DocsCodePage() {
  const copy = await getCopy();
  const tocItems = TOC_ITEMS.map(({ id, icon, copyKey }) => ({
    id,
    icon,
    label: copy.text(copyKey),
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
        contentClassName="gap-8"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={tocItems} />

        <header className="flex flex-col gap-4">
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {copy.text("docs-code-header-title")}
          </h1>
          <p className="theme-text-muted max-w-[68ch] text-base">
            {copy.text("docs-code-header-tagline")}
          </p>
          <p className="theme-text-secondary max-w-[68ch] text-[1.0625rem] leading-7">
            <DocsInline>{copy.text("docs-code-header-intro")}</DocsInline>
          </p>
        </header>

        <section id="s1" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span>{" "}{copy.text("docs-code-s1-heading")}
          </h2>

          {/* Flattened from a five-card hero-metric grid to one open figure row:
              plain figure blocks separated by spacing and a leading hairline,
              no per-stat box. The lead stat reads first and largest by type
              scale and weight rather than a bordered accent tile. */}
          <div
            role="presentation"
            className="theme-horizontal-divider mt-6"
          />
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-4xl sm:text-5xl`}>~580</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-articles")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>~230</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-effects")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>~160</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-reports")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~900</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                <DocsInline>{copy.text("docs-code-s1-stat-src-files")}</DocsInline>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~400</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                <DocsInline>{copy.text("docs-code-s1-stat-scripts")}</DocsInline>
              </dd>
            </div>
          </dl>
          <div
            role="presentation"
            className="theme-horizontal-divider mt-6"
          />

          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s1-body")}</DocsInline>
          </p>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span>{" "}{copy.text("docs-code-s2-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s2-intro")}</DocsInline>
          </p>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.blue }}
              />{" "}
              {copy.text("docs-code-s2-legend-public")}
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.gold }}
              />{" "}
              {copy.text("docs-code-s2-legend-dev")}
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.green }}
              />{" "}
              {copy.text("docs-code-s2-legend-convex")}
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.orange }}
              />{" "}
              {copy.text("docs-code-s2-legend-scripts")}
            </div>
            <div className="theme-text-secondary flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: DOMAIN_VAR.plum }}
              />{" "}
              {copy.text("docs-code-s2-legend-external")}
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
              <DocsInline>{copy.text("docs-code-s2-callout")}</DocsInline>
            </AlertDescription>
          </Alert>
        </section>

        <section id="s3" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span>{" "}{copy.text("docs-code-s3-heading")}
          </h2>

          {/* Flattened from a six-card grid to one surface of hairline-separated
              definition rows (style-guide §9). Same label/title/body, calmer. */}
          <ContentCard variant="subtle" padding="lg" className="mt-6 divide-y divide-dose-border shadow-[var(--theme-elevation-sm)]">
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-framework-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-framework-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-framework-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-database-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-database-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-database-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-auth-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-auth-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-auth-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-ai-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-ai-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-ai-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-styling-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-styling-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-styling-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s3-tooling-label")}</div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>{copy.text("docs-code-s3-tooling-title")}</div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-tooling-body")}</DocsInline>
              </p>
            </DefinitionRow>
          </ContentCard>
        </section>

        <section id="s4" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span>{" "}{copy.text("docs-code-s4-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s4-intro")}</DocsInline>
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
├── .agents/skills/legality-pi/`}
            <span className="theme-text-faint">— Pi legality research workflow</span>
            {`
└── README.md  ARCHITECTURE.md  CLAUDE.md  CONTEXT.md`}
          </pre>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s4-skills")}</DocsInline>
          </p>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span>{" "}{copy.text("docs-code-s5-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s5-intro")}</DocsInline>
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s5-public-routes-label")}</div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                {copy.items("docs-code-s5-public-routes").map((item, i) => (
                  <li key={i}>
                    <DocsInline>{item}</DocsInline>
                  </li>
                ))}
              </ul>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s5-protected-routes-label")}</div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                {copy.items("docs-code-s5-protected-routes").map((item, i) => (
                  <li key={i}>
                    <DocsInline>{item}</DocsInline>
                  </li>
                ))}
              </ul>
            </ContentCard>
          </div>
          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s5-flavor")}</DocsInline>
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS} style={{ color: DOMAIN_VAR.blue }}>
                {copy.text("docs-code-s5-features-public-label")}
              </div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                {copy.items("docs-code-s5-features-public").map((item, i) => (
                  <li key={i}>
                    <DocsInline>{item}</DocsInline>
                  </li>
                ))}
              </ul>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS} style={{ color: DOMAIN_VAR.gold }}>
                {copy.text("docs-code-s5-features-dev-label")}
              </div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                {copy.items("docs-code-s5-features-dev").map((item, i) => (
                  <li key={i}>
                    <DocsInline>{item}</DocsInline>
                  </li>
                ))}
              </ul>
            </ContentCard>
          </div>
        </section>

        <section id="s6" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>06</span>{" "}{copy.text("docs-code-s6-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s6-intro")}</DocsInline>
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
                    <th className={TH_CLASS}>{copy.text("docs-code-s6-th-table")}</th>
                    <th className={TH_CLASS}>{copy.text("docs-code-s6-th-group")}</th>
                    <th className={`${TH_CLASS} min-w-[20rem]`}>{copy.text("docs-code-s6-th-holds")}</th>
                    <th className={`${TH_CLASS} text-right`}>{copy.text("docs-code-s6-th-docs")}</th>
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
                    <DocsInline>{copy.text("docs-code-s6-table-substance-index")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-subjective-effects")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-trip-reports")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-trip-report-submissions")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-replications")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-category-layout")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-index-layouts")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-molecule-overrides")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-copy-blocks")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-reagent-tests")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-substance-galleries")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-memberships")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-changelog")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-contributor-profiles")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-article-feedback")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-site-feedback")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-molecule-class-templates")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-article-sources")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-prompts-quotes")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-citation-evidence")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-effect-index-archive")}</DocsInline>
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
                    <DocsInline>{copy.text("docs-code-s6-table-generated-publication-operations")}</DocsInline>
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
            <span className={SECTION_NUM_CLASS}>07</span>{" "}{copy.text("docs-code-s7-heading")}
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DOMAIN_VAR.blue }}
              >
                {copy.text("docs-code-s7-read-label")}
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-read-who")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-read-how")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-read-key")}</DocsInline>
                </p>
              </div>
            </ContentCard>
            <ContentCard variant="subtle" padding="md" className="min-w-0 flex flex-col">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: DOMAIN_VAR.gold }}
              >
                {copy.text("docs-code-s7-write-label")}
              </div>
              <div className="space-y-4">
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-write-who")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-write-how")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-write-generation")}</DocsInline>
                </p>
              </div>
            </ContentCard>
          </div>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s7-open-data")}</DocsInline>
          </p>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span>{" "}{copy.text("docs-code-s8-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s8-intro")}</DocsInline>
          </p>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s8-sources")}</DocsInline>
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
            {copy.text("docs-code-s8-prompting-heading")}
          </h3>

          <p className={`${PROSE_CLASS} mt-2`}>
            <DocsInline>{copy.text("docs-code-s8-prompting-intro")}</DocsInline>
          </p>

          <FlowGrid className="mt-6">
            <StepPanel domain="orange" step="1" title={copy.text("docs-code-s8-prompting-step1-title")}>
              <DocsInline>{copy.text("docs-code-s8-prompting-step1-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="plum" step="2" title={copy.text("docs-code-s8-prompting-step2-title")}>
              <DocsInline>{copy.text("docs-code-s8-prompting-step2-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="green" step="3" title={copy.text("docs-code-s8-prompting-step3-title")}>
              <DocsInline>{copy.text("docs-code-s8-prompting-step3-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="plum" step="4" title={copy.text("docs-code-s8-prompting-step4-title")}>
              <DocsInline>{copy.text("docs-code-s8-prompting-step4-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="gold" step="5" title={copy.text("docs-code-s8-prompting-step5-title")}>
              <DocsInline>{copy.text("docs-code-s8-prompting-step5-body")}</DocsInline>
            </StepPanel>
          </FlowGrid>

          {/* Flattened: the two sequential prompt tiers (extraction, then
              section generation) share one surface with a divider instead of a
              two-up card pair. */}
          <ContentCard variant="subtle" padding="lg" className="mt-6 shadow-[var(--theme-elevation-sm)]">
            <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s8-stage13-label")}</div>
            <p className={`${PROSE_CLASS} mb-2.5`}>
              <DocsInline>{copy.text("docs-code-s8-stage13-intro")}</DocsInline>
            </p>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              {copy.items("docs-code-s8-stage13-topics").map((item, i) => (
                <li key={i}>
                  <DocsInline>{item}</DocsInline>
                </li>
              ))}
            </ul>
            <div role="presentation" className="theme-horizontal-divider my-5" />

            <div className={CARD_LABEL_CLASS}>{copy.text("docs-code-s8-stage4-label")}</div>
            <p className={`${PROSE_CLASS} mb-2.5`}>
              <DocsInline>{copy.text("docs-code-s8-stage4-prompts")}</DocsInline>
            </p>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-code-s8-stage4-seeds")}</DocsInline>
            </p>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-5`}>
            <DocsInline>{copy.text("docs-code-s8-prompts-published")}</DocsInline>
          </p>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            {copy.text("docs-code-s8-citation-heading")}
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="green" step="1" title={copy.text("docs-code-s8-citation-step1-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step1-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="orange" step="2" title={copy.text("docs-code-s8-citation-step2-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step2-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="orange" step="3" title={copy.text("docs-code-s8-citation-step3-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step3-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="plum" step="4" title={copy.text("docs-code-s8-citation-step4-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step4-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="gold" step="5" title={copy.text("docs-code-s8-citation-step5-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step5-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="green" step="6" title={copy.text("docs-code-s8-citation-step6-title")}>
              <DocsInline>{copy.text("docs-code-s8-citation-step6-body")}</DocsInline>
            </StepPanel>
          </FlowGrid>

          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <DocsInline>{copy.text("docs-code-s8-marker-contract")}</DocsInline>
            </AlertDescription>
          </Alert>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span>{" "}{copy.text("docs-code-s9-heading")}
          </h2>

          <h3 className="theme-accent-heading mt-5 text-lg font-semibold">
            {copy.text("docs-code-s9-flow-a-heading")}
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="blue" step="1" title={copy.text("docs-code-s9-flow-a-step1-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-a-step1-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="green" step="2" title={copy.text("docs-code-s9-flow-a-step2-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-a-step2-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="blue" step="3" title={copy.text("docs-code-s9-flow-a-step3-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-a-step3-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="blue" step="4" title={copy.text("docs-code-s9-flow-a-step4-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-a-step4-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="blue" step="5" title={copy.text("docs-code-s9-flow-a-step5-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-a-step5-body")}</DocsInline>
            </StepPanel>
          </FlowGrid>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            {copy.text("docs-code-s9-flow-b-heading")}
          </h3>
          <FlowGrid className="mt-4">
            <StepPanel domain="gold" step="1" title={copy.text("docs-code-s9-flow-b-step1-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-b-step1-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="gold" step="2" title={copy.text("docs-code-s9-flow-b-step2-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-b-step2-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="plum" step="3" title={copy.text("docs-code-s9-flow-b-step3-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-b-step3-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="green" step="4" title={copy.text("docs-code-s9-flow-b-step4-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-b-step4-body")}</DocsInline>
            </StepPanel>
            <StepPanel domain="blue" step="5" title={copy.text("docs-code-s9-flow-b-step5-title")}>
              <DocsInline>{copy.text("docs-code-s9-flow-b-step5-body")}</DocsInline>
            </StepPanel>
          </FlowGrid>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span>{" "}{copy.text("docs-code-s10-heading")}
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
                term={copy.text("docs-code-s10-substance-article-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-substance-article-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s10-citable-sections-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-citable-sections-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s10-workbench-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-workbench-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s10-vcode-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-vcode-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s10-prepopulate-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-prepopulate-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s10-deployment-term")}
              >
                <DocsInline>{copy.text("docs-code-s10-deployment-body")}</DocsInline>
              </DefinitionRow>
            </DefinitionList>
          </ContentCard>
        </section>

        <section id="s11" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>11</span>{" "}{copy.text("docs-code-s11-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s11-intro")}</DocsInline>
          </p>

          <ol className={`${LIST_CLASS} mt-3 list-decimal pl-5`}>
            {copy.items("docs-code-s11-reading-order").map((item, i) => (
              <li key={i}>
                <DocsInline>{item}</DocsInline>
              </li>
            ))}
          </ol>

          <DisclosureCard
            variant="subtle"
            summary={copy.text("docs-code-s11-caveats-summary")}
            className="mt-5"
          >
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-code-s11-caveats-body")}</DocsInline>
            </p>
          </DisclosureCard>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s11-content-side")}</DocsInline>
          </p>
        </section>
      </StickyTocLayout>
    </main>
  );
}
