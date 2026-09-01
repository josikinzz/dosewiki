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
import { DocsInline } from "../_components/DocsProse";
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

// TOC labels are copy blocks (docs-how-toc-<id>); ids and icons stay in code.
const TOC = [
  { id: "s0", icon: "lucide:map" },
  { id: "s1", icon: "lucide:info" },
  { id: "s2", icon: "lucide:workflow" },
  { id: "s3", icon: "lucide:database" },
  { id: "s4", icon: "lucide:layout-list" },
  { id: "s5", icon: "lucide:globe" },
  { id: "s6", icon: "lucide:scissors" },
  { id: "s7", icon: "lucide:sparkles" },
  { id: "s8", icon: "lucide:quote" },
  { id: "s8b", icon: "lucide:gavel" },
  { id: "s9", icon: "lucide:user-check" },
  { id: "s10", icon: "lucide:download" },
  { id: "s11", icon: "lucide:scale" },
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
const STAGE_TONE: Record<StageTone, { accentVar: string }> = {
  // Swatch colors intentionally mirror the Mermaid diagram classDef strokes
  // (ext/auto/data/human/pub) below; this legend is the key for those
  // diagrams. Charts carry the dark-theme strokes verbatim; in light mode the
  // Mermaid component remaps each to a darker same-hue variant (LIGHT_PALETTE
  // in docs/_components/Mermaid.tsx), so the five hues must stay in lockstep
  // across both maps rather than collapse onto shared theme tokens.
  // The redundant text tag each step renders is a copy block
  // (docs-how-stage-label-<tone>), resolved inside PipelineStep.
  source: { accentVar: "#f9a8d4" },
  automated: { accentVar: "#fdba74" },
  stored: { accentVar: "#6ee7b7" },
  review: { accentVar: "#e879f9" },
  published: { accentVar: "#7dd3fc" },
};
const STAGE_TAG_CLASS =
  "theme-text-faint text-[0.6875rem] font-semibold uppercase tracking-[0.16em]";

async function PipelineStep({
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
  const copy = await getCopy();
  const { accentVar } = STAGE_TONE[tone];
  return (
    <div className={PIPELINE_STEP_CLASS} style={{ borderColor: accentVar }}>
      <div className="flex items-baseline justify-center gap-2">
        <span className={STEP_NUM_CLASS}>{num}</span>
        <span className={STAGE_TAG_CLASS} style={{ color: accentVar }}>
          {copy.text(`docs-how-stage-label-${tone}`)}
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

export default async function DocsHowPage() {
  const copy = await getCopy();
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
          <h1 className="type-page-title theme-accent-heading">
            {copy.text("docs-how-title")}
          </h1>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            <DocsInline>{copy.text("docs-how-intro")}</DocsInline>
          </p>
        </header>

        <section id="s0" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>00</span>{" "}{copy.text("docs-how-s0-heading")}
        </h2>
        
        <p className={PULL_CLASS}>
          dose.wiki is in <strong>beta</strong>. Every article is a living document: generated,
          verified, and corrected in public, in stages that are still running.
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          <DocsInline>{copy.text("docs-how-s0-intro")}</DocsInline>
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
          <span className={SECTION_NUM_CLASS}>01</span>{" "}{copy.text("docs-how-s1-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s1-intro")}</DocsInline>
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s1-subjective-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s1-subjective-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s1-interactions-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s1-interactions-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s1-reagents-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s1-reagents-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s1-other-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s1-other-body")}</DocsInline>
            </p>
          </div>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}><DocsInline>{copy.text("docs-how-s1-distinctions-lead")}</DocsInline></p>
        
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
          <span className={SECTION_NUM_CLASS}>02</span>{" "}{copy.text("docs-how-s2-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s2-intro")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s2-fill")}</DocsInline>
        </p>
        
        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> {copy.text("docs-how-s2-legend-source")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> {copy.text("docs-how-s2-legend-automated")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="stored" /> {copy.text("docs-how-s2-legend-stored")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> {copy.text("docs-how-s2-legend-review")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> {copy.text("docs-how-s2-legend-published")}
          </div>
        </div>
        
        <div className="mt-6">
          <Mermaid
            chart={PIPELINE_DIAGRAM}
            title={copy.text("docs-how-s2-diagram-title")}
          />
        </div></section>

        <section id="s3" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>03</span>{" "}{copy.text("docs-how-s3-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s3-intro")}</DocsInline>
        </p>
        
        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className={TH_CLASS}>{copy.text("docs-how-s3-col-source")}</th>
                <th className={`${TH_CLASS} min-w-[14rem]`}>{copy.text("docs-how-s3-col-take")}</th>
                <th className={TH_CLASS}>{copy.text("docs-how-s3-col-processed")}</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={TR_CLASS}>
                <td className="p-3">PsychonautWiki</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-psychonautwiki-take")}</DocsInline>
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
                    {copy.text("docs-how-s3-tripsit-note")}
                  </small>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-tripsit-take")}</DocsInline>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Erowid</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-erowid-take")}</DocsInline>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Wikipedia</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-wikipedia-take")}</DocsInline>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">DrugBank</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-drugbank-take")}</DocsInline>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Isomer Design</td>
                <td className="p-3"><DocsInline>{copy.text("docs-how-s3-isomer-take")}</DocsInline></td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">SaferParty</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-saferparty-take")}</DocsInline>
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">The Drug Classroom</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-classroom-take")}</DocsInline>
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Disregard Everything I Say</td>
                <td className="p-3"><DocsInline>{copy.text("docs-how-s3-deis-take")}</DocsInline></td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Drug Users Bible</td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-dub-take")}</DocsInline>
                </td>
                <td className="p-3">
                  <Badge variant="default">excerpted</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  ProtestKit <small className="theme-text-faint block">{copy.text("docs-how-s3-protestkit-note")}</small>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-protestkit-take")}</DocsInline>
                </td>
                <td className="p-3">
                  <Badge variant="secondary">live API</Badge>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  {copy.text("docs-how-s3-archived-label")}{" "}
                  <small className="theme-text-faint block">
                    {copy.text("docs-how-s3-archived-note")}
                  </small>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s3-archived-take")}</DocsInline>
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
          <span className={SECTION_NUM_CLASS}>04</span>{" "}{copy.text("docs-how-s4-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s4-intro")}</DocsInline>
        </p>
        
        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> {copy.text("docs-how-s4-legend-ai")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> {copy.text("docs-how-s4-legend-parsed")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> {copy.text("docs-how-s4-legend-live")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> {copy.text("docs-how-s4-legend-manual")}
          </div>
        </div>
        
        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className={TH_CLASS}>{copy.text("docs-how-s4-col-section")}</th>
                <th className={TH_CLASS}>{copy.text("docs-how-s4-col-method")}</th>
                <th className={`${TH_CLASS} min-w-[14rem]`}>{copy.text("docs-how-s4-col-how")}</th>
              </tr>
            </thead>
            <tbody className="theme-text-secondary">
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-summary-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-summary-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  {copy.text("docs-how-s4-identification-label")}{" "}
                  <small className="theme-text-faint block">{copy.text("docs-how-s4-identification-note")}</small>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="success">curated</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-identification-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  {copy.text("docs-how-s4-classification-label")}{" "}
                  <small className="theme-text-faint block">{copy.text("docs-how-s4-classification-note")}</small>
                </td>
                <td className="space-y-1 p-3">
                  <Badge variant="secondary">parsed</Badge>{" "}
                  <Badge variant="success">curated</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-classification-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-dosage-label")}</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-dosage-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-duration-label")}</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-duration-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-effects-label")}</td>
                <td className="p-3">
                  <Badge variant="default">Mixed</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-effects-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-pharmacology-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-pharmacology-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-interactions-label")}</td>
                <td className="p-3">
                  <Badge variant="secondary">parsed</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-interactions-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-harm-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-harm-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-tolerance-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-tolerance-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-legality-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-legality-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-history-label")}</td>
                <td className="p-3">
                  <Badge variant="default">AI-synthesized</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-history-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-reagent-label")}</td>
                <td className="p-3">
                  <Badge variant="secondary">live API</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-reagent-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-citations-label")}</td>
                <td className="space-y-1 p-3">
                  <Badge variant="default">workflow-proposed</Badge>{" "}
                  <Badge variant="secondary">structurally validated</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-citations-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-reports-label")}</td>
                <td className="p-3">
                  <Badge variant="success">human-written</Badge>
                </td>
                <td className="p-3">
                  <DocsInline>{copy.text("docs-how-s4-reports-body")}</DocsInline>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">{copy.text("docs-how-s4-notes-label")}</td>
                <td className="p-3">
                  <Badge variant="success">manual</Badge>
                </td>
                <td className="p-3"><DocsInline>{copy.text("docs-how-s4-notes-body")}</DocsInline></td>
              </tr>
            </tbody>
            </table>
          </div>
        </ContentCard></section>

        <section id="s5" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>05</span>{" "}{copy.text("docs-how-s5-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s5-intro")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s5-parsers")}</DocsInline>
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s5-tables-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s5-tables-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s5-combos-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s5-combos-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s5-chemistry-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s5-chemistry-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s5-prose-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s5-prose-body")}</DocsInline>
            </p>
          </div>
        </div></section>

        <section id="s6" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>06</span>{" "}{copy.text("docs-how-s6-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s6-intro")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s6-verbatim")}</DocsInline>
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s6-topics-title")}</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              {copy.items("docs-how-s6-topics").map((item, i) => (
                <li key={i}>
                  <DocsInline>{item}</DocsInline>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s6-blocks-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s6-blocks-body")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-how-s6-blocks-drift")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s6-audit-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s6-audit-body")}</DocsInline>
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              <DocsInline>{copy.text("docs-how-s6-audit-markers")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s6-why-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s6-why-body")}</DocsInline>
            </p>
          </div>
        </div>
        
        <h3 className={`${SUBHEAD_CLASS} mt-8`}>{copy.text("docs-how-s6-example-heading")}</h3>
        <DisclosureCard
          variant="subtle"
          summary={copy.text("docs-how-s6-example-summary")}
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            <DocsInline>{copy.text("docs-how-s6-example-meta")}</DocsInline>
          </p>
          <pre className={PROMPT_BODY_CLASS}>{INTRO_QUOTES}</pre>
        </DisclosureCard>
        
        <h3 className={`${SUBHEAD_CLASS} mt-8`}>{copy.text("docs-how-s6-prompts-heading")}</h3>
        <p className={`${PROSE_CLASS} mb-3 mt-2`}>
          <DocsInline>{copy.text("docs-how-s6-prompts-intro")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s6-prompts-model")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s6-prompts-skeleton")}</DocsInline>
        </p>
        
        <ContentCard variant="subtle" padding="md" className="mt-5">
          <p className={NOTE_CLASS}>
            <DocsInline>{copy.text("docs-how-s6-contract-note")}</DocsInline>
          </p>
        </ContentCard>
        
        <DisclosureCard
          variant="subtle"
          summary={copy.text("docs-how-s6-contract-summary")}
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            <DocsInline>{copy.text("docs-how-s6-contract-meta")}</DocsInline>
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
          <span className={SECTION_NUM_CLASS}>07</span>{" "}{copy.text("docs-how-s7-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s7-intro")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s7-remaining")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s7-skeleton")}</DocsInline>
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s7-evidence-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s7-evidence-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s7-original-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s7-original-body")}</DocsInline>
            </p>
          </div>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}>
          <DocsInline>{copy.text("docs-how-s7-prompts-below")}</DocsInline>
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s7-fastest")}</DocsInline>
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
            <DocsInline>{copy.text("docs-how-s7-note")}</DocsInline>
          </p>
        </ContentCard></section>

        <section id="s8" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>08</span>{" "}{copy.text("docs-how-s8-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s8-intro")}</DocsInline>
        </p>
        
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep num={1} name={copy.text("docs-how-s8-step1-name")} tone="automated">
            <DocsInline>{copy.text("docs-how-s8-step1-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name={copy.text("docs-how-s8-step2-name")} tone="automated">
            <DocsInline>{copy.text("docs-how-s8-step2-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name={copy.text("docs-how-s8-step3-name")} tone="automated">
            <DocsInline>{copy.text("docs-how-s8-step3-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name={copy.text("docs-how-s8-step4-name")} tone="stored">
            <DocsInline>{copy.text("docs-how-s8-step4-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={5} name={copy.text("docs-how-s8-step5-name")} tone="stored">
            <DocsInline>{copy.text("docs-how-s8-step5-detail")}</DocsInline>
          </PipelineStep>
        </div>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s8-standards-title")}</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              <li>
                <DocsInline>{copy.text("docs-how-s8-standards-wikis")}</DocsInline>
              </li>
              <li>
                <DocsInline>{copy.text("docs-how-s8-standards-ids")}</DocsInline>
              </li>
              <li>
                <strong>Access limitations stay visible.</strong> A paywalled paper may be used when
                its accessible abstract supports the relevant claim; the record notes
                <em> abstract-only</em> access so reviewers know what was inspected.
              </li>
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s8-meaning-title")}</h3>
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
          <span className={SECTION_NUM_CLASS}>08b</span>{" "}{copy.text("docs-how-s8b-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s8b-intro")}</DocsInline>
        </p>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s8b-agents")}</DocsInline>
        </p>
        
        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> {copy.text("docs-how-s8b-legend-source")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> {copy.text("docs-how-s8b-legend-automated")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="stored" /> {copy.text("docs-how-s8b-legend-stored")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> {copy.text("docs-how-s8b-legend-review")}
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> {copy.text("docs-how-s8b-legend-published")}
          </div>
        </div>
        
        <div className="mt-6">
          <Mermaid
            chart={LEGALITY_DIAGRAM}
            title={copy.text("docs-how-s8b-diagram-title")}
          />
        </div>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s8b-invariants-title")}</h3>
            <ul className={`${LIST_CLASS} list-disc pl-5`}>
              {copy.items("docs-how-s8b-invariants").map((item, i) => (
                <li key={i}>
                  <DocsInline>{item}</DocsInline>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s8b-next-title")}</h3>
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
          <span className={SECTION_NUM_CLASS}>09</span>{" "}{copy.text("docs-how-s9-heading")}
        </h2>
        
        <p className={PULL_CLASS}>
          <DocsInline>{copy.text("docs-how-s9-pull")}</DocsInline>
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
          <PipelineStep num={1} name={copy.text("docs-how-s9-step1-name")} tone="review">
            <DocsInline>{copy.text("docs-how-s9-step1-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={2} name={copy.text("docs-how-s9-step2-name")} tone="review">
            <DocsInline>{copy.text("docs-how-s9-step2-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={3} name={copy.text("docs-how-s9-step3-name")} tone="review">
            <DocsInline>{copy.text("docs-how-s9-step3-detail")}</DocsInline>
          </PipelineStep>
          <div className={PIPELINE_ARROW_CLASS}>→</div>
          <PipelineStep num={4} name={copy.text("docs-how-s9-step4-name")} tone="stored">
            <DocsInline>{copy.text("docs-how-s9-step4-detail")}</DocsInline>
          </PipelineStep>
        </div>
        
        <p className={`${PROSE_CLASS} mt-7`}>
          <DocsInline>{copy.text("docs-how-s9-records")}</DocsInline>
        </p></section>

        <section id="s10" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>10</span>{" "}{copy.text("docs-how-s10-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s10-intro")}</DocsInline>
        </p>
        
        <p className={PULL_CLASS}>
          <DocsInline>{copy.text("docs-how-s10-pull")}</DocsInline>
        </p>
        
        <p className={`${PROSE_CLASS} mt-5`}>
          <DocsInline>{copy.text("docs-how-s10-dataset")}</DocsInline>
        </p></section>

        <section id="s11" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>11</span>{" "}{copy.text("docs-how-s11-heading")}
        </h2>
        
        <p className={`${PROSE_CLASS} mt-4`}>
          <DocsInline>{copy.text("docs-how-s11-intro")}</DocsInline>
        </p>
        
        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s11-new-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s11-new-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s11-facts-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s11-facts-body")}</DocsInline>
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s11-provenance-title")}</h3>
            <p className={PROSE_CLASS}>
              Source-page links show where material entered the pipeline. Citation markers record
              intended evidentiary relationships for particular claims. Both remain open to human
              verification and correction; <a href="#s1" className={proseLinkClassName}>section 01</a>{" "}
              states the two distinctions in full.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>{copy.text("docs-how-s11-cc0-title")}</h3>
            <p className={PROSE_CLASS}>
              <DocsInline>{copy.text("docs-how-s11-cc0-body")}</DocsInline>
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
                <h3 className={`${SUBHEAD_CLASS} mb-0`}>{copy.text("docs-how-s11-questions-title")}</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                <DocsInline>{copy.text("docs-how-s11-questions-body")}</DocsInline>
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Icon icon="lucide:code" size={18} className="theme-accent-heading shrink-0" />
                <h3 className={`${SUBHEAD_CLASS} mb-0`}>{copy.text("docs-how-s11-code-title")}</h3>
              </div>
              <p className={`${NOTE_CLASS} mt-2`}>
                <DocsInline>{copy.text("docs-how-s11-code-body")}</DocsInline>
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
