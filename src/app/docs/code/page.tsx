import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { getPublicDataOverview } from "@server/data/publicData";
import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentCard } from "@/components/ui/surface";
import { DocsInline } from "../_components/DocsProse";
import { Mermaid } from "../_components/Mermaid";

import { t } from "@/i18n/server";

const DOCS_CODE_COPY_KEYS = [
  "seo-docs-code-description",
  ...getCopyKeysByPrefix("docs-code-"),
];

export async function generateMetadata() {
  const copy = await getCopyByKeys(DOCS_CODE_COPY_KEYS);

  return buildPublicPageMetadata({
    title: t("How dose.wiki is built"),
    description:
      copy.text("seo-docs-code-description") ||
      t("An educational tour of the dose.wiki codebase: its architecture, data layer, and the systems that power the public site."),
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
  { id: "s9", copyKey: "docs-code-toc-s9", icon: "lucide:film" },
  { id: "s10", copyKey: "docs-code-toc-s10", icon: "lucide:git-branch" },
  { id: "s11", copyKey: "docs-code-toc-s11", icon: "lucide:book-marked" },
  { id: "s12", copyKey: "docs-code-toc-s12", icon: "lucide:compass" },
] as const;

// Mermaid uses fixed palette colors; page labels use theme-aware domain tokens.
const DOMAIN_VAR = {
  blue: "var(--theme-doc-domain-blue)",
  gold: "var(--theme-doc-domain-gold)",
  green: "var(--theme-doc-domain-green)",
  orange: "var(--theme-doc-domain-orange)",
  plum: "var(--theme-doc-domain-plum)",
} as const;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-2 text-sm font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "theme-accent-heading text-2xl font-semibold";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] break-words leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const CARD_TITLE_CLASS = "theme-accent-heading mb-1.5 text-base font-semibold";
const LIST_CLASS = "theme-text-secondary space-y-2 break-words leading-7";
const NODE_LIST_CLASS = "theme-text-secondary space-y-2 leading-7 text-sm";
const CONTENT_CARD_CLASS = "min-w-0 shadow-[var(--theme-elevation-sm)]";
const STAT_NUMBER_CLASS = "theme-accent-heading font-semibold tabular-nums";
const TABLE_WRAP_CLASS = "overflow-hidden rounded-2xl";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TH_CLASS =
  "theme-text-faint bg-dose-surface-muted/55 p-3 text-xs font-semibold uppercase tracking-[0.14em]";
const TABLE_ROW_CLASS =
  "border-b border-dose-border align-top odd:bg-dose-surface-muted/35";
const PRE_CLASS =
  "theme-public-card-subtle theme-text-secondary max-w-full overflow-x-auto rounded-2xl border border-dose-divider p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap shadow-[var(--theme-elevation-inner)] [scrollbar-gutter:stable]";

export default async function DocsCodePage() {
  // The content figures come from the same overview the About page renders, so
  // the two never disagree; the code-size figures below stay hand-maintained.
  const [copy, overview] = await Promise.all([
    getCopyByKeys(DOCS_CODE_COPY_KEYS),
    getPublicDataOverview(),
  ]);
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
            <span className={SECTION_NUM_CLASS}>01</span>{" "}
            {copy.text("docs-code-s1-heading")}
          </h2>

          {/* Flattened from a five-card hero-metric grid to one open figure row:
              plain figure blocks separated by spacing and a leading hairline,
              no per-stat box. The lead stat reads first and largest by type
              scale and weight rather than a bordered accent tile. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-4xl sm:text-5xl`}>
                {overview.substanceCount.toLocaleString()}
              </dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-articles")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>
                {overview.effectCount.toLocaleString()}
              </dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-effects")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-3xl`}>
                {overview.reportCount.toLocaleString()}
              </dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                {copy.text("docs-code-s1-stat-reports")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~1,400</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                <DocsInline>
                  {copy.text("docs-code-s1-stat-src-files")}
                </DocsInline>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={`${STAT_NUMBER_CLASS} text-2xl`}>~700</dt>
              <dd className="theme-text-muted mt-1.5 text-sm leading-6">
                <DocsInline>
                  {copy.text("docs-code-s1-stat-scripts")}
                </DocsInline>
              </dd>
            </div>
          </dl>
          <div role="presentation" className="theme-horizontal-divider mt-6" />

          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s1-body")}</DocsInline>
          </p>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span>{" "}
            {copy.text("docs-code-s2-heading")}
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
              {copy.text("docs-code-s2-legend-data")}
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

          <div className="mt-6 [&_figcaption]:sr-only">
            <Mermaid
              chart={`graph TD
  SRC["Source sites"]:::ext
  AI["OpenRouter AI"]:::ext
  R2["Cloudflare R2<br/>media"]:::ext
  SCRIPTS["Scripts<br/>data pipelines"]:::scripts
  DB[("PlanetScale<br/>Postgres")]:::data
  APP["Next.js app<br/>pages + API routes"]:::pub
  PUBLIC["Public site"]:::pub
  DEV["/dev editor"]:::dev
  AUTH["Editor sign-in"]:::dev

  SRC -->|"parse"| SCRIPTS
  AI -->|"generate"| SCRIPTS
  SCRIPTS -->|"write"| DB
  SCRIPTS -->|"upload"| R2
  DB -->|"read"| APP
  R2 -.->|"media"| PUBLIC
  APP -->|"serve"| PUBLIC
  APP -->|"serve"| DEV
  PUBLIC -->|"submit intake"| APP
  DEV -->|"save edits"| APP
  APP -->|"API writes"| DB
  AUTH -.->|"gate"| DEV

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef scripts fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb
  classDef dev fill:#391a40,stroke:#e879f9,color:#f6e2fa`}
              title="Sources and OpenRouter feed scripts that write to PlanetScale Postgres and upload media to Cloudflare R2. Next.js reads the database and serves the public site and gated /dev editor. Browser submissions and editor saves pass through app API routes; R2 supplies public media."
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
            <span className={SECTION_NUM_CLASS}>03</span>{" "}
            {copy.text("docs-code-s3-heading")}
          </h2>

          {/* Flattened from a six-card grid to one surface of hairline-separated
              definition rows (style-guide §9). Same label/title/body, calmer. */}
          <ContentCard
            variant="subtle"
            padding="lg"
            className="mt-6 divide-y divide-dose-border shadow-[var(--theme-elevation-sm)]"
          >
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-framework-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-framework-title")}
                  </div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>
                  {copy.text("docs-code-s3-framework-body")}
                </DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-database-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-database-title")}
                  </div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>
                  {copy.text("docs-code-s3-database-body")}
                </DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-auth-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-auth-title")}
                  </div>
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
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-ai-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-ai-title")}
                  </div>
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
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-styling-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-styling-title")}
                  </div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>
                  {copy.text("docs-code-s3-styling-body")}
                </DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-media-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-media-title")}
                  </div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>{copy.text("docs-code-s3-media-body")}</DocsInline>
              </p>
            </DefinitionRow>
            <DefinitionRow
              term={
                <div>
                  <div className={CARD_LABEL_CLASS}>
                    {copy.text("docs-code-s3-tooling-label")}
                  </div>
                  <div className={`${CARD_TITLE_CLASS} mb-0`}>
                    {copy.text("docs-code-s3-tooling-title")}
                  </div>
                </div>
              }
            >
              <p className={PROSE_CLASS}>
                <DocsInline>
                  {copy.text("docs-code-s3-tooling-body")}
                </DocsInline>
              </p>
            </DefinitionRow>
          </ContentCard>
        </section>

        <section id="s4" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span>{" "}
            {copy.text("docs-code-s4-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s4-intro")}</DocsInline>
          </p>

          <pre className={`${PRE_CLASS} mt-5`}>
            {`dose.wiki/
├── `}
            <span className="theme-accent-heading font-semibold">src/</span>
            {`                      `}
            <span className="theme-text-faint">· Next.js application</span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">app/</span>
            {`                  `}
            <span className="theme-text-faint">
              · public pages, /dev, API routes
            </span>
            {`
│   ├── `}
            <span className="theme-accent-heading font-semibold">
              features/
            </span>
            {`             `}
            <span className="theme-text-faint">· domain modules</span>
            {`
│   ├── components/           `}
            <span className="theme-text-faint">
              · shared layouts, pages, UI primitives
            </span>
            {`
│   ├── schema/               `}
            <span className="theme-text-faint">· Zod article schemas</span>
            {`
│   ├── data/                 `}
            <span className="theme-text-faint">
              · copy seeds, JSON artifacts, generated maps
            </span>
            {`
│   ├── theme/                `}
            <span className="theme-text-faint">· design tokens</span>
            {`
│   └── middleware.ts         `}
            <span className="theme-text-faint">
              · /dev access and host policies
            </span>
            {`
├── `}
            <span className="font-semibold" style={{ color: DOMAIN_VAR.green }}>
              server/
            </span>
            {`                   `}
            <span className="theme-text-faint">
              · schema.ts and table functions, executed on Postgres
            </span>
            {`
├── `}
            <span
              className="font-semibold"
              style={{ color: DOMAIN_VAR.orange }}
            >
              scripts/
            </span>
            {`                  `}
            <span className="theme-text-faint">
              · data pipelines (section 08)
            </span>
            {`
│   ├── parsers/  batch/  citations/  prepopulate/
│   ├── replications/  contributors/  chemistry/  legality/
│   ├── data-ops/  migrate/  seed/  build/  deploy/  reports/
│   ├── tools/  perf/  config/  eslint-plugins/
│   └── lib/                  `}
            <span className="theme-text-faint">
              · CLI plumbing, OpenRouter client
            </span>
            {`
├── lib/                      `}
            <span className="theme-text-faint">
              · app and script server helpers
            </span>
            {`
│   ├── data/                 `}
            <span className="theme-text-faint">
              · publicData.* database readers
            </span>
            {`
│   ├── next/                 `}
            <span className="theme-text-faint">
              · route loaders, copy blocks, host policies
            </span>
            {`
│   ├── postgres/             `}
            <span className="theme-text-faint">
              · Drizzle schema and native callable runtime
            </span>
            {`
│   └── auth/  http/  og/  citations/  runtime/
├── vendor/openchemlib/       `}
            <span className="theme-text-faint">
              · vendored molecule-rendering fork
            </span>
            {`
├── public/                   `}
            <span className="theme-text-faint">
              · molecule images, flags, favicons
            </span>
            {`
├── docs/                     `}
            <span className="theme-text-faint">
              · architecture docs, ADRs, operations and workflow guides
            </span>
            {`
├── data/  content/           `}
            <span className="theme-text-faint">
              · datasets with licenses, and every authored prose file
            </span>
            {`
└── README.md  ARCHITECTURE.md  CONTRIBUTING.md  AGENTS.md`}
          </pre>

          {/* Demoted from a status-less role=alert callout to emphasized prose. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s4-skills")}</DocsInline>
          </p>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span>{" "}
            {copy.text("docs-code-s5-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s5-intro")}</DocsInline>
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-code-s5-public-routes-label")}
              </div>
              <ul className={`${NODE_LIST_CLASS} list-disc pl-5`}>
                {copy.items("docs-code-s5-public-routes").map((item, i) => (
                  <li key={i}>
                    <DocsInline>{item}</DocsInline>
                  </li>
                ))}
              </ul>
            </ContentCard>
            <ContentCard variant="subtle" className={CONTENT_CARD_CLASS}>
              <div className={CARD_LABEL_CLASS}>
                {copy.text("docs-code-s5-protected-routes-label")}
              </div>
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
              <div
                className={CARD_LABEL_CLASS}
                style={{ color: DOMAIN_VAR.blue }}
              >
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
              <div
                className={CARD_LABEL_CLASS}
                style={{ color: DOMAIN_VAR.gold }}
              >
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
            <span className={SECTION_NUM_CLASS}>06</span>{" "}
            {copy.text("docs-code-s6-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s6-intro")}</DocsInline>
          </p>

          <div className={`${TABLE_WRAP_CLASS} mt-5 border border-dose-border`}>
            <div className={TABLE_SCROLL_CLASS}>
              <table className="w-full table-fixed border-collapse text-left text-sm [overflow-wrap:anywhere] [&_tbody_tr:last-child]:border-b-0">
                <caption className="sr-only">
                  {copy.text("docs-code-s6-heading")}
                </caption>
                <thead>
                  <tr className="border-b border-dose-border">
                    <th scope="col" className={`${TH_CLASS} w-[36%]`}>
                      {copy.text("docs-code-s6-th-table")}
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      {copy.text("docs-code-s6-th-holds")}
                    </th>
                  </tr>
                </thead>
                <tbody className="theme-text-secondary">
                  <tr className="border-b border-dose-border">
                    <th scope="rowgroup" colSpan={2} className={TH_CLASS}>
                      {copy.text("docs-code-s6-group-content")}
                    </th>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>substanceIndex</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-substance-index")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>subjectiveEffects</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-subjective-effects")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>tripReports</code> /{" "}
                      <code>tripReportSubstances</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-trip-reports")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>replications</code> /{" "}
                      <code>effectIndexArticles</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-replications")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>categoryLayout</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-category-layout")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>indexLayouts</code> / <code>siteConfig</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-index-layouts")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>moleculeOverrides</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-molecule-overrides")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>warningBannerPresets</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-warning-banners")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>copyBlocks</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-copy-blocks")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>reagentTests</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-reagent-tests")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>substanceGalleries</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-substance-galleries")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>replicationPlaylists</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-replication-playlists")}
                      </DocsInline>
                    </td>
                  </tr>
                </tbody>
                <tbody className="theme-text-secondary">
                  <tr className="border-b border-dose-border">
                    <th scope="rowgroup" colSpan={2} className={TH_CLASS}>
                      {copy.text("docs-code-s6-group-editorial")}
                    </th>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>tripReportSubmissions</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text(
                          "docs-code-s6-table-trip-report-submissions",
                        )}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>memberships</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-memberships")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>changelog</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-changelog")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>contributorProfiles</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-contributor-profiles")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>articleFeedback</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-article-feedback")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>siteFeedback</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-site-feedback")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>mailingListSubscribers</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-mailing-list")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>moleculeClassTemplates</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text(
                          "docs-code-s6-table-molecule-class-templates",
                        )}
                      </DocsInline>
                    </td>
                  </tr>
                </tbody>
                <tbody className="theme-text-secondary">
                  <tr className="border-b border-dose-border">
                    <th scope="rowgroup" colSpan={2} className={TH_CLASS}>
                      {copy.text("docs-code-s6-group-workflow")}
                    </th>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>articleSources</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-article-sources")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>prompts</code> / <code>quotes</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-prompts-quotes")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>citationEvidence</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-citation-evidence")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>replication*</code> provenance + identity
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-replication-provenance")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>effectIndexArchive</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text("docs-code-s6-table-effect-index-archive")}
                      </DocsInline>
                    </td>
                  </tr>
                  <tr className={TABLE_ROW_CLASS}>
                    <th scope="row" className="p-3 font-normal">
                      <code>generatedPublicationOperations</code>
                    </th>
                    <td className="p-3">
                      <DocsInline>
                        {copy.text(
                          "docs-code-s6-table-generated-publication-operations",
                        )}
                      </DocsInline>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span>{" "}
            {copy.text("docs-code-s7-heading")}
          </h2>

          <div className="mt-6 space-y-6">
            <div className="min-w-0">
              <h3
                className="mb-2 text-lg font-semibold"
                style={{ color: DOMAIN_VAR.blue }}
              >
                {copy.text("docs-code-s7-read-label")}
              </h3>
              <div className="space-y-2">
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
            </div>
            <div className="min-w-0">
              <h3
                className="mb-2 text-lg font-semibold"
                style={{ color: DOMAIN_VAR.blue }}
              >
                {copy.text("docs-code-s7-submit-label")}
              </h3>
              <div className="space-y-2">
                <p className={PROSE_CLASS}>
                  <DocsInline>
                    {copy.text("docs-code-s7-submit-who")}
                  </DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>
                    {copy.text("docs-code-s7-submit-how")}
                  </DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>
                    {copy.text("docs-code-s7-submit-key")}
                  </DocsInline>
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <h3
                className="mb-2 text-lg font-semibold"
                style={{ color: DOMAIN_VAR.gold }}
              >
                {copy.text("docs-code-s7-write-label")}
              </h3>
              <div className="space-y-2">
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-write-who")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-write-how")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>
                    {copy.text("docs-code-s7-write-generation")}
                  </DocsInline>
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <h3
                className="mb-2 text-lg font-semibold"
                style={{ color: DOMAIN_VAR.plum }}
              >
                {copy.text("docs-code-s7-data-label")}
              </h3>
              <div className="space-y-2">
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-data-who")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-data-how")}</DocsInline>
                </p>
                <p className={PROSE_CLASS}>
                  <DocsInline>{copy.text("docs-code-s7-data-key")}</DocsInline>
                </p>
              </div>
            </div>
          </div>

          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s7-licensing")}</DocsInline>
          </p>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span>{" "}
            {copy.text("docs-code-s8-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s8-intro")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s8-writes")}</DocsInline>
          </p>
          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s8-write-records")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s8-families-intro")}</DocsInline>
          </p>
          <ul className={`${LIST_CLASS} mt-3 list-disc pl-5`}>
            {copy.items("docs-code-s8-families").map((item, i) => (
              <li key={i}>
                <DocsInline>{item}</DocsInline>
              </li>
            ))}
          </ul>
          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>
              {copy.text("docs-code-s8-command-registry")}
            </DocsInline>
          </p>

          {/* The content pipeline itself (sources, excerpts, prompts, citation
              passes, human review) lives on /docs/how; this page only points
              at it so the two never drift apart. */}
          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s8-deferral")}</DocsInline>
          </p>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span>{" "}
            {copy.text("docs-code-s9-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s9-intro")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s9-intake")}</DocsInline>
          </p>

          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s9-curation")}</DocsInline>
          </p>

          <div role="presentation" className="theme-horizontal-divider mt-6" />
          <p className={`${PROSE_CLASS} mt-6`}>
            <DocsInline>{copy.text("docs-code-s9-rights")}</DocsInline>
          </p>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span>{" "}
            {copy.text("docs-code-s10-heading")}
          </h2>

          <h3 className="theme-accent-heading mt-5 text-lg font-semibold">
            {copy.text("docs-code-s10-flow-a-heading")}
          </h3>
          <p className={`${PROSE_CLASS} mt-3`}>
            <DocsInline>{copy.text("docs-code-s10-flow-a-intro")}</DocsInline>
          </p>
          <ol
            className={`${LIST_CLASS} mt-4 max-w-[68ch] list-decimal space-y-3 pl-5`}
          >
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-a-step1-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-a-step1-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-a-step2-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-a-step2-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-a-step3-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-a-step3-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-a-step4-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-a-step4-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-a-step5-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-a-step5-body")}
                </DocsInline>
              </p>
            </li>
          </ol>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            {copy.text("docs-code-s10-flow-b-heading")}
          </h3>
          <ol
            className={`${LIST_CLASS} mt-4 max-w-[68ch] list-decimal space-y-3 pl-5`}
          >
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-b-step1-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-b-step1-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-b-step2-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-b-step2-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-b-step3-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-b-step3-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-b-step4-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-b-step4-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-b-step5-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-b-step5-body")}
                </DocsInline>
              </p>
            </li>
          </ol>

          <h3 className="theme-accent-heading mt-7 text-lg font-semibold">
            {copy.text("docs-code-s10-flow-c-heading")}
          </h3>
          <ol
            className={`${LIST_CLASS} mt-4 max-w-[68ch] list-decimal space-y-3 pl-5`}
          >
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step1-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step1-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step2-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step2-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step3-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step3-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step4-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step4-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step5-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step5-body")}
                </DocsInline>
              </p>
            </li>
            <li>
              <h4 className="theme-accent-heading font-semibold">
                {copy.text("docs-code-s10-flow-c-step6-title")}
              </h4>
              <p>
                <DocsInline>
                  {copy.text("docs-code-s10-flow-c-step6-body")}
                </DocsInline>
              </p>
            </li>
          </ol>
        </section>

        <section id="s11" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>11</span>{" "}
            {copy.text("docs-code-s11-heading")}
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
                term={copy.text("docs-code-s11-substance-article-term")}
              >
                <DocsInline>
                  {copy.text("docs-code-s11-substance-article-body")}
                </DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s11-vcode-term")}
              >
                <DocsInline>{copy.text("docs-code-s11-vcode-body")}</DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s11-deployment-term")}
              >
                <DocsInline>
                  {copy.text("docs-code-s11-deployment-body")}
                </DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s11-flavor-term")}
              >
                <DocsInline>
                  {copy.text("docs-code-s11-flavor-body")}
                </DocsInline>
              </DefinitionRow>
              <DefinitionRow
                semantic
                termClassName={`${CARD_TITLE_CLASS} mb-0`}
                bodyClassName={PROSE_CLASS}
                term={copy.text("docs-code-s11-copy-block-term")}
              >
                <DocsInline>
                  {copy.text("docs-code-s11-copy-block-body")}
                </DocsInline>
              </DefinitionRow>
            </DefinitionList>
          </ContentCard>
        </section>

        <section id="s12" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>12</span>{" "}
            {copy.text("docs-code-s12-heading")}
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            <DocsInline>{copy.text("docs-code-s12-intro")}</DocsInline>
          </p>

          <ol className={`${LIST_CLASS} mt-3 list-decimal pl-5`}>
            {copy.items("docs-code-s12-reading-order").map((item, i) => (
              <li key={i}>
                <DocsInline>{item}</DocsInline>
              </li>
            ))}
          </ol>

          <DisclosureCard
            variant="subtle"
            summary={copy.text("docs-code-s12-caveats-summary")}
            className="mt-5"
          >
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-code-s12-caveats-body")}</DocsInline>
            </p>
          </DisclosureCard>
        </section>
      </StickyTocLayout>
    </main>
  );
}
