import type { ReactNode } from "react";
import { getPublicAboutPreviewSubstances } from "@server/data/publicData";
import { getMoleculePackDownloadStats } from "@server/open-data/downloadStats";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
// Committed copies of the prompts shown on this page. Generation uses editable
// live copies of section prompts, which can differ from these files.
import exDosageDuration from "@content/prompts/extraction/dosage-duration-extraction.md?raw";
import exHarmPotential from "@content/prompts/extraction/harm-potential-extraction.md?raw";
import exHistoryCulture from "@content/prompts/extraction/history-culture-extraction.md?raw";
import exIntro from "@content/prompts/extraction/intro-text-extraction.md?raw";
import exLegality from "@content/prompts/extraction/legality-extraction.md?raw";
import exPharmacology from "@content/prompts/extraction/pharmacology-extraction.md?raw";
import exSubjectiveEffects from "@content/prompts/extraction/subjective-effects-extraction.md?raw";
import exTolerance from "@content/prompts/extraction/tolerance-extraction.md?raw";
import secHarmPotential from "@content/prompts/sections/harmPotential.md?raw";
import secHistoryCulture from "@content/prompts/sections/historyCulture.md?raw";
import secLegality from "@content/prompts/sections/legality.md?raw";
import secPharmacology from "@content/prompts/sections/pharmacology.md?raw";
import secSummary from "@content/prompts/sections/summary.md?raw";
import secTolerance from "@content/prompts/sections/tolerance.md?raw";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import {
  DOC_LIST_CLASS,
  DOC_MINOR_HEADING_CLASS,
  DOC_PROSE_CLASS,
  DOC_SECTION_CLASS,
  DOC_SECTION_HEADING_CLASS,
  DOC_SECTION_NUM_CLASS,
  DOC_SUBHEAD_BASE_CLASS,
  DOC_SUBHEAD_CLASS,
  DOC_TABLE_CLASS,
  DOC_TABLE_HEAD_ROW_CLASS,
  DOC_TABLE_SCROLL_CLASS,
  DOC_TABLE_WRAP_CLASS,
  DOC_TH_CLASS,
  DOC_TR_CLASS,
} from "@/components/common/docProseStyles";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/surface";
import { AboutArchivePreview } from "@/components/pages/AboutArchivePreview";
import { buildAboutPreviewSnapshots } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { Mermaid } from "../_components/Mermaid";

import { t } from "@/i18n/server";

const DOCS_HOW_COPY_KEYS = [
  "seo-docs-how-description",
  ...getCopyKeysByPrefix("docs-how-"),
];

// The sample-record preview and substance count read Postgres; refresh them on the
// same cadence as the About page rather than per request.
export const revalidate = 3600;

export async function generateMetadata() {
  const copy = await getCopyByKeys(DOCS_HOW_COPY_KEYS);

  return buildPublicPageMetadata({
    title: t("How dose.wiki substance articles are made"),
    description:
      copy.text("seo-docs-how-description") ||
      t("A detailed walkthrough of the dose.wiki content pipeline: scraping, quote extraction, AI synthesis, citations, and editorial review."),
    pathname: "/docs/how",
  });
}

// TOC labels are copy blocks (docs-how-toc-<id>); ids and icons stay in code.
const TOC = [
  { id: "made", icon: "lucide:layout-list" },
  { id: "sources", icon: "lucide:database" },
  { id: "pipeline", icon: "lucide:workflow" },
  { id: "parsing", icon: "lucide:globe" },
  { id: "excerpts", icon: "lucide:scissors" },
  { id: "synthesis", icon: "lucide:sparkles" },
  { id: "citations", icon: "lucide:quote" },
  { id: "review", icon: "lucide:user-check" },
  { id: "limits", icon: "lucide:shield-alert" },
  { id: "status", icon: "lucide:map" },
  { id: "dataset", icon: "lucide:download" },
] as const;

const INTRO_QUOTES = `# 2C-B - Intro Text Quotes

> Verbatim extractions from source articles. Generated 2026-01-15.

---

## Source: Disregard Everything I Say

2C-B (4-bromo-2,5-dimethoxyphenethylamine) is a psychedelic phenethylamine of the 2C-x family. It was first synthesized by Alexander Shulgin in 1974.

This substance first saw use among the psychiatric community as an aid during therapy. It was considered one of the best drugs for this purpose because of its short duration, relative absence of side effects, and comparably mild nature.

Like many 2c-x substances, this drug is a highly dose sensitive psychedelic known for its entactogenic effects, bright visuals, and intense body load. This substance is often described by users as feeling half way between LSD and MDMA. Many reports suggest that while 2C-B’s entactogenic effects are less pronounced than MDMA, the visual effects are described as more pronounced and colourful.

---

## Source: Drug Users Bible

- **Common Nomenclature:** 2,5-dimethoxy- 4 - bromophenethylamine
- **Street & Reference Names:** Nexus; Bees; Venus; 2cb

2C-B was first synthesised by Alexander Shulgin in 1974 and became one of his most popular creations. It was initially used in psychiatric therapy, before emerging as a popular recreational drug.

For a period in the late 1980s it was sold as a legal alternative to MDMA, but generally it is now perceived more accurately; as a chemical which induces its own unique experience.

---

## Source: Erowid

2C-B is a synthetic psychedelic that first gained popularity as a legal ecstasy replacement in the mid 1980s. It is generally considered to be somewhat 'gentler' than LSD or mushrooms, being less prone to catalyzing dissociated freak-outs or overwhelming panic attacks at normal recreational doses. 2C-B is also known for the strong body component of its effects which are alternately described as pleasurable energy or a 'sense of being in the body', and by others as an unpleasant 'buzzing' or body-load.

2C-B is sometimes chosen for use in psychedelic psychotherapy because its short duration and less 'pushy' character.

## Chemistry
4-Bromo-2,5-dimethoxybenzeneethanamine (2C-B) is a synthetic chemical in the phenethylamine class. It is related structurally to mescaline, DOB, and distantly to MDMA.

---

## Source: PsychonautWiki

**4-Bromo-2,5-dimethoxyphenethylamine** (also known as **Nexus** , **Bromo Mescaline** , **BDMPEA** , **Venus** , and **2C-B** ) is a novel [psychedelic](https://psychonautwiki.org/wiki/Psychedelic) substance of the [phenethylamine](https://psychonautwiki.org/wiki/Phenethylamine) class. It is perhaps the most well-known member of the [2C-x family](https://psychonautwiki.org/wiki/2C-x_family) , which are structurally related to the classical psychedelic [mescaline](https://psychonautwiki.org/wiki/Mescaline) .

2C-B was discovered in 1974 by the American chemist [Alexander Shulgin](https://psychonautwiki.org/wiki/Alexander_Shulgin) , who was investigating psychedelic phenethylamines derived from [mescaline](https://psychonautwiki.org/wiki/Mescaline) .

User reports have described the effects of 2C-B as moderate, warm, colorful, and highly sensual. Similar to [mescaline](https://psychonautwiki.org/wiki/Mescaline) , it is described as possessing a less serious or grandiose headspace than [tryptamines](https://psychonautwiki.org/wiki/Tryptamines) like [LSD](https://psychonautwiki.org/wiki/LSD) or [psilocybin mushrooms](https://psychonautwiki.org/wiki/Psilocybin_mushrooms) , placing greater emphasis on the visual and tactile domain.

## Chemistry

2C-B, or 2,5-dimethoxy-4-bromophenethylamine, is a [substituted phenethylamine](https://psychonautwiki.org/wiki/Substituted_phenethylamine) .

---

## Source: The Drug Classroom

2C-B is a psychedelic that was created in the 1970s. It’s a member of the 2C family ( [2C-E](http://thedrugclassroom.com/video/2c-e/) , [2C-I](http://thedrugclassroom.com/video/2c-i/) , etc) and along with having psychedelic effects, 2C-B has aphrodisiac qualities.

2C-B = 2,5-dimethoxy-4-bromophenethylamine; Nexus; Eros

---

## Source: TripSit Factsheets

## Classification
- **Categories:** psychedelic, empathogen, common
- **Also known as:** bees, nexus, 2cb, 2cb, 2-cb

---

## Source: TripSit Wiki

**2C-B** is a [psychedelic](https://wiki.tripsit.me/wiki/Psychedelics) drug of the [2C-X family](https://wiki.tripsit.me/wiki/2C-X). Effects are often described as being more easily managed than other psychedelics; it is often compared to a mixture of a LSD and MDMA. 2C-B is also known for the strong body component of its effects.

---

## Source: Wikipedia

2C-B, also known as 4-bromo-2,5-dimethoxyphenethylamine or by names such as Nexus or Erox, is a psychedelic drug of the phenethylamine and 2C families. It is a synthetic analogue of mescaline. The drug is used as a recreational drug and is usually taken orally. 2C-B produces hallucinogenic, mild stimulant, and mild entactogenic-like effects. Its hallucinogenic effects at typical doses are milder than those of other psychedelics like LSD or psilocybin.

2C-B was developed by Alexander Shulgin in 1974 and was described by him in the scientific literature in 1975.`;

// Prompt bodies are bundled from committed files; live section prompts can differ.
// Each import is a literal path so the bundler can trace it; a computed path makes
// Turbopack scan the whole repo.
const withSize = <T extends { body: string }>(entry: T) => ({
  ...entry,
  body: entry.body.trim(),
  sizeLabel: `${Math.max(1, Math.round(entry.body.trim().length / 1024))} KB`,
});

// The eight topic prompts, in pipeline order. Each defines topic relevance,
// source-fidelity rules, and the excerpt-document output format.
const EXTRACTION_PROMPTS = [
  { slug: "intro-text", label: "intro text", body: exIntro },
  { slug: "dosage-duration", label: "dosage & duration", body: exDosageDuration },
  { slug: "subjective-effects", label: "subjective effects", body: exSubjectiveEffects },
  { slug: "pharmacology", label: "pharmacology", body: exPharmacology },
  { slug: "tolerance", label: "tolerance", body: exTolerance },
  { slug: "harm-potential", label: "harm potential", body: exHarmPotential },
  { slug: "history-culture", label: "history & culture", body: exHistoryCulture },
  { slug: "legality", label: "legality", body: exLegality },
].map(withSize);


// The six fully AI-written sections, largest prompt first.
const SECTION_PROMPTS = [
  { slug: "pharmacology", label: "pharmacology", body: secPharmacology },
  { slug: "harmPotential", label: "harm potential", body: secHarmPotential },
  { slug: "legality", label: "legality", body: secLegality },
  { slug: "historyCulture", label: "history & culture", body: secHistoryCulture },
  { slug: "tolerance", label: "tolerance", body: secTolerance },
  { slug: "summary", label: "summary", body: secSummary },
]
  .map(withSize)
  .sort((a, b) => b.body.length - a.body.length);


const PIPELINE_DIAGRAM = `graph TD
  SITES["Source pages: 10 sites<br/>(internal working copies;<br/>full list in section 01)"]:::ext
  PARSE["Deterministic parsers<br/>dosage, duration, interactions,<br/>chemistry, legal tables"]:::auto
  EXTRACT["Verbatim excerpt extraction<br/>8 topics; an LLM selects source blocks,<br/>a script copies them out unchanged"]:::auto
  QUOTES[("Excerpt documents<br/>one per AI-written section")]:::data
  SYNTH["Section synthesis<br/>an LLM + one prompt<br/>per section, excerpts only"]:::auto
  REVIEW["Editorial review<br/>status: needed, in progress,<br/>or completed"]:::human
  DB[("Article database<br/>(drafts)")]:::data
  CITE["Citation pass<br/>markers proposed for<br/>the six citable sections"]:::auto
  PK["ProtestKit API<br/>live reagent test results"]:::ext
  WHOLE["Imported whole, not processed<br/>TripSit combination JSON, Subjective Effect Index,<br/>trip reports, replications"]:::ext
  PAGE["Published article"]:::pub
  JSON["SubstanceIndex.json<br/>downloadable snapshot<br/>of the whole dataset"]:::pub
  MOL["Structure drawings<br/>auto layout from SMILES, then<br/>drawn by hand or aligned to a class template"]:::human
  MOLDB[("Depiction database<br/>one editable MOL block<br/>+ rendered SVG per substance")]:::data
  PACK["Molecule pack<br/>SVGs + manifest,<br/>rebuilt nightly"]:::pub

  SITES --> PARSE
  SITES --> EXTRACT
  PARSE -->|"SMILES"| MOL
  MOL --> MOLDB
  EXTRACT --> QUOTES
  QUOTES --> SYNTH
  PARSE --> DB
  SYNTH --> DB
  WHOLE -->|"as published,<br/>with attribution"| DB
  DB --> PAGE
  DB -.-> CITE
  CITE -.-> PAGE
  DB -.-> REVIEW
  REVIEW -.->|"status + attribution"| PAGE
  MOLDB --> PAGE
  PAGE --> JSON
  MOLDB --> PACK
  PK -.->|"fetched live<br/>at page view"| PAGE

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef auto fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef human fill:#391a40,stroke:#e879f9,color:#f6e2fa
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb`;

// The legality deep-research workflow (section 06). Same five-tone classDef
// palette as PIPELINE_DIAGRAM above; the two diagrams share one legend key.
const LEGALITY_DIAGRAM = `graph TD
  PACKET[("Export packet<br/>substance names, current legality<br/>entries, core-country list")]:::data
  CITEPASS["Cite pass<br/>re-source every existing<br/>country entry"]:::ext
  DISC["Discovery pass<br/>research every uncovered<br/>core country"]:::ext
  GAPHUNT["Gap hunts<br/>one agent per gap,<br/>native-language + official portals"]:::ext
  CORRHUNT["Correction hunts<br/>deepen each correction<br/>to current primary law"]:::ext
  REFUTE["Adversarial refutation<br/>independent blank-context refuter per claim;<br/>refuted → gap or ≤2 recovery cycles"]:::auto
  STATES["US state and territory pass<br/>only divergences from federal treatment;<br/>each divergence re-refuted"]:::ext
  MERGE["Merge · validate · copy-edit<br/>one legality draft, fixed status vocabulary,<br/>encyclopedia-register rewrite"]:::auto
  WRITE["Human-confirmed write<br/>dry-run diff → explicit confirmation<br/>→ production write"]:::human
  CITED["Citation stage<br/>per-entry references with<br/>verbatim supporting quotes"]:::auto
  PAGE["Published legality section<br/>entries carry cite markers;<br/>unsourced legacy claims flagged, never deleted"]:::pub

  PACKET --> CITEPASS
  PACKET --> DISC
  CITEPASS -->|"corrections"| CORRHUNT
  CITEPASS -->|"gaps"| GAPHUNT
  DISC -->|"gaps"| GAPHUNT
  DISC -->|"new entries"| REFUTE
  GAPHUNT --> REFUTE
  CORRHUNT --> REFUTE
  REFUTE -->|"settled US entry"| STATES
  STATES --> MERGE
  REFUTE -->|"surviving entries"| MERGE
  MERGE --> WRITE
  WRITE --> CITED
  CITED --> PAGE

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef auto fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef human fill:#391a40,stroke:#e879f9,color:#f6e2fa
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb`;

// The shared docs prose recipe. `/articles/<slug>` renders its body through the
// same strings, so the two long-reading surfaces cannot drift apart.
const TABLE_CLASS = `${DOC_TABLE_CLASS} min-w-[760px]`;
const SWATCH_CLASS = "h-3 w-3 shrink-0 rounded-[3px]";
const LEGEND_CLASS = "mt-5 flex flex-wrap gap-x-5 gap-y-2";
const LEGEND_ITEM_CLASS =
  "theme-text-muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]";
// Quiet stepper: a tone-colored 1px top rule carries the stage color (the
// border-color arrives inline from STAGE_TONE); no card chrome, because
// process steps are prose-adjacent, not panels.
const PIPELINE_STEP_CLASS =
  "flex min-w-[8.5rem] flex-1 flex-col gap-1 border-t pt-2.5 text-center";
const STEP_NUM_CLASS = "theme-accent-heading text-sm font-semibold tabular-nums";
const STEP_NAME_CLASS = "theme-accent-heading text-sm font-semibold";
const STEP_DETAIL_CLASS = "theme-text-muted text-xs leading-5";
const PIPELINE_ARROW_CLASS =
  "hidden shrink-0 items-center text-lg theme-icon-muted sm:flex";
const PROMPT_META_CLASS = "theme-text-muted mb-3 text-sm leading-6";
const PROMPT_BODY_CLASS =
  "theme-text-secondary focus-visible-ring max-h-[480px] overflow-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words shadow-[var(--theme-elevation-inner)]";
// Unboxed editorial pull statement: display voice, accent ink, 1px hanging
// rule. Emphasis lives in the typography, not a card.
const PULL_CLASS =
  "theme-accent-heading theme-accent-emphasis font-display my-8 border-l border-l-dose-accent-strong pl-5 text-xl font-medium leading-8";

// Flattened "grouped explanation" surface: one ContentCard whose interior rows are
// separated by quiet token dividers (Divider Policy: divide-y is for card internals).
// DIVIDED_LIST_CLASS goes on a padding="none" card.
const DIVIDED_LIST_CLASS = "divide-y divide-dose-border";
const DIVIDED_ITEM_CLASS = "px-5 py-5 sm:px-6";
// Demoted informational note (contact card only): emphasized prose on the
// card's own surface, no status role.
const NOTE_CLASS = `${DOC_PROSE_CLASS} text-[0.9375rem]`;

// Published prompt text: a scrollable read-only region. Keyboard users need
// focus to scroll it (axe: scrollable-region-focusable), which jsx-a11y's
// static rule cannot see; role="region" + aria-label name it for AT.
function PromptBody({ label, children }: { label: string; children: ReactNode }) {
  return (
    <pre
      className={PROMPT_BODY_CLASS}
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </pre>
  );
}


// Pipeline-stage categories. Color carries category, but each step also renders a
// redundant text label (see PipelineStep) so meaning never depends on color alone.
// Tokens resolve in both themes; no inline hex outside this map, no banned
// sky/teal, green reserved for the genuinely "published / success" stage only.
type StageTone = "source" | "automated" | "stored" | "review" | "published";
const STAGE_TONE: Record<StageTone, { accentVar: string; tag: string }> = {
  // Swatch colors intentionally mirror the Mermaid diagram classDef strokes
  // (ext/auto/data/human/pub) below; this legend is the key for those
  // diagrams. Charts carry the dark-theme strokes verbatim; in light mode the
  // Mermaid component remaps each to a darker same-hue variant (LIGHT_PALETTE
  // in docs/_components/Mermaid.tsx), so the five hues must stay in lockstep
  // across both maps rather than collapse onto shared theme tokens.
  source: { accentVar: "#f9a8d4", tag: "Source" },
  automated: { accentVar: "#fdba74", tag: "Automated" },
  stored: { accentVar: "#6ee7b7", tag: "Stored" },
  review: { accentVar: "#e879f9", tag: "Review" },
  published: { accentVar: "#7dd3fc", tag: "Published" },
};
const STAGE_TAG_CLASS =
  "theme-text-faint text-[0.6875rem] font-semibold uppercase tracking-[0.16em]";

function PipelineStep({
  num,
  name,
  tone,
  children,
}: {
  num: number;
  name: string;
  tone: StageTone;
  children: ReactNode;
}) {
  const { accentVar, tag } = STAGE_TONE[tone];
  return (
    <div className={PIPELINE_STEP_CLASS} style={{ borderColor: accentVar }}>
      <div className="flex items-baseline justify-center gap-2">
        <span className={STEP_NUM_CLASS}>{num}</span>
        <span className={STAGE_TAG_CLASS} style={{ color: accentVar }}>
          {tag}
        </span>
      </div>
      <div className={STEP_NAME_CLASS}>{name}</div>
      <div className={STEP_DETAIL_CLASS}>{children}</div>
    </div>
  );
}

function StageSwatch({ tone }: { tone: StageTone }) {
  return (
    <span
      className={SWATCH_CLASS}
      style={{ background: STAGE_TONE[tone].accentVar }}
    />
  );
}

// Method labels for the tables: quiet swatch-plus-text rows reusing the
// legend's own styling, so cells and the legend share one color key (the old
// pill badges never carried the legend's tones). Toneless labels (the sources
// table has no legend) render as plain tracked text.
function Method({ tone, children }: { tone?: StageTone; children: ReactNode }) {
  return (
    <div className={`${LEGEND_ITEM_CLASS} whitespace-nowrap`}>
      {tone ? <StageSwatch tone={tone} /> : null}
      {children}
    </div>
  );
}

// Section cross-references. Every mention links to the section and carries its
// title. `comma` renders "section 04, Verbatim excerpts" for use inside an
// existing parenthetical; the default renders "section 04 (Verbatim excerpts)".
const SECTION_TITLES = {
  made: { num: "00", title: "What is in an article" },
  sources: { num: "01", title: "The ten source sites" },
  pipeline: { num: "02", title: "The pipeline" },
  parsing: { num: "03", title: "Scraping & parsing" },
  excerpts: { num: "04", title: "Verbatim excerpts" },
  synthesis: { num: "05", title: "AI synthesis & the prompts" },
  citations: { num: "06", title: "Citations & legality" },
  review: { num: "07", title: "Human review" },
  limits: { num: "08", title: "What can still go wrong" },
  status: { num: "09", title: "Status & roadmap" },
  dataset: { num: "10", title: "The open dataset" },
} as const;

function SectionRef({
  s,
  comma,
  cap,
}: {
  s: keyof typeof SECTION_TITLES;
  comma?: boolean;
  cap?: boolean;
}) {
  const { num, title } = SECTION_TITLES[s];
  return (
    <a href={`#${s}`} className={proseLinkClassName}>
      {cap ? "Section" : "section"} {num}
      {comma ? `, ${title}` : ` (${title})`}
    </a>
  );
}


export default async function DocsHowPage() {
  const [copy, previewSubstances] = await Promise.all([
    getCopyByKeys(DOCS_HOW_COPY_KEYS),
    getPublicAboutPreviewSubstances(),
  ]);
  // Same sample-record preview the About page shows, narrowed to the substance file and molecule pack.
  const previewSnapshots = buildAboutPreviewSnapshots(
    previewSubstances.map(({ slug: _slug, ...article }) => article as SubstanceArticle),
  );
  const toc = TOC.map((entry) => ({
    ...entry,
    label: copy.text(`docs-how-toc-${entry.id}`),
  }));
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={<PublicTableOfContents items={toc} variant="bare" />}
        maxWidthClass="max-w-4xl"
        className="theme-toc-strip-scope"
        contentClassName="gap-10"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={toc} />

        <header className="flex flex-col gap-4">
          <h1 className="type-doc-title theme-accent-heading">
            {copy.text("docs-how-title")}
          </h1>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            Substance articles begin as pipeline drafts compiled from ten selected
            harm-reduction and reference sites. Code extracts dose and duration tables.
            A large language model (LLM) drafts the narrative sections from word-for-word
            excerpts of those sources. Separate automated citation workflows find references and check
            whether they support the draft&apos;s claims.
          </p>
          <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7">
            We spent about a year building the pipeline, then months reviewing its
            output before publication. Every citation on the site was fetched and tested
            against the sentence it supports, and the markers that failed were removed,
            so those sentences now read <em>citation needed</em>. The human passes are
            further behind, in that some articles have had a full editorial read and no
            article has yet had a person re-check its citations claim by claim. Each article
            carries an Article Status panel recording which of those passes it has
            received, and the{" "}
            <a href="/about" className={proseLinkClassName}>About page</a>{" "}
            describes the project&apos;s history.
          </p>
          <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7">
            This page explains the production stages and publishes the extraction prompts
            and committed section prompts. Live section prompts can differ, and the
            citation and legality workflow prompts are not yet published here.
            Coverage is still incomplete, and any given article can contain an error.
            Reader feedback is the main way errors reach a reviewer: the
            report-an-issue box at the bottom of each article and the{" "}
            <a href="/about/feedback" className={proseLinkClassName}>feedback form</a>{" "}
            both go directly to the review queue, where an editor reads each message and
            decides whether a correction is needed. Editors make corrections in the
            site&apos;s Wikipedia-style editor. Every correction fixes the article and
            the next export of the dataset, which anyone
            can{" "}
            <a href="#dataset" className={proseLinkClassName}>download</a>{" "}
            and use as a starting point for their own encyclopedia.
          </p>
        </header>

        <section id="made" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>00</span>{" "}What is in an article, and who makes it
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Each section of a substance article is made by the method that suits its
          content. Code transcribes tables of numbers, and an LLM
          never paraphrases them. An LLM drafts narrative sections from word-for-word source
          excerpts. Research agents propose references and rebuild the legality sections
          against primary sources. People keep the judgment calls: classification trees,
          editorial notes, and review.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Two kinds of outside material feed the site. The first is archived reference
          pages, which are captured once and processed by the pipeline below. The second
          is live data read from other projects:
        </p>
        <ul className={`${DOC_LIST_CLASS} mt-3 list-disc pl-5`}>
          <li>
            Effect listings link into the Subjective Effect Index, the taxonomy that Josie
            Kins created on Disregard Everything I Say in 2011.
          </li>
          <li>
            Interaction ratings come from the drug-combination data that TripSit
            publishes as a JSON file on GitHub. This file is not the same source as the
            TripSit factsheet and wiki pages that the pipeline below archives and parses.
          </li>
          <li>
            Reagent colors come from the ProtestKit API at the moment you open the
            page.
          </li>
        </ul>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Trip reports are first-person accounts written by people. They are imported with
          attribution from the Effect Index corpus. Replications are the image and video
          recreations of subjective effects shown in articles and the gallery. They are
          human artwork, made by the replications community and by artists who have sent
          work to Josie Kins over the years. The site hosts them as educational material
          about subjective-effect documentation and credits their creators.
        </p>

        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> AI-drafted from excerpts (baseline)
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> Extracted by code (baseline)
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> Live API
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> Manual / curated (built on the baseline)
          </div>
        </div>

        <ContentCard padding="none" className={`${DOC_TABLE_WRAP_CLASS} mt-6`}>
          <div className={DOC_TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <caption className="sr-only">Per-section production methods</caption>
            <thead>
              <tr className={DOC_TABLE_HEAD_ROW_CLASS}>
                <th className={DOC_TH_CLASS}>Article section</th>
                <th className={DOC_TH_CLASS}>Method</th>
                <th className={`${DOC_TH_CLASS} min-w-[14rem]`}>How it is made</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Summary</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  50&ndash;80 word overview written by an LLM from the intro-text
                  excerpts, under the summary prompt (readable in <SectionRef s="synthesis" />).
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  Identification{" "}
                  <small className="theme-text-faint block">chemical names, SMILES, InChI, CAS</small>
                </td>
                <td className="space-y-1 p-3">
                  <Method tone="automated">Extracted by code</Method>
                  <Method tone="review">curated</Method>
                </td>
                <td className="p-3">
                  Chemistry identifiers merged from parsed sources (DrugBank, PsychonautWiki,
                  Wikipedia) with chemical-name resolution. Provenance is tracked per
                  identifier, and an editor checks the result.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  Structure drawing{" "}
                  <small className="theme-text-faint block">the molecule image</small>
                </td>
                <td className="space-y-1 p-3">
                  <Method tone="automated">auto layout</Method>
                  <Method tone="review">hand-drawn</Method>
                </td>
                <td className="p-3">
                  A first layout is made from the SMILES string. Most drawings are then
                  redrawn by hand or aligned to a shared class template to follow
                  chemical drawing conventions (see <SectionRef s="parsing" />).
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  Classification{" "}
                  <small className="theme-text-faint block">psychoactive / chemical classes</small>
                </td>
                <td className="space-y-1 p-3">
                  <Method tone="automated">Extracted by code</Method>
                  <Method tone="review">curated</Method>
                </td>
                <td className="p-3">
                  Class assignments come from parsed sources, and the classes themselves can
                  be scientific or political. Editors hand-curate the site-wide
                  classification trees.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Dosage tables</td>
                <td className="p-3">
                  <Method tone="automated">Extracted by code</Method>
                </td>
                <td className="p-3">
                  Dose ranges per route parsed directly from TripSit, PsychonautWiki, and
                  Erowid tables, under the lowest-upper-bound rule (<SectionRef s="parsing" />).
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Duration tables</td>
                <td className="p-3">
                  <Method tone="automated">Extracted by code</Method>
                </td>
                <td className="p-3">
                  Onset / peak / offset values per route, parsed from the same sources.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Subjective effects</td>
                <td className="p-3">
                  <Method>Mixed</Method>
                </td>
                <td className="p-3">
                  Where Josie Kins wrote the original effect list for a substance, that
                  list is restored as she wrote it. Otherwise the list is built from her
                  effect taxonomy and the subjective-effects excerpts, with her own projects
                  excluded as sources. Excerpts only fill documented gaps and never overwrite
                  an existing list (<SectionRef s="synthesis" />). Every effect links into
                  the Subjective Effect Index, and an asterisk on an effect marks text she
                  wrote herself.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Pharmacology</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  Mechanism-of-action prose written from the pharmacology excerpts under the
                  pharmacology prompt, the longest of the prompts.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Interactions</td>
                <td className="p-3">
                  <Method tone="automated">Extracted by code</Method>
                </td>
                <td className="p-3">
                  Drug-combination risk ratings read from the JSON file that TripSit
                  publishes on GitHub. They do not come from the archived factsheets.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Harm potential</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  Toxicity, addiction, and risk prose written from the harm-potential
                  excerpts under the harm potential prompt.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Tolerance</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  Tolerance and cross-tolerance prose from the tolerance excerpts.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Legality</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  Country-by-country legal status, now rebuilt entry by entry against
                  primary legal sources by the deep-research workflow
                  (<SectionRef s="citations" />). The first draft came from the legality
                  excerpts like the other AI-written sections. Code also prepopulates the
                  structured legal fields where sources state them plainly.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">History &amp; culture</td>
                <td className="p-3">
                  <Method tone="source">AI-drafted</Method>
                </td>
                <td className="p-3">
                  Discovery, medical history, and cultural context from the history-culture
                  excerpts.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Reagent testing</td>
                <td className="p-3">
                  <Method tone="published">live API</Method>
                </td>
                <td className="p-3">
                  Color reactions fetched live from the ProtestKit API at page view, with
                  stored static results as fallback.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Citations &amp; references</td>
                <td className="space-y-1 p-3">
                  <Method tone="source">workflow-proposed</Method>
                  <Method tone="automated">structurally validated</Method>
                </td>
                <td className="p-3">
                  References and markers proposed by LLM research agents for the six citable
                  sections, then checked against the cited sources to determine whether
                  each source supports its associated claim
                  (<SectionRef s="citations" />).
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Trip reports</td>
                <td className="p-3">
                  <Method tone="review">human-written</Method>
                </td>
                <td className="p-3">
                  First-person experience reports written by people, imported from the
                  Effect Index corpus with attribution. The encyclopedia-building dataset
                  records which reports informed each article.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Replications</td>
                <td className="space-y-1 p-3">
                  <Method tone="review">human-created</Method>
                  <Method tone="review">curated</Method>
                </td>
                <td className="p-3">
                  Image and video recreations of subjective effects, made by the
                  replications community and by artists who have sent work to Josie Kins
                  over the years. The Effect Index archive preserved much of it. Editors
                  hand-curate each article&apos;s replication showcase. Each piece is
                  credited with a source link where known. Rights stay with the artists.
                  The{" "}
                  <a href="/docs/license" className={proseLinkClassName}>license page</a>{" "}
                  covers the hosting terms.
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Notes</td>
                <td className="p-3">
                  <Method tone="review">manual</Method>
                </td>
                <td className="p-3">Editor-written remarks and caveats.</td>
              </tr>
            </tbody>
            </table>
          </div>
        </ContentCard></section>

        <section id="sources" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>01</span>{" "}The ten source sites
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          We selected ten harm-reduction and reference sites for the baseline drafts,
          plus one live API. We keep internal working copies of the relevant pages for processing.
          Each article&apos;s source pages
          section links out to the original pages on the source sites themselves.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The working copies were captured in December 2025, and the pipeline reads the
          copy. A source site can change after our capture, so this list is a dated
          snapshot. Improvement after that date comes from editors, the citation
          workflows, and reader feedback (<SectionRef s="status" />).
        </p>

        <ContentCard padding="none" className={`${DOC_TABLE_WRAP_CLASS} mt-6`}>
          <div className={DOC_TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <caption className="sr-only">The ten source sites</caption>
            <thead>
              <tr className={DOC_TABLE_HEAD_ROW_CLASS}>
                <th className={DOC_TH_CLASS}>Source</th>
                <th className={`${DOC_TH_CLASS} min-w-[14rem]`}>What we take from it</th>
                <th className={DOC_TH_CLASS}>How it is processed</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">PsychonautWiki</td>
                <td className="p-3">
                  Dosage and duration tables, subjective effects by intensity, toxicity /
                  interaction / tolerance prose, legal status, chemistry identifiers,
                  pharmacology prose.
                </td>
                <td className="space-y-1 p-3">
                  <Method>Extracted by code</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  TripSit{" "}
                  <small className="theme-text-faint block">
                    three feeds: factsheets and wiki (scraped pages), combination data
                    (published JSON on GitHub)
                  </small>
                </td>
                <td className="p-3">
                  From the factsheets and wiki: dosage tables, duration by route, effects
                  lists, tolerance prose, classifications. From the combination data: the
                  drug-combination interaction chart (dangerous / unsafe / caution /
                  low-risk ratings).
                </td>
                <td className="space-y-1 p-3">
                  <Method>Extracted by code</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Erowid</td>
                <td className="p-3">
                  Dosage and duration ranges, effects descriptions, legal status,
                  harm-reduction and safety warnings, general narratives.
                </td>
                <td className="space-y-1 p-3">
                  <Method>Extracted by code</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Wikipedia</td>
                <td className="p-3">
                  General overviews, history, chemistry identifiers. Also used to discover
                  citable references, but never cited as a reference itself
                  (<SectionRef s="citations" />).
                </td>
                <td className="space-y-1 p-3">
                  <Method>Extracted by code</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">DrugBank</td>
                <td className="p-3">
                  Chemical data (molecular weight, formula, CAS numbers), pharmacology
                  descriptions, drug and food interactions.
                </td>
                <td className="space-y-1 p-3">
                  <Method>Extracted by code</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Isomer Design</td>
                <td className="p-3">Effects and experience prose, chemical reference data.</td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">SaferParty</td>
                <td className="p-3">
                  Harm reduction guidance, risk descriptions, safer-use notes.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">The Drug Classroom</td>
                <td className="p-3">
                  Educational overviews, mechanism and effects descriptions.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Disregard Everything I Say</td>
                <td className="p-3">Subjective effect narratives and substance overviews.</td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">Drug Users Bible</td>
                <td className="p-3">
                  Dosage, effects, and legality information, plus street-name nomenclature.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  ProtestKit <small className="theme-text-faint block">live API</small>
                </td>
                <td className="p-3">
                  Reagent test color reactions (Marquis, Mecke, Mandelin, Simon&apos;s,
                  Froehde, Liebermann, Ehrlich, and others), fetched at page view through a
                  rate-limited proxy with a static fallback.
                </td>
                <td className="p-3">
                  <Method>live API</Method>
                </td>
              </tr>
              <tr className={DOC_TR_CLASS}>
                <td className="p-3">
                  Stored, not yet used{" "}
                  <small className="theme-text-faint block">
                    Bluelight, D. M. Turner, Nervewing
                  </small>
                </td>
                <td className="p-3">
                  Archived with the working copies, but no parser reads them yet. They feed no
                  article content.
                </td>
                <td className="p-3">
                  <Method>archived only</Method>
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </ContentCard></section>

        <section id="pipeline" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>02</span>{" "}The pipeline
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Of the four methods in <SectionRef s="made" />, the two automated methods run as
          parallel tracks over the source pages. The deterministic track parses structured
          data such as dosage tables and interaction matrices. The AI track turns the prose
          parts of the sources into excerpt documents, then into draft sections. Human and
          live-API methods sit outside this pipeline and act on its output.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Both tracks fill one draft article. After publication, the citation, audit, and
          review workflows continue to work on the article. They add markers, evidence
          records, corrections, and status metadata. Published coverage varies by article. The
          diagram describes the intended relationships between stages, and articles
          publish before every stage has run.
        </p>

        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> Source material / external APIs
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> Automated processing
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="stored" /> Stored data
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> Human review
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> Published output
          </div>
        </div>

        <div className="mt-6">
          <Mermaid
            chart={PIPELINE_DIAGRAM}
            title="Content pipeline: source pages through parsing/extraction, synthesis, human review, citation, and publication"
          />
        </div></section>

        <section id="parsing" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>03</span>{" "}Scraping &amp; parsing
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          We scraped the source sites once and stored the pages as plain-text working
          copies, one per substance. They are for internal processing;{" "}
          <SectionRef s="sources" /> gives the capture date.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          From there, deterministic parsers read that text and extract the structured data:
          dose ranges by route, duration values, interaction ratings, chemical identifiers,
          and legal classifications. A parser is deterministic code.
          Each site needs its own, because each site structures its pages differently.
        </p>

        {/* Implementation reference, not narrative: each parser subsection
            collapses behind the same disclosure device as the prompts. */}
        <div className="mt-6 space-y-3">
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={DOC_MINOR_HEADING_CLASS}>Table parsers</h3>}
          >
            <p className={DOC_PROSE_CLASS}>
              TripSit factsheets and PsychonautWiki carry the most structured data: dose
              tiers (threshold / light / common / strong / heavy) per route of
              administration and onset / peak / offset durations. The parsers read these
              tables directly and transcribe the numbers as published. A parser does not
              choose between sources that disagree; the merge step does that later, when
              the parsed tables enter the article.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-3`}>
              The merge applies the lowest-upper-bound rule. Among weight-unit sources, it
              keeps the entry with the lowest comparable upper bound. The comparison value
              is the heavy minimum when the source gives one. If not, it falls back to the
              strong maximum, then the strong minimum, then the common maximum. If two
              sources tie, the source that fills more dose tiers is used. If no source gives
              weight units, a fixed source-priority order decides. The preference for a
              lower comparable bound is intended as a conservative safety measure.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-3`}>
              A worked example: if one source lists a heavy oral dose starting at 25 mg and
              another lists it starting at 35 mg, the article takes the 25 mg source&apos;s
              whole table for that route.
            </p>
          </DisclosureCard>
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={DOC_MINOR_HEADING_CLASS}>The combination chart</h3>}
          >
            <p className={DOC_PROSE_CLASS}>
              The combination ratings do not come from the archived TripSit pages. TripSit
              publishes its combination chart as a JSON file on GitHub. After every page
              parser runs, a separate step reads that file and maps its class-based entries
              onto substance pairs. That step produces the interaction ratings (dangerous,
              unsafe, caution, low-risk) shown where an article has matching interaction
              data and on the Interactions hub.
            </p>
          </DisclosureCard>
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={DOC_MINOR_HEADING_CLASS}>Chemistry identifiers and structure drawings</h3>}
          >
            <p className={DOC_PROSE_CLASS}>
              dose.wiki merges SMILES strings, InChI keys, CAS numbers, and molecular data
              from DrugBank, PsychonautWiki, and Wikipedia. Provenance is tracked per
              identifier, and chemical-name resolution fills the gaps.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-4`}>
              The molecule image is made in two steps. A SMILES
              string says which atoms are joined and how, but it does not say how the
              molecule should be drawn. Chemical families have conventional drawing
              styles that automatic layouts often do not follow. Each substance therefore
              starts from an automatic 2D layout. Then a person redraws
              it by hand, or aligns it to a template that a person drew once for the
              whole chemical class. The saved result is an editable MOL block, and the
              image is rendered from that. Each drawing records whether it is automatic,
              hand-drawn, or template-aligned. We intend to automate more of this
              process over time.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-4`}>
              The drawing tool and the page image both use one engine: a dose.wiki fork
              of the open-source OpenChemLib library, with small additions for fine
              rotation and bold bonds. The published image matches what the
              editor drew. A check compares the molecule before and after each edit, so a
              redraw cannot quietly turn it into a different molecule.
            </p>
          </DisclosureCard>
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={DOC_MINOR_HEADING_CLASS}>Prose-heavy sources</h3>}
          >
            <p className={DOC_PROSE_CLASS}>
              Erowid, Isomer Design, SaferParty, The Drug Classroom, Disregard Everything I
              Say, and the Drug Users Bible contribute mostly narrative text. Their parsers
              preserve labeled sections in each collected-source working copy. The extraction
              stage (<SectionRef s="excerpts" />) reads those documents and decides which
              passages matter.
            </p>
          </DisclosureCard>
        </div></section>

        <section id="excerpts" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>04</span>{" "}Verbatim excerpt extraction
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The source pages are long, and most of any page is irrelevant to any one section.
          Before any writing happens, an extraction pass reads every working copy and
          copies the passages relevant to each topic, word for word.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          An excerpt document holds exact
          copies of source text: complete paragraphs, formatting preserved, grouped under a
          heading for each source. The result is one excerpt document per substance per
          topic, across eight topics: intro text (which feeds the summary), dosage &amp;
          duration, subjective effects, pharmacology, tolerance, harm potential, history
          &amp; culture, and legality.
        </p>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>Topic-by-topic extraction</h3>
            <p className={DOC_PROSE_CLASS}>
              For each topic, the LLM reads the complete collected-source working copy and
              produces an excerpt document directly. It copies qualifying passages under
              their original source headings and uses the prompt&apos;s marker when a source
              has no relevant material.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-3`}>
              Every source keeps its heading in the output even when it yielded nothing.
              Those headings carry a marker line such as <em>No tolerance content
              found.</em>, which keeps &quot;we looked and there was nothing&quot; distinct
              from &quot;this source was skipped&quot;.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-3`}>
              Because the model emits the excerpt text, its output is not trusted on
              instruction alone. The prompt requires character-for-character copying, and
              the completed file is rejected if a passage cannot be found under the same
              source heading in the working copy.
            </p>
          </div>
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>Audited after extraction</h3>
            <p className={DOC_PROSE_CLASS}>
              A script then audits every finished excerpt document. It requires that each passage appears in
              the working copy, under the same source heading, as an exact substring,
              and rejects a file that drifts.
            </p>
          </div>
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>Tracing drafts to sources</h3>
            <p className={DOC_PROSE_CLASS}>
              The excerpt documents are the only material the writing stage is allowed to
              see. These word-for-word copies let a reviewer check draft claims against
              specific passages on the source pages. Extraction
              errs toward over-inclusion. The instruction is to keep anything even
              tangentially relevant, rather than risk losing safety-critical information.
            </p>
          </div>
        </div>

        <h3 className={`${DOC_SUBHEAD_CLASS} mt-8`}>2C-B intro-text excerpt</h3>
        <DisclosureCard
          variant="subtle"
          summary="Example: the 2C-B intro-text excerpt document"
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            The 2C-B example below shows how source passages are grouped before drafting,
            so readers can inspect the extraction method. It is the working file for
            2C-B&apos;s intro-text topic: verbatim passages grouped under source headings.
            The summary section of the 2C-B article was written from this document and
            nothing else.
          </p>
          <PromptBody label="Example: the 2C-B intro-text excerpt document">
            {INTRO_QUOTES}
          </PromptBody>
        </DisclosureCard>

        <h3 className={`${DOC_SUBHEAD_CLASS} mt-8`}>The extraction prompts</h3>
        <p className={`${DOC_PROSE_CLASS} mb-3 mt-2`}>
          All eight extraction prompts appear below. This page reads them
          straight from <code>content/prompts/extraction/</code> when it builds, so they are the same
          files the pipeline runs.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The pipeline calls the LLM once per substance and topic. The harness loads that
          category&apos;s prompt directly and sends it with the complete collected-source
          working copy. The model is not named here because the choice changes over time.
          Changing the model can alter which passages are kept, while the prompt and
          post-extraction audit require the retained passages to preserve source wording.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The eight share one skeleton: hard verbatim rules, an input format, and
          empty-result handling. They differ mainly in their &quot;what counts&quot;
          sections.
        </p>

        <p className={`${DOC_PROSE_CLASS} mt-5`}>
          Each prompt below defines both what counts as relevant for its topic and the
          excerpt document it must return. The output keeps source headings in input order,
          copies qualifying text verbatim, records empty results explicitly, and adds no
          commentary to source passages.
        </p>

        {EXTRACTION_PROMPTS.map((prompt) => (
          <DisclosureCard
            key={prompt.slug}
            variant="subtle"
            summary={`Extraction prompt: ${prompt.label} (${prompt.sizeLabel})`}
            className="mt-3"
          >
            <p className={PROMPT_META_CLASS}>
              This is the complete category prompt loaded by the extraction harness.
            </p>
            <PromptBody label={`Extraction prompt: ${prompt.label}`}>
              {prompt.body}
            </PromptBody>
          </DisclosureCard>
        ))}</section>

        <section id="synthesis" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>05</span>{" "}AI synthesis &amp; the prompts
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Six article sections begin as AI-generated drafts: summary,
          pharmacology, tolerance, harm potential, history &amp; culture, and legality.
          An LLM writes each one from exactly two inputs: the excerpt document for that
          topic, and a section-specific prompt. The model differs by section and changes
          over time. The LLM writes original prose
          from the excerpts; committed copies of the prompts appear below. We are
          experimenting with other ways to summarize the excerpts as well.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The two remaining excerpt topics, dosage &amp; duration and subjective effects,
          serve a narrower purpose. Those sections come from parsed tables and from Josie
          Kins&apos; effect taxonomy. Their excerpts only fill documented gaps, and never
          overwrite what is already there.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Some sections are harder to get right than others. Pharmacology is tricky,
          and its drafts are the most likely to be wrong. The stakes are highest where
          a wrong figure can hurt someone, which is exactly why doses are transcribed
          by code and interaction ratings come from curated data rather than drafted
          prose. The other sections are easier and reach high quality more reliably.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The prompts share one skeleton: a style definition, a hard evidence rule, a fixed
          output format, worked examples, and a checklist. All of them carry the same two
          constraints:
        </p>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>Evidence constraint</h3>
            <p className={DOC_PROSE_CLASS}>
              The prompts instruct the LLM to include only information explicitly stated
              or clearly implied in the supplied quotes, and to omit information that it cannot
              find there. The limits of that rule are stated once, in{" "}
              <SectionRef s="limits" />.
            </p>
          </div>
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>Original prose</h3>
            <p className={DOC_PROSE_CLASS}>
              The writing stage uses the excerpts as evidence for a new account of the
              subject. Its instructions are to synthesize the information, not reproduce
              the source&apos;s sentences or lengthy phrases. Keeping the excerpts separate
              makes it possible to check both the factual basis of a draft and how it
              uses the source material. A script also appends the relevant excerpts
              from each source, copied verbatim, after the paragraphs they informed, so
              the output can be audited against exactly what the model was given. That
              audit is still being improved.
            </p>
            <p className={`${DOC_PROSE_CLASS} mt-4`}>
              Later citation research checks claims against supporting references, and
              editors correct and expand the text. The source-page links remain available
              for readers who want the original discussion and context.
            </p>
          </div>
        </div>

        <p className={`${DOC_PROSE_CLASS} mt-7`}>
          The prompts for all six AI-drafted sections appear below, largest
          first. This page reads them from <code>content/prompts/sections/</code>{" "}
          when it builds. Two copies of each prompt exist: the committed file shown here,
          and a live copy the editorial team can edit, which generation runs use. The live
          copies were seeded from these files, and a comparison script reports any drift
          between the two. The copy that produced a given article can differ from
          the copy printed here.
        </p>

        {SECTION_PROMPTS.map((prompt) => (
          <DisclosureCard
            key={prompt.slug}
            variant="subtle"
            summary={`Section prompt: ${prompt.label} (${prompt.sizeLabel})`}
            className="mt-3"
          >
            <PromptBody label={`Section prompt: ${prompt.label}`}>
              {prompt.body}
            </PromptBody>
          </DisclosureCard>
        ))}

        <p className={`${DOC_PROSE_CLASS} mt-7`}>
          The six prompts are version-controlled alongside the code, and the live
          copies are editable by the editorial team. The prompts have
          been undergoing continuous improvement, and they are stable enough that
          editors should feel empowered to adjust them as necessary. Prompt changes
          affect future generation runs that use the revised version. Not every prompt
          the site uses is published: besides the ones on this page, some exist as
          template literals in code, and some are stored privately. The citation and
          legality workflows carry their own prompt families; those live in the
          repository under{" "}
          <code>scripts/citations/</code> and <code>scripts/legality/</code> and are not
          yet published on this page.
        </p></section>

        <section id="citations" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>06</span>{" "}Citations &amp; legality deep research
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The six AI-drafted sections are the citable sections: those that can carry
          Wikipedia-style markers linked to a reference list. Other sections, including
          dosage tables, interaction ratings, and subjective effects, use separate
          provenance and review paths. Citation work has run in
          three passes: a marking pass that proposed the markers, a legality rebuild that
          set a stricter standard, and an automated check of whether each cited source
          supported its associated claim. This last pass is called an entailment audit.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Every live marker on an article today has passed the audit in pass three: the
          cited source was fetched and found to support the sentence. Markers that failed
          were removed, and their sentences now show <em>citation needed</em>.
        </p>

        <h3 className={`${DOC_SUBHEAD_CLASS} mt-8`}>Pass one: proposing markers</h3>
        <p className={DOC_PROSE_CLASS}>
          LLM research agents read the citable prose and choose bounded claims that may
          need support. They inspect candidate sources and record the relationship they
          believe each source supports. A marker appears only
          when inspected evidence supports a nearby claim. Uncertain relationships are
          recorded as internal gaps and receive no marker.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep num={1} name="Identify claims" tone="automated">
            Research agents inspect the citable prose and choose bounded claims that may
            need support
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name="Inspect references" tone="automated">
            Agents inspect candidate sources and record the relationship they believe each
            source supports
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name="Mark" tone="automated">
            The workflow inserts citation markers into the text. Nothing else changes, byte
            for byte
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name="Record evidence" tone="stored">
            The workflow records a short source quote and rationale behind each proposed
            marker
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={5} name="Validate structure" tone="stored">
            Deterministic gates check marker, reference, and evidence consistency before a
            draft can be reviewed
          </PipelineStep>
        </div>

        {/* Citation policy bullets are reference material; the narrative stays open. */}
        <DisclosureCard
          variant="subtle"
          className="mt-6"
          summary={<h3 className={DOC_MINOR_HEADING_CLASS}>Reference standards</h3>}
        >
          <ul className={`${DOC_LIST_CLASS} list-disc pl-5`}>
            <li>
              <strong>Wikis are discovery sources only.</strong> The
              workflow uses Wikipedia and PsychonautWiki to find candidates, while final
              references are intended to be inspectable journals, government documents,
              drug labels, books, or databases.
            </li>
            <li>
              <strong>Page-specific identifiers.</strong> Repeated same-site sources, for
              example DailyMed drug labels, receive distinct per-page reference IDs so
              separate documents remain separate during review.
            </li>
            <li>
              <strong>Access limitations stay visible.</strong> If the accessible abstract
              of a paywalled paper supports the claim, the workflow can use that paper. The
              record notes <em>abstract-only</em> access so that reviewers know what was
              inspected.
            </li>
          </ul>
        </DisclosureCard>

        <p className={`${DOC_PROSE_CLASS} mt-6`}>
          Citations render as numbered markers linked to the reference list. Behind each
          marker, the workflow retains the quote and rationale as review evidence, so a
          human can inspect exactly what the marker was based on.{" "}
          Whatever a citation&apos;s review state, every source link stays followable, so
          readers can always see where the information comes from.{" "}
          <SectionRef s="limits" cap /> states what a marker does and does not
          establish.
        </p>

        <h3 className={`${DOC_SUBHEAD_CLASS} mt-8`}>Pass two: legality deep research</h3>
        <p className={DOC_PROSE_CLASS}>
          Legal information can become outdated because drug law changes often. Laws also differ by
          country, and most published summaries cite other summaries instead of the law.
          The legality section therefore has its own deep-research workflow, separate
          from the main pipeline. It
          reads primary legal sources only: statutes, official schedules, and government
          legislation portals.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Legality was also the test case for a per-subsection research pipeline. Each country
          is a separate subsection with one question and one class of source. The test case
          established the invariants below, rules that every run must follow. These rules
          also form the template for a separate pipeline for each remaining subsection. Pharmacology is next. The end state is
          one pipeline per subsection, run over every article.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          One orchestrator agent runs the workflow for one substance at a time. It launches
          many small research agents in parallel. Each agent starts with a blank context,
          one narrow question, and a strict output contract. Research and refutation are
          never the same agent. Every surviving claim is checked by an independent refuter,
          an agent that tries to disprove it without the research agent&apos;s prior conversation.
          A refuted claim becomes a recorded gap, or it re-enters research for at
          most two recovery cycles. The point of the adversarial loop is precision, so
          that human verification of the finished section is efficient. The diagram
          below shows the full sequence, from export
          packet through the cite, discovery, gap, and correction passes to the US state
          pass, merge, and human-confirmed write.
        </p>

        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> External research
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> Automated pipeline
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="stored" /> Data store
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> Human decision
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> Published output
          </div>
        </div>

        <div className="mt-6">
          <Mermaid
            chart={LEGALITY_DIAGRAM}
            title="Legality deep research: export packet through parallel research passes, adversarial refutation, US state pass, merge and validation, human-confirmed write, and citations"
          />
        </div>

        {/* Workflow invariants are reference material; the narrative stays open. */}
        <DisclosureCard
          variant="subtle"
          className="mt-6"
          summary={<h3 className={DOC_MINOR_HEADING_CLASS}>Invariants</h3>}
        >
          <ul className={`${DOC_LIST_CLASS} list-disc pl-5`}>
            <li>
              No entry enters the draft without a primary source (no source means a
              recorded gap, never a published claim).
            </li>
            <li>Research and refutation are always separate blank-context agents.</li>
            <li>A human confirms every write.</li>
            <li>
              Legacy claims that cannot be sourced are flagged <em>citation needed</em> for
              review. Corrections or removals must be recorded, never made silently.
            </li>
          </ul>
        </DisclosureCard>

        <h3 className={`${DOC_SUBHEAD_CLASS} mt-8`}>Pass three: checking claims against sources</h3>
        <p className={DOC_PROSE_CLASS}>
          The legality loop has four steps: validate what can be validated, cite what a
          primary source supports, find sources for the rest, and correct or remove
          what cannot be sourced. The audit ran the first and last of those steps over the
          other citable sections. It fetched each cited source and compared it with the
          claim. A marker stayed only when the source explicitly supported the claim as
          written. Every other marker was removed, and its sentence now shows{" "}
          <em>citation needed</em>. Safety-sensitive pairs also faced an independent
          adversarial re-check before the audit accepted any change. The audit kept the
          invariants listed under pass two.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The middle two steps come next: find sources for the claims that lost their
          markers, and change or remove any claim that no source supports.{" "}
          <SectionRef s="status" cap /> tracks that work.
        </p></section>

        <section id="review" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>07</span>{" "}Human review
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Editorial review is the first person-led stage specific to one article. The
          baseline pipeline before it was produced for every substance at once.
          Editors verify the pharmacology, check the doses and interactions where a wrong
          figure can hurt someone, and add what the sources left out.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Readers take part in this stage. The report-an-issue form at the bottom of
          each article, or the site-wide feedback form, sends a note to the review
          queue. An editor reads each note and decides whether the article changes.
          Reader feedback is the main way that errors reach a reviewer.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          It took us about a year to build the pipeline, and editors have been
          reviewing articles for months. Reviewing is ongoing work, and help is
          welcome: checking citations and reporting errors and omissions both feed
          the queue. Editors also add material that exists nowhere else: remarks and
          caveats, hand-drawn structure images, and placement in the site&apos;s own
          substance and effect taxonomies. The article editor works like Wikipedia&apos;s,
          so you can view recent changes on any article and propose changes yourself.
          All changes made through it are reflected in future releases of the open
          dataset.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Editorial review is a recorded human workflow with four steps.
        </p>


        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep num={1} name="Inspect" tone="review">
            A reviewer reads the article and follows the sources relevant to the review
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name="Check" tone="review">
            The reviewer checks important claims and records uncertainty rather than
            assuming coverage
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name="Edit" tone="review">
            Corrections use the editor&apos;s normal diff and save workflow
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name="Record status" tone="stored">
            The separate review action stores status, reviewer identity, and completion
            time
          </PipelineStep>
        </div>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Each article shows this as a three-step Article Status. Step 1 is automated
          synthesis, which creates the baseline draft. Step 2 is the editorial review
          described here. Step 3 is a human citation review that compares each claim
          with its source. It is the pass planned as Phase 4 in{" "}
          <SectionRef s="status" />, and no article has completed it yet.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          Updates to a published article can also start from the pipeline. Re-running
          the extraction and synthesis prompts for a section produces a suggested edit
          that an editor can review; citation markers are ignored during that pass, and
          citation status is tracked separately. Different parts of an article get
          different review tools: dosage tables are reviewed in a table editor,
          interaction ratings are calculated and reviewed, and subjective effects are
          reviewed in a taxonomy-based editor. Each tracks citation status through its
          own prompt families. Editorial review and citation status are recorded
          separately in each of these tools.
        </p>

        <p className={`${DOC_PROSE_CLASS} mt-7`}>
          The review workbench stores one of three statuses: <strong>needed</strong>,{" "}
          <strong>in progress</strong>, or <strong>completed</strong>. Completed means a
          human editor recorded a review at a point in time. When the stored reviewer
          identity resolves to a public contributor profile, the article attributes that
          specific review. Editor saves and review status are distinct records: the
          changelog shows who changed text and when, while the review status shows that a
          review was marked complete.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-5`}>
          The editorial reviewer reads and corrects the article text. The citation
          workflows (<SectionRef s="citations" />) attach and audit citation markers
          under their own recorded states, separate from editorial review.{" "}
          <SectionRef s="limits" cap /> states what a completed status does and does
          not establish.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-5`}>
          Structure drawings are the one pipeline output a person makes by hand. The
          molecule editor is a separate tool from the text editor
          (<SectionRef s="parsing" comma />, under Chemistry identifiers). An editor
          redraws the molecule by hand, or draws one template for a chemical class and
          applies it to every member. Hand-drawn molecules are never overwritten by a
          template. Saving a drawing does not change the article text or its review
          status.
        </p></section>

        <section id="limits" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>08</span>{" "}What can still go wrong
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The workflows above reduce error without eliminating it.
        </p>

        <p className={`${DOC_PROSE_CLASS} mt-5`}>
          <strong>Source links record influence only.</strong> Source-page links document material
          that informed the pipeline. They do not, by themselves, show that a source
          supports a particular sentence. Citation markers record the separate, intended
          evidentiary relationships between claims and references, and{" "}
          <SectionRef s="citations" /> describes how those are produced and audited.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          <strong>Citation evidence can be wrong.</strong> A marker records a quote and a
          rationale, and the entailment audit checked that the source supports the
          sentence. It does not prove source quality or current accuracy.
          Important claims still need a human check against the cited source.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          <strong>Workflow controls have limits.</strong> Prompts, validators,
          citation evidence, and editorial review reduce error and make decisions
          inspectable. They cannot guarantee that prose is complete, that a citation
          entails every nearby phrase, or that information remains current.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          <strong>A completed review is a dated record.</strong> Completed means
          a human editor recorded a review at a point in time. It does not certify every
          sentence, dose, interaction, citation, or legal conclusion. The status does
          not pin the exact article revision that was reviewed. Later edits can make an
          older completion record stale, and the stored status does not change.
          Citation states (including the visible <em>citation needed</em>{" "}
          indicator) are
          workflow records, never the reviewer&apos;s personal claims.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          <strong>The working copies have a date.</strong>{" "}
          The pipeline reads working copies captured on the date given in{" "}
          <SectionRef s="sources" />. Source sites keep evolving after capture, and the
          baseline is never re-captured; automatic updating of the source baseline is
          not yet available. Later accuracy comes from the human and citation
          stages in <SectionRef s="status" />.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          <strong>LLMs make mistakes.</strong> The verbatim-excerpt rule exists because
          an LLM that re-types source text can hallucinate: a changed digit or an invented
          phrase can slip in unnoticed (<SectionRef s="excerpts" />). So LLMs never
          transcribe, and drafts are held to their excerpt documents. Synthesis can still
          misweigh or omit evidence. Drafts stay revisable because they return
          through the citation and review workflows.
        </p>
        </section>

        <section id="status" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>09</span>{" "}Status &amp; roadmap
        </h2>

        <p className={PULL_CLASS}>
          dose.wiki is in <strong>beta</strong>. Every article is generated, checked, and
          corrected in public through workflows that are still running.
        </p>

        <p className={`${DOC_PROSE_CLASS} mt-5`}>
          Work on the baseline runs in stages. Some are finished, and the rest are
          planned. This section records where each stands as of{" "}
          <strong>August 31, 2026</strong>.
        </p>

        <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 1: Foundation pipeline</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              The baseline is complete for every article: verbatim excerpt extraction, AI
              synthesis, and claim-level citations across the working copies. Sections{" "}
              <a href="#pipeline" className={proseLinkClassName}>02</a> through{" "}
              <a href="#citations" className={proseLinkClassName}>06</a> describe this
              pipeline. This page publishes all eight extraction prompts and committed
              copies of the six section prompts; live section prompts can differ.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 2: Legality primary-source remediation</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              This was the country-by-country deep research in <SectionRef s="citations" />.
              The workflow validated existing legality entries against statutes and
              official schedules where possible. Remaining claims received targeted
              primary-source searches. Entries that survived were cited. Entries that could
              not be sourced were corrected, removed, or flagged <em>citation needed</em>.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 3: Citation entailment audit</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              The legality process, generalized to the other citable sections
              (<SectionRef s="citations" />): the audit re-examined every claim&ndash;citation pair
              against a fresh fetch of its source. Markers the source did not explicitly
              support were removed, and those sentences now show <em>citation needed</em>.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 4: Citation research and correction</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="review" /> Planned
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              A research pass over the audit&apos;s output, starting with pharmacology.
              Some errors in the corpus come from incorrect excerpts collected in
              phase one, and others may have been overlooked in phase three; this
              pass hunts both down. Each <em>citation needed</em> claim receives a
              source search. If a source is
              found, the marker is restored. If none is found, or the source disagrees, the
              claim is changed or removed. A recorded human pass then reviews the results.
              The site tracks this separately from editorial review (<SectionRef s="review" />), so each carries
              its own status and scope. Done when every flagged entry carries a recorded
              disposition.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 5: Emergent Subjective Effect Index</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="review" /> Planned
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              This is a new version of the Subjective Effect Index, developed by Josie Kins at
              Mindstate Design Labs. On release it replaces the current Subjective Effect
              Index, and the subjective effects section of every article is rebuilt on it.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 6: More substances</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="automated" /> Planned
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              The current substance set is the one the working copies cover. New
              substances are added by running the same pipeline on new source pages, then
              passing through the audit and review stages above.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={DOC_SUBHEAD_CLASS}>Phase 7: Editor and reader corrections</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="source" /> Ongoing
              </div>
            </div>
            <p className={DOC_PROSE_CLASS}>
              dose.wiki is a wiki, and errors will always happen. Editor corrections,
              messages sent through the article feedback form,
              replication evidence, and curated additions continue to build on the baseline.
            </p>
          </div>
        </ContentCard></section>

        <section id="dataset" className={DOC_SECTION_CLASS}><h2 className={DOC_SECTION_HEADING_CLASS}>
          <span className={DOC_SECTION_NUM_CLASS}>10</span>{" "}The open dataset
        </h2>

        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The pipeline produces{" "}
          <code>SubstanceIndex.json</code>: the full substance database in one consistent
          schema and one downloadable file. The download is a snapshot, made when the dataset
          is exported. The article database continues to change between snapshots.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          It also produces the molecule pack: one SVG drawing per substance, plus
          generic skeletons for chemical classes, plus a manifest that lists each
          drawing with its SMILES string and whether it was drawn by hand, aligned to a
          template, or left as an automatic layout. Each drawing is distributed in two
          color sets, the dose.wiki brand colors and the standard textbook colors. The pack
          is rebuilt every night from the live depiction database.
        </p>
        <p className={`${DOC_PROSE_CLASS} mt-4`}>
          The drafts come with their receipts. The prompts published on this page and
          the encyclopedia-building dataset show what went into each draft and how it
          was
          produced, so you can build your own encyclopedia pipeline or other things on
          top of it. Running the same pipeline will not necessarily produce the same
          article. Other sites and apps already make extensive use of the
          encyclopedia&apos;s content.
        </p>


        <div className="mt-6">
          <AboutArchivePreview
            previewSnapshots={previewSnapshots}
            downloads={{ substances: true, molecules: getMoleculePackDownloadStats() }}
          />
        </div>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>The public prose is new writing</h3>
            <p className={DOC_PROSE_CLASS}>
              Verbatim source text stays in internal excerpt files, like research notes.
              Published article prose is drafted under instructions not to copy source
              wording. The citation and editorial workflows can identify support problems
              or wording that needs correction. Facts are not copyrightable, and
              dose.wiki uses its own wording, schema, and article structure for the
              expression. dose.wiki content should be considered an original work
              interpreting its underlying sources, even when those sources are public
              domain or openly licensed, and should not be presented as quotes from
              them. dose.wiki attributes and links back to those sources wherever
              possible; if you quote from them directly, it is your responsibility to
              abide by their licenses.
            </p>
          </div>
          <div>
            <h3 className={DOC_SUBHEAD_CLASS}>The reusable parts are CC0</h3>
            <p className={DOC_PROSE_CLASS}>
              These parts are dedicated to the public domain under CC0: dose.wiki-authored
              writing, structured data, schema work, generated molecule assets, and
              feedback-form submissions whose contributors accept CC0 terms. Anyone can
              share, adapt, or build on them, commercially or not, with no attribution
              required. Legacy trip
              reports, TripSit data, ProtestKit data, and media with separate rights
              keep their own terms. The{" "}
              <a href="/docs/license" className={proseLinkClassName}>license page</a>{" "}
              lists those boundaries.
            </p>
          </div>
        </div>

        <ContentCard variant="subtle" padding="md" className="mt-10">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <Icon
                  icon="lucide:message-circle-question"
                  size={18}
                  className="theme-accent-heading shrink-0"
                />
                <h3 className={DOC_SUBHEAD_BASE_CLASS}>Questions or corrections?</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                For a mistake in a specific article, use the report-an-issue form at
                the bottom of that article. For anything broader, send a message
                through the{" "}
                <a href="/about/feedback" className={proseLinkClassName}>feedback form</a>{" "}
                or email{" "}
                <a href="mailto:contact@dose.wiki" className={proseLinkClassName}>
                  contact@dose.wiki
                </a>.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Icon icon="lucide:code" size={18} className="theme-accent-heading shrink-0" />
                <h3 className={DOC_SUBHEAD_BASE_CLASS}>How the site itself is built</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                This page covers article production. For the codebase, architecture, data
                layer, and public-site systems, read{" "}
                <a href="/docs/code" className={proseLinkClassName}>How dose.wiki is built</a>.
              </p>
            </div>
          </div>
        </ContentCard></section>

        {/*
          Back-to-top escape hatch for small screens. The sticky gutter TOC only
          appears at >=1200px, so below that this is the persistent way back to
          the top of a very long page. Hidden where the sticky TOC takes over.
        */}
        <Button
          asChild
          variant="glass"
          size="icon"
          aria-label="Back to top"
          className="fixed bottom-5 right-5 z-30 shadow-[var(--theme-elevation-lg)] backdrop-blur min-[1200px]:hidden"
        >
          <a href="#main-content">
            <Icon icon="lucide:arrow-up" size={18} />
          </a>
        </Button>
      </StickyTocLayout>
    </main>
  );
}
