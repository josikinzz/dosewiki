import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
// Source of truth for every prompt shown on this page. Published straight from the
// files the pipeline reads, so the page and the pipeline cannot disagree.
import blockSelectionContract from "../../../../scripts/prompts/block-selection-contract.md?raw";
import exDosageDuration from "../../../../scripts/prompts/dosage-duration-extraction.md?raw";
import exHarmPotential from "../../../../scripts/prompts/harm-potential-extraction.md?raw";
import exHistoryCulture from "../../../../scripts/prompts/history-culture-extraction.md?raw";
import exIntro from "../../../../scripts/prompts/intro-text-extraction.md?raw";
import exLegality from "../../../../scripts/prompts/legality-extraction.md?raw";
import exPharmacology from "../../../../scripts/prompts/pharmacology-extraction.md?raw";
import exSubjectiveEffects from "../../../../scripts/prompts/subjective-effects-extraction.md?raw";
import exTolerance from "../../../../scripts/prompts/tolerance-extraction.md?raw";
import secHarmPotential from "../../../data/config/sectionPrompts/harmPotential.md?raw";
import secHistoryCulture from "../../../data/config/sectionPrompts/historyCulture.md?raw";
import secLegality from "../../../data/config/sectionPrompts/legality.md?raw";
import secPharmacology from "../../../data/config/sectionPrompts/pharmacology.md?raw";
import secSummary from "../../../data/config/sectionPrompts/summary.md?raw";
import secTolerance from "../../../data/config/sectionPrompts/tolerance.md?raw";
import { DisclosureCard } from "@/components/common/DisclosureCard";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/surface";
import { Mermaid } from "../_components/Mermaid";

export async function generateMetadata() {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "How dose.wiki substance articles are made",
    description:
      copy.text("seo-docs-how-description") ||
      "A detailed walkthrough of the dose.wiki content pipeline: scraping, quote extraction, AI synthesis, citations, and editorial review.",
    pathname: "/docs/how",
  });
}

const TOC = [
  { id: "s0", label: "0. Status & roadmap", icon: "lucide:map" },
  { id: "s1", label: "1. Why this page exists", icon: "lucide:info" },
  { id: "s2", label: "2. The pipeline at a glance", icon: "lucide:workflow" },
  { id: "s3", label: "3. The ten source sites", icon: "lucide:database" },
  { id: "s4", label: "4. Per-section production methods", icon: "lucide:layout-list" },
  { id: "s5", label: "5. Scraping & parsing", icon: "lucide:globe" },
  { id: "s6", label: "6. Verbatim excerpt extraction", icon: "lucide:scissors" },
  { id: "s7", label: "7. AI synthesis & the prompts", icon: "lucide:sparkles" },
  { id: "s8", label: "8. Citations", icon: "lucide:quote" },
  { id: "s8b", label: "8b. Legality deep research", icon: "lucide:gavel" },
  { id: "s9", label: "9. Human review", icon: "lucide:user-check" },
  { id: "s10", label: "10. The open dataset", icon: "lucide:download" },
  { id: "s11", label: "11. Originality & licensing", icon: "lucide:scale" },
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

// Prompt bodies are bundled from their source-of-truth files, so this page cannot
// drift from the prompts the pipeline actually runs. Each import is a literal path so
// the bundler can trace it; a computed path makes Turbopack scan the whole repo.
const withSize = <T extends { body: string }>(entry: T) => ({
  ...entry,
  body: entry.body.trim(),
  sizeLabel: `${Math.max(1, Math.round(entry.body.trim().length / 1024))} KB`,
});

// The eight topic prompts, in pipeline order. Each defines what counts as relevant
// for its topic. None of them owns the output format (see BLOCK_CONTRACT).
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

// Appended after every extraction prompt at run time. It supersedes the output format
// each prompt describes, which is why it is published alongside them.
const BLOCK_CONTRACT = blockSelectionContract.trim();

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
  SITES["Source pages: 10 sites<br/>(internal working copies;<br/>full list in section 03)"]:::ext
  PARSE["Deterministic parsers<br/>dosage, duration, interactions,<br/>chemistry, legal tables"]:::auto
  EXTRACT["Verbatim excerpt extraction<br/>8 topics; a model selects source blocks,<br/>a script copies them out unchanged"]:::auto
  QUOTES[("Excerpt documents<br/>one per AI-written section")]:::data
  SYNTH["Section synthesis<br/>Claude Opus + one prompt<br/>per section, excerpts only"]:::auto
  REVIEW["Editorial review<br/>status: needed, in progress,<br/>or completed"]:::human
  DB[("Article database<br/>(drafts)")]:::data
  CITE["Citation pass<br/>markers proposed for<br/>the six citable sections"]:::auto
  PK["ProtestKit API<br/>live reagent test results"]:::ext
  PAGE["Published article"]:::pub
  JSON["SubstanceIndex.json<br/>free download of the<br/>whole dataset"]:::pub

  SITES --> PARSE
  SITES --> EXTRACT
  EXTRACT --> QUOTES
  QUOTES --> SYNTH
  PARSE --> DB
  SYNTH --> DB
  DB --> PAGE
  DB -.-> CITE
  CITE -.-> PAGE
  DB -.-> REVIEW
  REVIEW -.->|"status + attribution"| PAGE
  PAGE --> JSON
  PK -.->|"fetched live<br/>at page view"| PAGE

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef auto fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef human fill:#391a40,stroke:#e879f9,color:#f6e2fa
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb`;

// The legality deep-research workflow (section 08b). Same five-tone classDef
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
  WRITE["Human-confirmed write<br/>dry-run diff → explicit confirmation<br/>→ both deployments"]:::human
  CITED["Citation stage<br/>per-entry references with<br/>verbatim supporting quotes"]:::auto
  PAGE["Published legality section<br/>entries carry cite markers;<br/>unverified legacy claims flagged, never deleted"]:::pub

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

const SECTION_CLASS = "scroll-mt-24 border-t border-dose-border pt-10";
const SECTION_NUM_CLASS =
  "theme-text-faint mr-3 text-[0.65em] font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "type-section-title theme-accent-heading";
const SUBHEAD_CLASS =
  "theme-text-primary mb-2 text-lg font-semibold leading-snug";
const PROSE_CLASS = "theme-text-secondary leading-7";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const TABLE_WRAP_CLASS = "overflow-hidden";
const TABLE_SCROLL_CLASS =
  "overflow-x-auto max-sm:[mask-image:linear-gradient(to_left,transparent,black_2.5rem)]";
const TABLE_CLASS =
  "min-w-[760px] w-full border-collapse text-left text-sm [&_tbody_.rounded-full]:border-dose-border [&_tbody_.rounded-full]:bg-dose-surface-muted/80 [&_tbody_.rounded-full]:px-2 [&_tbody_.rounded-full]:py-0.5 [&_tbody_.rounded-full]:text-[0.6875rem] [&_tbody_.rounded-full]:leading-4 [&_tbody_.rounded-full]:text-dose-text-secondary [&_tbody_.rounded-full]:tracking-[0.11em] [&_tbody_small]:mt-1 [&_tbody_td]:border-b [&_tbody_td]:border-dose-border [&_tbody_td]:p-4 [&_tbody_td]:align-top [&_tbody_td:first-child]:min-w-[12rem] [&_tbody_td:first-child]:font-semibold [&_tbody_td:first-child]:text-dose-text [&_tbody_tr:last-child_td]:border-b-0";
const TABLE_HEAD_ROW_CLASS =
  "border-b border-dose-border bg-dose-surface-muted/55";
const TH_CLASS =
  "theme-text-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]";
const TR_CLASS =
  "align-top odd:bg-dose-surface-muted/35 even:bg-dose-surface/20";
const SWATCH_CLASS = "h-3 w-3 shrink-0 rounded-[3px]";
const LEGEND_CLASS = "mt-5 flex flex-wrap gap-x-5 gap-y-2";
const LEGEND_ITEM_CLASS =
  "theme-text-muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]";
const PIPELINE_STEP_CLASS =
  "theme-card-surface flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded-2xl border p-3 text-center";
const STEP_NUM_CLASS = "theme-accent-heading text-sm font-semibold tabular-nums";
const STEP_NAME_CLASS = "theme-accent-heading text-sm font-semibold";
const STEP_DETAIL_CLASS = "theme-text-muted text-xs leading-5";
const PIPELINE_ARROW_CLASS =
  "hidden shrink-0 items-center text-lg theme-icon-muted sm:flex";
const PROMPT_META_CLASS = "theme-text-muted mb-3 text-sm leading-6";
const PROMPT_BODY_CLASS =
  "theme-text-secondary max-h-[480px] overflow-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words shadow-[var(--theme-elevation-inner)]";
const PULL_CLASS =
  "theme-public-card-subtle theme-accent-heading theme-accent-emphasis font-display my-6 rounded-2xl border p-5 text-xl font-medium leading-8 shadow-[var(--theme-elevation-sm)]";

// Flattened "grouped explanation" surface: one ContentCard whose interior rows are
// separated by quiet token dividers (Divider Policy: divide-y is for card internals).
// Replaces the repeated identical-card grids that previously boxed each short
// label+paragraph individually. DIVIDED_LIST_CLASS goes on a padding="none" card.
const DIVIDED_LIST_CLASS = "divide-y divide-dose-border";
const DIVIDED_ITEM_CLASS = "px-5 py-5 sm:px-6";
// Demoted informational note: emphasized prose on a quiet subtle surface (no
// role="alert"), used where Alert variant="default" previously carried no status.
const NOTE_CLASS = `${PROSE_CLASS} text-[0.9375rem]`;


// Pipeline-stage categories. Color carries category, but each step also renders a
// redundant text label (see PipelineStep) so meaning never depends on color alone.
// Tokens resolve in both themes; no inline hex, no banned sky/teal, green reserved
// for the genuinely "published / success" stage only.
type StageTone = "source" | "automated" | "stored" | "review" | "published";
const STAGE_TONE: Record<
  StageTone,
  { label: string; accentVar: string }
> = {
  // Swatch colors intentionally mirror the Mermaid diagram classDef strokes
  // (ext/auto/data/human/pub) below; this legend is the key for those
  // diagrams. Charts carry the dark-theme strokes verbatim; in light mode the
  // Mermaid component remaps each to a darker same-hue variant (LIGHT_PALETTE
  // in docs/_components/Mermaid.tsx), so the five hues must stay in lockstep
  // across both maps rather than collapse onto shared theme tokens.
  source: { label: "Source", accentVar: "#f9a8d4" },
  automated: { label: "Automated", accentVar: "#fdba74" },
  stored: { label: "Stored", accentVar: "#6ee7b7" },
  review: { label: "Review", accentVar: "#e879f9" },
  published: { label: "Published", accentVar: "#7dd3fc" },
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
  const { label, accentVar } = STAGE_TONE[tone];
  return (
    <div className={PIPELINE_STEP_CLASS} style={{ borderColor: accentVar }}>
      <div className="flex items-baseline justify-center gap-2">
        <span className={STEP_NUM_CLASS}>{num}</span>
        <span className={STAGE_TAG_CLASS} style={{ color: accentVar }}>
          {label}
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

// Section cross-references. Prose used to say "section 08" and make the reader
// recall the numbering map; every mention now links to the section and carries
// its title. `comma` renders "section 08, Citations" for use inside an existing
// parenthetical; the default renders "section 08 (Citations)".
const SECTION_TITLES = {
  s0: { num: "00", title: "Status & roadmap" },
  s1: { num: "01", title: "Why this page exists" },
  s2: { num: "02", title: "The pipeline at a glance" },
  s3: { num: "03", title: "The ten source sites" },
  s4: { num: "04", title: "Per-section production methods" },
  s5: { num: "05", title: "Scraping & parsing" },
  s6: { num: "06", title: "Verbatim excerpt extraction" },
  s7: { num: "07", title: "AI synthesis & the prompts" },
  s8: { num: "08", title: "Citations" },
  s8b: { num: "08b", title: "Legality deep research" },
  s9: { num: "09", title: "Human review" },
  s10: { num: "10", title: "The open dataset" },
  s11: { num: "11", title: "Originality & licensing" },
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

export default function DocsHowPage() {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={<PublicTableOfContents items={[...TOC]} variant="bare" />}
        maxWidthClass="max-w-4xl"
        className="theme-toc-strip-scope"
        contentClassName="gap-10"
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned
            under the site header from the very first scroll; replaced by
            the sticky gutter TOC at >=1200px. */}
        <PublicTocStrip items={[...TOC]} />

        <header className="flex flex-col gap-4">
          <h1 className="type-page-title theme-accent-heading">
            How dose.wiki substance articles are made
          </h1>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            A dose.wiki substance article is assembled from{" "}
            <strong>several distinct bodies of work</strong>, each with a different origin and a
            different production method. This page documents the whole process end to end, including
            the exact prompts we use, and where each verification stage stands today. dose.wiki is
            in beta, and these articles are living documents (<SectionRef s="s0" comma />).
          </p>
        </header>

        <section id="s0" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>00</span>{" "}Status, roadmap &amp; corrections
        </h2>
        
        <p className={PULL_CLASS}>
          dose.wiki is in <strong>beta</strong>. Every article is a living document: generated,
          verified, and corrected in public, in stages that are still running.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          Read this site stage by stage: some verification work is finished,
          some is running now, and some is planned. This section records where each stage stands
          as of <strong>August 31, 2026</strong> and lists corrections as they land. None of it is
          a warranty for an individual sentence; <SectionRef s="s8" /> and <SectionRef s="s9" />{" "}
          describe exactly what each workflow does and does not establish.
        </p>
        
        <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 1: Foundation pipeline</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={PROSE_CLASS}>
              Scraping, verbatim excerpt extraction, AI synthesis, and claim-level citations across
              the archival sources. This is the pipeline sections{" "}
              <a href="#s2" className={proseLinkClassName}>02</a> through{" "}
              <a href="#s8" className={proseLinkClassName}>08</a> describe, with
              every prompt published on this page.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 2: Legality primary-source remediation</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={PROSE_CLASS}>
              The country-by-country deep research in{" "}
              <a href="#s8b" className={proseLinkClassName}>section 08b</a>. Existing legality entries were
              validated against statutes and official schedules where possible; remaining claims got
              targeted primary-source hunts; entries that survived were cited, and entries that
              could not be sourced were corrected, removed, or flagged <em>citation needed</em>.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 3: Citation entailment audit</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="automated" /> In progress
              </div>
            </div>
            <p className={PROSE_CLASS}>
              The legality process, generalized: an automated campaign re-verifies each
              claim–citation pair in the six citable sections (<SectionRef s="s8" comma />) against a fresh fetch
              of the cited source. A marker stays only when the source entails the claim as
              written. Otherwise
              the marker is removed and the sentence shows a visible <em>citation needed</em>{" "}
              indicator instead of borrowing authority from a reference that does not support it.
              Safety-sensitive pairs additionally face an independent adversarial re-check before
              any change is accepted. Done when every pair carries a recorded verdict.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 4: Human citation review</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="review" /> Planned
              </div>
            </div>
            <p className={PROSE_CLASS}>
              A recorded human pass over the audit&apos;s output: working through surviving pairs
              and the <em>citation needed</em> backlog, replacing or restoring sources by hand.
              This will be tracked separately from editorial review (
              <a href="#s9" className={proseLinkClassName}>section 09</a>), so each carries
              its own status and its own named scope. Done when every surviving pair and every
              flagged entry carries a recorded human disposition.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 5: Continuous improvement</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="source" /> Ongoing
              </div>
            </div>
            <p className={PROSE_CLASS}>
              Articles are never finished. New sources, reader reports, replication evidence, and
              corrections keep landing, and any regenerated or edited content is expected to return
              through the verification stages above.
            </p>
          </div>
        </ContentCard></section>

        <section id="s1" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>01</span>{" "}Why this page exists
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          Every substance article links here from its <strong>source pages</strong> section. This is
          one shared explanation of where article content comes from, not a per-article audit log.
          Different parts of an article come from different places:
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Subjective effects</h3>
            <p className={PROSE_CLASS}>
              Effect listings link into the Subjective Effect Index, the
              taxonomy{" "}
              <strong>
                <a
                  href="https://en.wikipedia.org/wiki/Josie_Kins"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={proseLinkClassName}
                >
                  Josie Kins
                </a>
              </strong>{" "}
              created on Disregard Everything I Say in 2011. The article
              sections are a mixture: her earlier versions where they exist,
              otherwise synthesized from other sources with her own projects
              excluded.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Interactions</h3>
            <p className={PROSE_CLASS}>
              Derived from <strong>TripSit's</strong> drug-combination research. Its chart informs
              the risk ratings displayed where interaction data is available.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Reagent tests</h3>
            <p className={PROSE_CLASS}>
              Sourced live from <strong>protestkit.eu</strong>. dose.wiki fetches the color reactions
              from their API when you open an article.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>The other sections</h3>
            <p className={PROSE_CLASS}>
              Synthesized from <strong>archival source material</strong>: ten reference and
              harm-reduction sites, processed through the parsing, excerpting, and writing stages this
              page describes.
            </p>
          </div>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}>Two distinctions matter across all of it:</p>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>Provenance is not proof.</strong> Source-page links document material that
          informed the pipeline. They do not, by themselves, show that a source supports a
          particular sentence. Claim-level citation markers are the separate, intended
          source-to-claim relationships described in <SectionRef s="s8" />.
        </p>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>Workflow controls are not guarantees.</strong> Prompts, validators, citation
          evidence, and editorial review reduce error and make decisions inspectable. They cannot
          guarantee that prose is complete, that a citation entails every nearby phrase, or that
          information remains current. Important claims still require human verification against
          the cited source.
        </p></section>

        <section id="s2" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>02</span>{" "}The pipeline at a glance
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          dose.wiki gathers the source pages once, as internal working copies. From there they flow
          through two tracks that run in parallel. The <strong>deterministic track</strong> parses
          structured data such as dosage tables and interaction matrices. The <strong>AI track</strong>{" "}
          turns the prose parts of the sources into excerpt documents, then into draft sections.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Both tracks fill one draft article. Citation and editorial-review workflows can then add
          markers, evidence records, corrections, and status metadata. Published coverage varies by
          article, so the diagram describes the intended relationships rather than a publication gate.
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

        <section id="s3" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>03</span>{" "}The ten source sites
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          Article content is built from ten harm-reduction and reference sites, plus one live API. We
          keep internal working copies of the relevant pages for processing. We do not republish other
          sites' content. Each article's <strong>source pages</strong> section links out to the
          original pages on the source sites themselves.
        </p>
        
        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className={TH_CLASS}>Source</th>
                <th className={`${TH_CLASS} min-w-[14rem]`}>What we take from it</th>
                <th className={TH_CLASS}>How it is processed</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={TR_CLASS}>
                <td className="p-3">PsychonautWiki</td>
                <td className="p-3">
                  Dosage and duration tables, subjective effects by intensity, toxicity /
                  interaction / tolerance prose, legal status, chemistry identifiers, pharmacology
                  prose.
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  TripSit{" "}
                  <small className="theme-text-faint block">
                    three feeds: factsheets, wiki, combination guide
                  </small>
                </td>
                <td className="p-3">
                  Dosage tables, duration by route, effects lists, the drug-combination interaction
                  chart (dangerous / unsafe / caution / low-risk ratings), tolerance prose,
                  classifications.
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Erowid</td>
                <td className="p-3">
                  Dosage and duration ranges, effects descriptions, legal status, harm-reduction and
                  safety warnings, general narratives.
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Wikipedia</td>
                <td className="p-3">
                  General overviews, history, chemistry identifiers. Also used to discover citable
                  references, but never cited as a reference itself (
                  <a href="#s8" className={proseLinkClassName}>section 08</a>).
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">DrugBank</td>
                <td className="p-3">
                  Chemical data (molecular weight, formula, CAS numbers), pharmacology descriptions,
                  drug and food interactions.
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Isomer Design</td>
                <td className="p-3">Effects and experience prose, chemical reference data.</td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">SaferParty</td>
                <td className="p-3">
                  Harm reduction guidance, risk descriptions, safer-use notes.
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">The Drug Classroom</td>
                <td className="p-3">
                  Educational overviews, mechanism and effects descriptions.
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Disregard Everything I Say</td>
                <td className="p-3">Subjective effect narratives and substance overviews.</td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Drug Users Bible</td>
                <td className="p-3">
                  Dosage, effects, and legality information, plus street-name nomenclature.
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  ProtestKit <small className="theme-text-faint block">live API</small>
                </td>
                <td className="p-3">
                  Reagent test color reactions (Marquis, Mecke, Mandelin, Simon's, Froehde,
                  Liebermann, Ehrlich, and others), fetched at page view through a rate-limited proxy
                  with a static fallback.
                </td>
                <td className="p-3">
                  <Badge variant="secondary">live API</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  Stored, not yet used{" "}
                  <small className="theme-text-faint block">
                    Bluelight, D. M. Turner, Nervewing
                  </small>
                </td>
                <td className="p-3">
                  Archived in the source corpus, but no parser reads them yet. They feed no article
                  content.
                </td>
                <td className="p-3">
                  <Badge variant="secondary">archived only</Badge>
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </ContentCard></section>

        <section id="s4" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>04</span>{" "}Per-section production methods
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          A substance article is not one document with one origin. Each section has its own production
          method. This table records which sections a model synthesizes, which ones code parses from
          source tables, which come from a live API, and which people curate by hand. The citation
          workflow targets the six citable sections (<SectionRef s="s8" comma />); structured and excluded sections use
          separate provenance and review paths.
        </p>
        
        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> AI-synthesized from excerpts
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> Parsed by code
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> Live API
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> Manual / curated
          </div>
        </div>
        
        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className={TH_CLASS}>Article section</th>
                <th className={TH_CLASS}>Method</th>
                <th className={`${TH_CLASS} min-w-[14rem]`}>How it is made</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={TR_CLASS}>
                <td className="p-3">Summary</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  50–80 word overview written by Claude Opus from the intro-text excerpts, under
                  the summary prompt (readable in{" "}
                  <a href="#s7" className={proseLinkClassName}>section 07</a>).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  Identification{" "}
                  <small className="theme-text-faint block">chemical names, SMILES, InChI, CAS</small>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="success">curated</Badge>
                </td>
                <td className="p-3">
                  Chemistry identifiers merged from parsed sources (DrugBank, PsychonautWiki,
                  Wikipedia) with chemical-name resolution. Provenance is tracked per identifier, and
                  an editor checks the result.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  Classification{" "}
                  <small className="theme-text-faint block">psychoactive / chemical classes</small>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="success">curated</Badge>
                </td>
                <td className="p-3">
                  Class assignments come from parsed sources. Editors hand-curate the site-wide
                  classification trees.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Dosage tables</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  Dose ranges per route parsed directly from TripSit, PsychonautWiki, and Erowid
                  tables, under the lowest-upper-bound rule (
                  <a href="#s5" className={proseLinkClassName}>section 05</a>).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Duration tables</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  Onset / peak / offset values per route, parsed from the same sources.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Subjective effects</td>
                <td className="p-3">
                  <Badge variant="default">Mixed</Badge>
                </td>
                <td className="p-3">
                  Restored Josie Kins versions where they exist, otherwise
                  synthesized from other sources with her own projects excluded
                  (<a href="#s1" className={proseLinkClassName}>section 01</a>). Every effect links into the Subjective Effect
                  Index.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Pharmacology</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  Mechanism-of-action prose written from the pharmacology excerpts under the
                  pharmacology prompt, the strictest and longest of the prompts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Interactions</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  Drug-combination risk ratings mapped directly from the TripSit combination guide.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Harm potential</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  Toxicity, addiction, and risk prose written from the harm-potential excerpts under
                  the harm potential prompt.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Tolerance</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  Tolerance and cross-tolerance prose from the tolerance excerpts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Legality</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  Country-by-country legal status from the legality excerpts. Code also prepopulates the
                  structured legal fields where sources state them plainly.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">History &amp; culture</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  Discovery, medical history, and cultural context from the history-culture excerpts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Reagent testing</td>
                <td className="p-3">
                  <Badge variant="secondary">live API</Badge>
                </td>
                <td className="p-3">
                  Color reactions fetched live from the ProtestKit API at page view, with stored
                  static results as fallback. Not produced by our pipeline at all.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Citations &amp; references</td>
                <td className="space-y-1 p-3">
                  <Badge variant="default">workflow-proposed</Badge>{" "}
                  <Badge variant="secondary">structurally validated</Badge>
                </td>
                <td className="p-3">
                  References and markers proposed by the citation workflow for the six citable
                  sections. <SectionRef s="s8" cap /> defines exactly what a marker does and does not establish.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Trip reports</td>
                <td className="p-3">
                  <Badge variant="success">human-written</Badge>
                </td>
                <td className="p-3">
                  First-person experience reports written by people, imported from the Effect Index
                  corpus with attribution.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Notes</td>
                <td className="p-3">
                  <Badge variant="success">manual</Badge>
                </td>
                <td className="p-3">Editor-written remarks and caveats.</td>
              </tr>
            </tbody>
            </table>
          </div>
        </ContentCard></section>

        <section id="s5" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>05</span>{" "}Scraping &amp; parsing
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          dose.wiki scraped the source sites once and stored them as plain-text working copies, one
          per substance. These are internal processing material only (<SectionRef s="s3" comma />).
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          From there, <strong>deterministic parsers</strong> read that text and extract the structured
          data: dose ranges by route, duration values, interaction ratings, chemical identifiers, and
          legal classifications. A parser is ordinary code, one per source site, with no AI involved.
          Each site needs its own parser, because each site structures its pages differently.
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Table parsers</h3>
            <p className={PROSE_CLASS}>
              <strong>TripSit factsheets</strong> and <strong>PsychonautWiki</strong> carry the most
              structured data: dose tiers (threshold / light / common / strong / heavy) per route of
              administration and onset / peak / offset durations. The parsers read these tables
              directly and transcribe the numbers as published. Selecting one source's numbers when
              sources disagree is not the parser's job; it happens later, when the parsed tables are
              merged into the article. That merge applies the <strong>lowest-upper-bound rule</strong>:
              among weight-unit sources it keeps the entry with the lowest comparable upper bound
              (heavy minimum when present, otherwise strong maximum, then strong minimum, then common
              maximum), tie-broken toward the source that fills more dose tiers; when no source gives
              weight units, a fixed source-priority order decides. This is a deliberate safety bias:
              underdosing is the safer error.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>The combination chart</h3>
            <p className={PROSE_CLASS}>
              A parser reads the <strong>TripSit combination guide</strong> as structured data and
              maps it onto substance pairs. That produces the interaction ratings (dangerous, unsafe,
              caution, low-risk) shown where an article has matching interaction data and on the
              Interactions hub.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Chemistry identifiers</h3>
            <p className={PROSE_CLASS}>
              dose.wiki merges SMILES strings, InChI keys, CAS numbers, and molecular data from{" "}
              <strong>DrugBank</strong>, <strong>PsychonautWiki</strong>, and{" "}
              <strong>Wikipedia</strong>. Provenance is tracked per identifier, and chemical-name
              resolution fills the gaps. The molecule images are rendered from the SMILES strings.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Prose-heavy sources</h3>
            <p className={PROSE_CLASS}>
              <strong>Erowid</strong>, <strong>Isomer Design</strong>, <strong>SaferParty</strong>,{" "}
              <strong>The Drug Classroom</strong>, <strong>Disregard Everything I Say</strong>, and the{" "}
              <strong>Drug Users Bible</strong> contribute mostly narrative text. Their parsers
              identify and label the relevant passages, which then feed the excerpt-extraction stage
              below.
            </p>
          </div>
        </div></section>

        <section id="s6" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>06</span>{" "}Verbatim excerpt extraction
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          The source articles are long, and most of any given page is irrelevant to any one section.
          Before any writing happens, an extraction pass reads every source article and{" "}
          <strong>copies out the passages relevant to each topic, word for word</strong>.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Nothing is paraphrased, summarized, or reworded. An excerpt document holds exact copies of
          source text: complete paragraphs, formatting preserved, grouped under a heading for each
          source. The result is one <strong>excerpt document</strong> per substance per topic, across
          eight topics:
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>The excerpt topics</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>Intro text (feeds the summary)</li>
              <li>Dosage &amp; duration</li>
              <li>Subjective effects</li>
              <li>Pharmacology</li>
              <li>Tolerance</li>
              <li>Harm potential</li>
              <li>History &amp; culture</li>
              <li>Legality</li>
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>The model never types the text</h3>
            <p className={PROSE_CLASS}>
              Each source document is first split into numbered <strong>blocks</strong> (paragraphs,
              list items, table rows, headings), and the model reads that block-indexed version. It
              replies with nothing but the <strong>ids of the blocks to keep</strong>. A script then
              copies those blocks out of the source character for character and assembles the excerpt
              file. Because the model never emits source text, it has no opportunity to alter it.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              We built it the other way first, and it did not hold. Asking a model to reproduce a
              passage is asking it to re-type the passage, and re-typing is where drift enters. One
              batch of 47 files turned an "antihistamine" into an "antihistaminic", dropped a
              "however,", and shortened an organization's name by two words. These are small edits,
              easy to miss, in text whose only job is to be an exact copy. Selecting blocks instead of
              transcribing them removes the opportunity rather than warning against it.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Checked afterwards, not trusted</h3>
            <p className={PROSE_CLASS}>
              A <strong>verbatim audit</strong> then reads every finished excerpt file. The audit is
              a script, with no model involved. It requires each passage to appear in the staged
              source, under the same source heading, as an exact substring. A file that drifts is
              rejected rather than passed onward.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              Every source keeps its heading in the output even when it yielded nothing. Those
              headings carry a marker line such as <em>No tolerance content found.</em>, which keeps
              "we looked and there was nothing" distinct from "this source was skipped".
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Why verbatim matters</h3>
            <p className={PROSE_CLASS}>
              The excerpt documents are the <strong>only material</strong> the writing stage is allowed
              to see. Because they are word-for-word copies, a reviewer can trace anything a draft
              says back to a specific passage on a specific source page. Extraction errs toward
              over-inclusion. The instruction is to keep anything even tangentially relevant, rather
              than risk losing safety-critical information.
            </p>
          </div>
        </div>
        
        <h3 className={`${SUBHEAD_CLASS} mt-8`}>A real excerpt document</h3>
        <DisclosureCard
          variant="subtle"
          summary="Example: the 2C-B intro-text excerpt document (unedited)"
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            This is the actual working file for 2C-B's intro-text topic: verbatim passages from each
            source, grouped under source headings. The summary section of the 2C-B article was
            written from this document and nothing else.
          </p>
          <pre className={PROMPT_BODY_CLASS}>{INTRO_QUOTES}</pre>
        </DisclosureCard>
        
        <h3 className={`${SUBHEAD_CLASS} mt-8`}>The extraction prompts</h3>
        <p className={`${PROSE_CLASS} mb-3 mt-2`}>
          All eight extraction prompts appear below, unedited. This page reads them straight from{" "}
          <code>scripts/prompts/</code> when it builds, so they are the same files the pipeline runs.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Every topic runs the same way. One model (<code>gpt-5.6-terra</code>, invoked through{" "}
          <code>codex exec</code>) gets one call per substance and topic. The harness then appends the
          block-selection contract to whichever prompt it is running.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The eight share one skeleton: hard verbatim rules, an input format, and empty-result
          handling. They differ mainly in their "what counts" sections. Read one prompt in full, then
          skim the others for that section.
        </p>
        
        <ContentCard variant="subtle" padding="md" className="mt-5">
          <p className={NOTE_CLASS}>
            <strong>Read the block-selection contract first.</strong> Each prompt below still carries
            an "Output format" section describing an excerpt file. The contract replaces those
            sections at run time. A prompt defines what counts as relevant for its topic. The harness
            owns what the model actually returns, which is a list of block ids and nothing else.
          </p>
        </ContentCard>
        
        <DisclosureCard
          variant="subtle"
          summary="The block-selection contract, appended after every prompt below"
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            The harness appends this text to all eight prompts, replacing{" "}
            <code>{"{{TOPIC}}"}</code> with the topic name. This is the instruction that makes the
            excerpts verbatim. The model names blocks, and a script copies them out.
          </p>
          <pre className={PROMPT_BODY_CLASS}>{BLOCK_CONTRACT}</pre>
        </DisclosureCard>
        
        {EXTRACTION_PROMPTS.map((prompt) => (
          <DisclosureCard
            key={prompt.slug}
            variant="subtle"
            summary={`Extraction prompt: ${prompt.label} (${prompt.sizeLabel})`}
            className="mt-3"
          >
            <p className={PROMPT_META_CLASS}>
              The block-selection contract above supersedes this prompt's "Output format" section.
            </p>
            <pre className={PROMPT_BODY_CLASS}>{prompt.body}</pre>
          </DisclosureCard>
        ))}</section>

        <section id="s7" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>07</span>{" "}AI synthesis, and every prompt we use
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          Six sections of the finished article are AI-written end to end:{" "}
          <strong>
            summary, pharmacology, tolerance, harm potential, history &amp; culture, and legality
          </strong>
        . Claude Opus writes each one from exactly two inputs: the excerpt document for that
          topic, and a <strong>section-specific prompt</strong>. (A maintainer detail: the model is
          pinned per section in <code>scripts/batch/&lt;section&gt;/cli.mjs</code> and can be
          overridden with <code>OPENROUTER_MODEL</code>.)
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The two remaining excerpt topics, dosage &amp; duration and subjective effects, serve a
          narrower purpose. Those sections come from parsed tables and from Josie Kins' effect
          taxonomy. Their excerpts only fill documented gaps, and never overwrite what is already
          there.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The prompts share one skeleton: a style definition, a hard evidence rule, a fixed output
          format, worked examples, and a checklist. All of them carry the same two constraints:
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Evidence only</h3>
            <p className={PROSE_CLASS}>
              The prompts instruct the model to include only information explicitly stated or clearly
              implied in the supplied quotes, and to omit information it cannot verify there. This
              encourages evidence-constrained drafting; workflow controls are not guarantees
              (<a href="#s1" className={proseLinkClassName}>section 01</a>).
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Original prose only</h3>
            <p className={PROSE_CLASS}>
              "Synthesize information from the provided excerpts into original prose. Do not copy
        sentences or lengthy phrases verbatim from any source." The verbatim text exists only in
              the internal excerpt documents. What gets published is a new piece of writing, held in
              place by that evidence.
            </p>
          </div>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}>
          The section prompts for all six fully AI-written sections appear below, largest first. This
          page reads them from <code>src/data/config/sectionPrompts/</code> when it builds. Those files
          are the seeds the editorial team's live copies are migrated from, and{" "}
          <code>npm run prompts:compare</code> reports any drift between the two.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The pharmacology and harm potential prompts are the fastest way to see how much of each
          section's quality comes from the prompt rather than the model.
        </p>
        
        {SECTION_PROMPTS.map((prompt) => (
          <DisclosureCard
            key={prompt.slug}
            variant="subtle"
            summary={`Section prompt: ${prompt.label} (${prompt.sizeLabel})`}
            className="mt-3"
          >
            <pre className={PROMPT_BODY_CLASS}>{prompt.body}</pre>
          </DisclosureCard>
        ))}
        
        <ContentCard variant="subtle" padding="md" className="mt-5">
          <p className={NOTE_CLASS}>
            <strong>The prompts are part of the project.</strong> They are version-controlled alongside
            the code, and the live copies are editable by the editorial team. Improving a prompt
            changes future generation runs that use it. There is also a separate family of citation
            prompts used by the citation workflow (
            <a href="#s8" className={proseLinkClassName}>section 08</a>).
          </p>
        </ContentCard></section>

        <section id="s8" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>08</span>{" "}Citations
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          After prose is drafted, a separate workflow can add Wikipedia-style markers to the six
          AI-written sections listed in <SectionRef s="s7" />; these are the{" "}
          <strong>citable sections</strong>. Other sections use separate provenance or editorial
          workflows. Coverage is
          intentionally conservative and incomplete: a marker should appear only when inspected
          evidence supports a useful nearby claim, while unsupported or uncertain relationships
          remain internal gaps rather than public promises.
        </p>
        
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep num={1} name="Identify claims" tone="automated">
            Workers inspect the citable prose and choose bounded claims that may need support
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name="Inspect references" tone="automated">
            Workers inspect candidate sources and record the relationship they believe each source supports
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name="Mark" tone="automated">
        The workflow inserts citation markers into the text. Nothing else changes, byte for byte
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name="Record evidence" tone="stored">
            The workflow records a short source quote and rationale behind each proposed marker
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={5} name="Validate structure" tone="stored">
            Deterministic gates check marker, reference, and evidence consistency before a draft can be reviewed
          </PipelineStep>
        </div>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Reference standards</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>
                <strong>Wikis are discovery sources, not final references.</strong> The workflow uses
                Wikipedia and PsychonautWiki to find candidates, while final references are intended
                to be inspectable journals, government documents, drug labels, books, or databases.
              </li>
              <li>
                <strong>Page-specific identifiers.</strong> Repeated same-site sources, for example
                DailyMed drug labels, receive distinct per-page reference IDs so separate documents
                remain separate during review.
              </li>
              <li>
                <strong>Access limitations stay visible.</strong> A paywalled paper may be used when
                its accessible abstract supports the relevant claim; the record notes
                <em> abstract-only</em> access so reviewers know what was inspected.
              </li>
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>What a citation means</h3>
            <p className={PROSE_CLASS}>
              Citations render as numbered markers linked to the reference list. Behind a marker, the
              workflow retains a quote and rationale as review evidence. This records the intended
              relationship and its provenance; it does not prove entailment, source quality, or
              current accuracy. Readers and editors should inspect the referenced source before
              relying on a consequential claim.
            </p>
          </div>
        </div></section>

        <section id="s8b" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>08b</span>{" "}Legality: targeted deep research
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          Legality is the hardest section to keep correct. Drug law changes often, differs by
          country, and most online summaries cite other summaries. So the legality section gets its
          own deep-research workflow, separate from the main pipeline in{" "}
          <a href="#s2" className={proseLinkClassName}>section 02</a>. The workflow
          reads primary legal sources only: statutes, official schedules, and government
          legislation portals.
        </p>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          One orchestrator agent runs the workflow for one substance at a time, launching many
          small research agents in parallel; each starts with a <strong>blank context</strong>,
          one narrow question, and a strict output contract. Research and refutation are never the
          same agent: every surviving claim faces an independent blank-context refuter, and a
          refuted claim becomes a recorded gap or re-enters research for at most two recovery
          cycles. The diagram below walks the full sequence, from export packet through the cite,
          discovery, gap, and correction passes to the US state pass, merge, and human-confirmed
          write.
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
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Invariants</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>
                <strong>No entry enters the draft without a primary source</strong> (no source ⇒
                recorded gap, never published).
              </li>
              <li>
                <strong>Research and refutation are always separate blank-context agents.</strong>
              </li>
              <li>
                <strong>A human confirms every write.</strong>
              </li>
              <li>
                <strong>
                  Unverifiable legacy claims are flagged <em>citationNeeded</em>
                </strong>
                , never silently edited or deleted.
              </li>
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Where this goes next</h3>
            <p className={PROSE_CLASS}>
              This pattern is now the template. The same loop (validate what can be validated,
              cite what a primary source supports, hunt targeted sources for the rest, and correct
              or remove what cannot be sourced) is being extended to the other citable sections as
              the phase-3 citation entailment audit (
              <a href="#s0" className={proseLinkClassName}>
                section 00
              </a>
              ), with the same separation between blank-context research, adversarial refutation,
              and human-confirmed writes.
            </p>
          </div>
        </div></section>

        <section id="s9" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>09</span>{" "}Human review status and scope
        </h2>
        
        <p className={PULL_CLASS}>
          Editorial review is a <strong>recorded human workflow state</strong>, not a blanket
          warranty for an article or its sources.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          The review workbench stores one of three statuses: <strong>needed</strong>,{" "}
          <strong>in progress</strong>, or <strong>completed</strong>. Completed means a human
          editor recorded a review at a point in time. When the stored reviewer identity resolves
          to a public contributor profile, the article can attribute that specific review. The
          status does not mean that one named person reviewed the whole corpus, and it does not
          certify every sentence, dose, interaction, citation, or legal conclusion.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          Editorial review and citation verification are <strong>separate tracks</strong>. The
          editorial reviewer reads and corrects the article text. Citation markers are attached
          and re-verified by the <a href="#s8" className={proseLinkClassName}>section 08</a>{" "}
          workflows and the phase-3 audit (
          <a href="#s0" className={proseLinkClassName}>section 00</a>), which
          run under their own recorded states. An editorial-review credit therefore does not
          assert that the article&apos;s citations were verified, and citation states (including
          the visible <em>citation needed</em> indicator) are workflow records, never the
          reviewer&apos;s personal claims.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          The current completed status is not bound to an immutable digest of the exact article
          revision. Later edits can therefore make an older completion record stale without
          automatically changing its stored status. Readers should interpret the status as
          editorial context, check dates and citations where available, and report discrepancies.
        </p>
        
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep num={1} name="Inspect" tone="review">
            A reviewer reads the article and follows the sources relevant to the review
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name="Verify" tone="review">
            The reviewer checks important claims and records uncertainty rather than assuming coverage
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name="Edit" tone="review">
            Corrections use the editor's normal diff and save workflow
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name="Record status" tone="stored">
            The separate review action stores status, reviewer identity, and completion time
          </PipelineStep>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}>
          Editor saves and review status are related but distinct records. A changelog can show who
          changed text and when; a review tick can show that a review was marked complete. Neither
          record is citation verification;{" "}
          <a href="#s1" className={proseLinkClassName}>section 01</a>&apos;s distinctions apply. Generated or
          edited content should return to human review, and the public status should be read with
          that limitation in mind.
        </p></section>

        <section id="s10" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>10</span>{" "}The open dataset
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          This pipeline produces more than public pages. It produces{" "}
        <code>SubstanceIndex.json</code>: the full substance database in one consistent schema and
          one downloadable file.
        </p>
        
        <p className={PULL_CLASS}>
          dose.wiki is an open-source harm-reduction reference for psychoactive substances and
          subjective effects. One downloadable, consistently structured corpus keeps that knowledge
          verifiable and reusable instead of scattered across separate sites and closed data systems.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
        The dataset is not a byproduct of the website. It is part of the point. Researchers,
          developers, educators, and community projects can download the corpus, examine its
          structure, fork it, and build on it. Nobody has to rebuild a harm-reduction encyclopedia
          from scratch to get better tools around the same knowledge. <SectionRef s="s11" cap /> covers the licensing
          terms.
        </p></section>

        <section id="s11" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>11</span>{" "}Originality &amp; licensing
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          This pipeline begins with published sources, so the licensing boundary matters: sources
          inform the work, while the public dataset uses dose.wiki wording and structure. Source
          provenance, citation support, and editorial review remain separate questions.
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>The public prose is new writing</h3>
            <p className={PROSE_CLASS}>
              Verbatim source text stays in internal excerpt files, like research notes. Published
              article prose is drafted with instructions not to copy source wording. Citation and
              editorial workflows can then identify support problems or wording that needs correction.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Facts are not owned</h3>
            <p className={PROSE_CLASS}>
              A synthesis year, dose range, receptor target, or legal status may be a fact, but its
              presentation and support still need checking. Copyright protects expression, not facts;
              dose.wiki uses its own wording, schema, and article structure without treating that
              originality as evidence that a claim is accurate.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Provenance and support stay distinct</h3>
            <p className={PROSE_CLASS}>
              Source-page links show where material entered the pipeline. Citation markers record
              intended evidentiary relationships for particular claims. Both remain open to human
              verification and correction; <a href="#s1" className={proseLinkClassName}>section 01</a>{" "}
              states the two distinctions in full.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>The reusable parts are CC0</h3>
            <p className={PROSE_CLASS}>
              dose.wiki-authored writing, structured data, schema work, generated molecule assets, and
              report-form submissions whose contributors accept CC0 terms are dedicated to the{" "}
        <strong>public domain under CC0</strong>. Anyone can share, adapt, or build on them,
              commercially or not, with no attribution required. Legacy trip reports, TripSit data,
              protestkit.eu data, and media with separate rights keep their own terms. The{" "}
              <a href="/docs/license" target="_top" className={proseLinkClassName}>
                license page
              </a>{" "}
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
                <h3 className={`${SUBHEAD_CLASS} mb-0`}>Questions or corrections?</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                The parsers, prompts, and citation tooling described here live in the project
                repository. Each article exposes its citations and source links, and dose.wiki keeps
                an internal edit history showing how the article reached its current state.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Icon icon="lucide:code" size={18} className="theme-accent-heading shrink-0" />
                <h3 className={`${SUBHEAD_CLASS} mb-0`}>Curious how the site itself is built?</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                This page covers article production. For the codebase, architecture, data layer, and
                public-site systems, read{" "}
                <a href="/docs/code" target="_top" className={proseLinkClassName}>
                  How dose.wiki is built
                </a>
                .
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
