import type { ReactNode } from "react";
import { getPublicAboutPreviewSubstances } from "@server/convex/publicData";
import { getMoleculePackDownloadStats, getOpenDataDownloadStats } from "@server/open-data/downloadStats";
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
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/surface";
import { AboutArchivePreview } from "@/components/pages/AboutArchivePreview";
import { buildAboutPreviewSnapshots } from "@/components/pages/aboutArchiveSnapshot";
import type { SubstanceArticle } from "@/schema";
import { Mermaid } from "../_components/Mermaid";

// The sample-record preview and substance count read Convex; refresh them on the
// same cadence as the About page rather than per request.
export const revalidate = 3600;

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

const SECTION_CLASS = "scroll-mt-24 border-t border-dose-border pt-10";
const SECTION_NUM_CLASS =
  "theme-text-faint mr-3 text-[0.65em] font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "type-doc-section-title theme-accent-heading";
// The base class carries no margin: Tailwind emits .mb-0 before .mb-2, so a
// trailing "mb-0" can never cancel a composed mb-2. Rows that align a subhead
// against an icon use the base directly.
const SUBHEAD_BASE_CLASS =
  "theme-text-primary text-lg font-semibold leading-snug";
const SUBHEAD_CLASS = `${SUBHEAD_BASE_CLASS} mb-2`;
// Collapsed-subsection headings: h3 semantics inside a DisclosureCard summary,
// sized between the summary pill's text-sm and an open SUBHEAD_CLASS h3.
const SUB_SUMMARY_CLASS = "text-base font-semibold leading-snug";
const PROSE_CLASS = "theme-text-secondary leading-7";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const TABLE_WRAP_CLASS = "overflow-hidden";
const TABLE_SCROLL_CLASS =
  "overflow-x-auto max-sm:[mask-image:linear-gradient(to_left,transparent,black_2.5rem)]";
const TABLE_CLASS =
  "min-w-[760px] w-full border-collapse text-left text-sm [&_tbody_small]:mt-1 [&_tbody_td]:border-b [&_tbody_td]:border-dose-border [&_tbody_td]:p-4 [&_tbody_td]:align-top [&_tbody_td:first-child]:min-w-[12rem] [&_tbody_td:first-child]:font-semibold [&_tbody_td:first-child]:text-dose-text [&_tbody_tr:last-child_td]:border-b-0";
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
const NOTE_CLASS = `${PROSE_CLASS} text-[0.9375rem]`;

// Published prompt text: a scrollable read-only region. Keyboard users need
// focus to scroll it (axe: scrollable-region-focusable), which jsx-a11y's
// static rule cannot see; role="region" + aria-label name it for AT.
function PromptBody({ label, children }: { label: string; children: ReactNode }) {
  return (
    <pre
      className={PROMPT_BODY_CLASS}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable
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
  pipeline: { num: "02", title: "The pipeline at a glance" },
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

/** Site-standard prose link for external destinations: proseLinkClassName
 *  treatment plus the external-link icon VCode's ExtLink uses. */
function ExternalProseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${proseLinkClassName} inline-flex items-center gap-0.5`}
    >
      {children}
      <Icon icon="lucide:external-link" size={12} className="opacity-60" />
    </a>
  );
}

export default async function DocsHowPage() {
  const [copy, previewSubstances, substanceDownload] = await Promise.all([
    getCopy(),
    getPublicAboutPreviewSubstances(),
    getOpenDataDownloadStats("SubstanceIndex"),
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
            The facts a substance article needs have already been gathered and published:
            decades of documentation by scientists, psychonauts, and the harm-reduction
            community. They are spread primarily across ten psychopharmacology reference
            sites in ten formats, with no shared standard and no one site covering
            everything. We know what compiling them by hand takes, because we have done
            it:{" "}
            <ExternalProseLink href="https://en.wikipedia.org/wiki/Josie_Kins">
              Josie Kins
            </ExternalProseLink>
            , who co-founded dose.wiki, founded{" "}
            <ExternalProseLink href="https://psychonautwiki.rip">
              PsychonautWiki
            </ExternalProseLink>
            , the Subjective Effect Index, and numerous other similar projects.
            PsychonautWiki&apos;s first draft took her and a team of contributors from
            2011 to 2016 to write by hand. This time we
            let software do the initial compilation. Building the pipeline took about a
            year, and its output then went through months of human review before we were
            comfortable publishing it. Editors have been working on top of that baseline
            since. The dataset is open, so anyone building an encyclopedia of their own
            can start from it instead of from zero.
          </p>
          <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7">
            Substance articles therefore begin as pipeline drafts. Code scrapes and
            copies the dose and duration tables from the source sites. An LLM reads the
            same sources and drafts the narrative sections from word-for-word excerpts,
            citing the source of each one. Human editors take over from there: they
            verify the pharmacology, check the doses and interactions where a wrong
            figure can hurt someone, and add what the sources left out.
          </p>
          <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7">
            Every article&apos;s status subsection shows how much human review it has
            had, and this page shows every step and every prompt the pipeline runs.
            Coverage is still incomplete, and any given article can contain an error.
            Improvement is continuous, and reader feedback drives most of it: the
            report-an-issue box at the bottom of each article and the{" "}
            <a href="/about/feedback" className={proseLinkClassName}>feedback form</a>{" "}
            both go directly to the review queue, where an editor reads each message and
            makes the change in a Wikipedia-style editor built into the site. Every
            correction fixes the article and the next export of the dataset, which anyone
            can{" "}
            <a href="#dataset" className={proseLinkClassName}>download</a>.
          </p>
        </header>

        <section id="made" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>00</span>{" "}What is in an article, and who makes it
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          Each section of a substance article is made by the method that suits its
          content. Code transcribes tables of numbers, and an LLM
          never paraphrases them. An LLM drafts narrative sections from word-for-word source
          excerpts. People keep the judgment calls: classification trees, editorial notes,
          and review.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Two kinds of outside material feed the site. The first is archived reference
          pages, which are captured once and processed by the pipeline below. The second
          is live data read from allied projects on their own terms:
        </p>
        <ul className={`${LIST_CLASS} mt-3 list-disc pl-5`}>
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
        <p className={`${PROSE_CLASS} mt-4`}>
          Trip reports are first-person accounts written by people. They are imported with
          attribution from the Effect Index corpus. Replications are the image and video
          recreations of subjective effects shown in articles and the gallery. They are
          human artwork, made by the replications community and by artists who have sent
          work to Josie Kins over the years. The site hosts them as educational material
          about subjective-effect documentation and credits their creators.
        </p>

        <div className={LEGEND_CLASS}>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="source" /> AI-synthesized from excerpts (baseline)
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="automated" /> Parsed by code (baseline)
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="published" /> Live API
          </div>
          <div className={LEGEND_ITEM_CLASS}>
            <StageSwatch tone="review" /> Manual / curated (built on the baseline)
          </div>
        </div>

        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <caption className="sr-only">Per-section production methods</caption>
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
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  50&ndash;80 word overview written by an LLM from the intro-text
                  excerpts, under the summary prompt (readable in <SectionRef s="synthesis" />).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  Identification{" "}
                  <small className="theme-text-faint block">chemical names, SMILES, InChI, CAS</small>
                </td>
                <td className="space-y-1 p-3">
                  <Method tone="automated">parsed</Method>
                  <Method tone="review">curated</Method>
                </td>
                <td className="p-3">
                  Chemistry identifiers merged from parsed sources (DrugBank, PsychonautWiki,
                  Wikipedia) with chemical-name resolution. Provenance is tracked per
                  identifier, and an editor checks the result.
                </td>
              </tr>
              <tr className={TR_CLASS}>
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
                  redrawn by hand or aligned to a shared class template, so the molecule
                  looks the way chemists expect (see <SectionRef s="parsing" />).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">
                  Classification{" "}
                  <small className="theme-text-faint block">psychoactive / chemical classes</small>
                </td>
                <td className="space-y-1 p-3">
                  <Method tone="automated">parsed</Method>
                  <Method tone="review">curated</Method>
                </td>
                <td className="p-3">
                  Class assignments come from parsed sources. Editors hand-curate the
                  site-wide classification trees.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Dosage tables</td>
                <td className="p-3">
                  <Method tone="automated">parsed</Method>
                </td>
                <td className="p-3">
                  Dose ranges per route parsed directly from TripSit, PsychonautWiki, and
                  Erowid tables, under the lowest-upper-bound rule (<SectionRef s="parsing" />).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Duration tables</td>
                <td className="p-3">
                  <Method tone="automated">parsed</Method>
                </td>
                <td className="p-3">
                  Onset / peak / offset values per route, parsed from the same sources.
                </td>
              </tr>
              <tr className={TR_CLASS}>
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
                  the Subjective Effect Index.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Pharmacology</td>
                <td className="p-3">
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  Mechanism-of-action prose written from the pharmacology excerpts under the
                  pharmacology prompt, the longest of the prompts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Interactions</td>
                <td className="p-3">
                  <Method tone="automated">parsed</Method>
                </td>
                <td className="p-3">
                  Drug-combination risk ratings read from the JSON file that TripSit
                  publishes on GitHub. They do not come from the archived factsheets.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Harm potential</td>
                <td className="p-3">
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  Toxicity, addiction, and risk prose written from the harm-potential
                  excerpts under the harm potential prompt.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Tolerance</td>
                <td className="p-3">
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  Tolerance and cross-tolerance prose from the tolerance excerpts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Legality</td>
                <td className="p-3">
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  Country-by-country legal status, now rebuilt entry by entry against
                  primary legal sources by the deep-research workflow
                  (<SectionRef s="citations" />). The first draft came from the legality
                  excerpts like the other AI-written sections. Code also prepopulates the
                  structured legal fields where sources state them plainly.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">History &amp; culture</td>
                <td className="p-3">
                  <Method tone="source">AI-synthesized</Method>
                </td>
                <td className="p-3">
                  Discovery, medical history, and cultural context from the history-culture
                  excerpts.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Reagent testing</td>
                <td className="p-3">
                  <Method tone="published">live API</Method>
                </td>
                <td className="p-3">
                  Color reactions fetched live from the ProtestKit API at page view, with
                  stored static results as fallback.
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Citations &amp; references</td>
                <td className="space-y-1 p-3">
                  <Method tone="source">workflow-proposed</Method>
                  <Method tone="automated">structurally validated</Method>
                </td>
                <td className="p-3">
                  References and markers proposed by LLM research agents for the six citable
                  sections, then re-examined by the entailment audit
                  (<SectionRef s="citations" />).
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Trip reports</td>
                <td className="p-3">
                  <Method tone="review">human-written</Method>
                </td>
                <td className="p-3">
                  First-person experience reports written by people, imported from the
                  Effect Index corpus with attribution.
                </td>
              </tr>
              <tr className={TR_CLASS}>
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
              <tr className={TR_CLASS}>
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

        <section id="sources" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>01</span>{" "}The ten source sites
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          Article content is built from ten harm-reduction and reference sites, plus one
          live API. We keep internal working copies of the relevant pages for processing.
          Each article&apos;s source pages
          section links out to the original pages on the source sites themselves.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The working copies were captured in December 2025, and the pipeline reads the
          copy. A source site can change after our capture, so this list is a dated
          snapshot. Improvement after that date comes from editors, the citation
          workflows, and reader feedback (<SectionRef s="status" />).
        </p>

        <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
            <caption className="sr-only">The ten source sites</caption>
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
                  interaction / tolerance prose, legal status, chemistry identifiers,
                  pharmacology prose.
                </td>
                <td className="space-y-1 p-3">
                  <Method>parsed</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
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
                  <Method>parsed</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Erowid</td>
                <td className="p-3">
                  Dosage and duration ranges, effects descriptions, legal status,
                  harm-reduction and safety warnings, general narratives.
                </td>
                <td className="space-y-1 p-3">
                  <Method>parsed</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Wikipedia</td>
                <td className="p-3">
                  General overviews, history, chemistry identifiers. Also used to discover
                  citable references, but never cited as a reference itself
                  (<SectionRef s="citations" />).
                </td>
                <td className="space-y-1 p-3">
                  <Method>parsed</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">DrugBank</td>
                <td className="p-3">
                  Chemical data (molecular weight, formula, CAS numbers), pharmacology
                  descriptions, drug and food interactions.
                </td>
                <td className="space-y-1 p-3">
                  <Method>parsed</Method>
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Isomer Design</td>
                <td className="p-3">Effects and experience prose, chemical reference data.</td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">SaferParty</td>
                <td className="p-3">
                  Harm reduction guidance, risk descriptions, safer-use notes.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">The Drug Classroom</td>
                <td className="p-3">
                  Educational overviews, mechanism and effects descriptions.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Disregard Everything I Say</td>
                <td className="p-3">Subjective effect narratives and substance overviews.</td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
                <td className="p-3">Drug Users Bible</td>
                <td className="p-3">
                  Dosage, effects, and legality information, plus street-name nomenclature.
                </td>
                <td className="p-3">
                  <Method>excerpted</Method>
                </td>
              </tr>
              <tr className={TR_CLASS}>
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
              <tr className={TR_CLASS}>
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

        <section id="pipeline" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>02</span>{" "}The pipeline at a glance
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          Of the four methods in <SectionRef s="made" />, the two automated methods run as
          parallel tracks over the source pages. The deterministic track parses structured
          data such as dosage tables and interaction matrices. The AI track turns the prose
          parts of the sources into excerpt documents, then into draft sections. Human and
          live-API methods sit outside this pipeline and act on its output.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
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

        <section id="parsing" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>03</span>{" "}Scraping &amp; parsing
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          We scraped the source sites once and stored the pages as plain-text working
          copies, one per substance. They are for internal processing;{" "}
          <SectionRef s="sources" /> gives the capture date.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
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
            summary={<h3 className={SUB_SUMMARY_CLASS}>Table parsers</h3>}
          >
            <p className={PROSE_CLASS}>
              TripSit factsheets and PsychonautWiki carry the most structured data: dose
              tiers (threshold / light / common / strong / heavy) per route of
              administration and onset / peak / offset durations. The parsers read these
              tables directly and transcribe the numbers as published. A parser does not
              choose between sources that disagree; the merge step does that later, when
              the parsed tables enter the article.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              The merge applies the lowest-upper-bound rule. Among weight-unit sources, it
              keeps the entry with the lowest comparable upper bound. The comparison value
              is the heavy minimum when the source gives one. If not, it falls back to the
              strong maximum, then the strong minimum, then the common maximum. If two
              sources tie, the source that fills more dose tiers is used. If no source gives
              weight units, a fixed source-priority order decides. This is a deliberate
              safety bias, because taking too little is safer than taking too much.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              A worked example: if one source lists a heavy oral dose starting at 25 mg and
              another lists it starting at 35 mg, the article takes the 25 mg source&apos;s
              whole table for that route.
            </p>
          </DisclosureCard>
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={SUB_SUMMARY_CLASS}>The combination chart</h3>}
          >
            <p className={PROSE_CLASS}>
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
            summary={<h3 className={SUB_SUMMARY_CLASS}>Chemistry identifiers and structure drawings</h3>}
          >
            <p className={PROSE_CLASS}>
              dose.wiki merges SMILES strings, InChI keys, CAS numbers, and molecular data
              from DrugBank, PsychonautWiki, and Wikipedia. Provenance is tracked per
              identifier, and chemical-name resolution fills the gaps.
            </p>
            <p className={`${PROSE_CLASS} mt-4`}>
              The molecule image is made in two steps. A SMILES
              string says which atoms are joined and how, but it does not say how the
              molecule should be drawn. Chemists draw many families the same way by
              habit, and a machine layout often ignores that. Each substance therefore
              starts from an automatic 2D layout. Then a person redraws
              it by hand, or aligns it to a template that a person drew once for the
              whole chemical class. The saved result is an editable MOL block, and the
              image is rendered from that. Each drawing records whether it is automatic,
              hand-drawn, or template-aligned.
            </p>
            <p className={`${PROSE_CLASS} mt-4`}>
              The drawing tool and the page image both use one engine: a dose.wiki fork
              of the open-source OpenChemLib library, with small additions for fine
              rotation and bold bonds. One engine means the page shows exactly what the
              editor drew. A check compares the molecule before and after each edit, so a
              redraw cannot quietly turn it into a different molecule.
            </p>
          </DisclosureCard>
          <DisclosureCard
            variant="subtle"
            summary={<h3 className={SUB_SUMMARY_CLASS}>Prose-heavy sources</h3>}
          >
            <p className={PROSE_CLASS}>
              Erowid, Isomer Design, SaferParty, The Drug Classroom, Disregard Everything I
              Say, and the Drug Users Bible contribute mostly narrative text. Their parsers
              do not judge relevance. They split each page into labeled sections and blocks
              so that the extraction stage (<SectionRef s="excerpts" />) can address them.
              The LLM decides which blocks matter.
            </p>
          </DisclosureCard>
        </div></section>

        <section id="excerpts" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>04</span>{" "}Verbatim excerpt extraction
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          The source pages are long, and most of any page is irrelevant to any one section.
          Before any writing happens, an extraction pass reads every working copy and
          copies the passages relevant to each topic, word for word.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          An excerpt document holds exact
          copies of source text: complete paragraphs, formatting preserved, grouped under a
          heading for each source. The result is one excerpt document per substance per
          topic, across eight topics: intro text (which feeds the summary), dosage &amp;
          duration, subjective effects, pharmacology, tolerance, harm potential, history
          &amp; culture, and legality.
        </p>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Block ids only</h3>
            <p className={PROSE_CLASS}>
              Each working copy is first split into numbered blocks (paragraphs, list
              items, table rows, headings), and the LLM reads that block-indexed version.
              It replies with nothing but the ids of the blocks to keep. A script then
              copies those blocks out of the source character for character and assembles
              the excerpt document. Because the LLM never emits source text, it has no
              opportunity to alter it.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              Every source keeps its heading in the output even when it yielded nothing.
              Those headings carry a marker line such as <em>No tolerance content
              found.</em>, which keeps &quot;we looked and there was nothing&quot; distinct
              from &quot;this source was skipped&quot;.
            </p>
            <p className={`${PROSE_CLASS} mt-3`}>
              Our first version let the LLM reproduce each passage, but it did not preserve
              the source wording. Each reproduction created an opportunity for wording to change.
              One batch of 47 files turned an &quot;antihistamine&quot; into an
              &quot;antihistaminic&quot;, dropped a &quot;however,&quot;, and shortened
              the name of an organization by two words. These are small edits, easy to
              miss, in text whose only job is to be an exact copy. Block selection prevents
              that drift; a warning in the prompt only asked the model to avoid it.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Audited after extraction</h3>
            <p className={PROSE_CLASS}>
              A verbatim audit then reads every finished excerpt document. It is a
              script. It requires that each passage appears in
              the working copy, under the same source heading, as an exact substring,
              and rejects a file that drifts.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Why verbatim matters</h3>
            <p className={PROSE_CLASS}>
              The excerpt documents are the only material the writing stage is allowed to
              see. Because they are word-for-word copies, a reviewer can trace anything a
              draft says back to a specific passage on a specific source page. Extraction
              errs toward over-inclusion. The instruction is to keep anything even
              tangentially relevant, rather than risk losing safety-critical information.
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
            This is the actual working file for 2C-B&apos;s intro-text topic: verbatim
            passages from each source, grouped under source headings. The summary section
            of the 2C-B article was written from this document and nothing else.
          </p>
          <PromptBody label="Example: the 2C-B intro-text excerpt document (unedited)">
            {INTRO_QUOTES}
          </PromptBody>
        </DisclosureCard>

        <h3 className={`${SUBHEAD_CLASS} mt-8`}>The extraction prompts</h3>
        <p className={`${PROSE_CLASS} mb-3 mt-2`}>
          All eight extraction prompts appear below, unedited. This page reads them
          straight from <code>scripts/prompts/</code> when it builds, so they are the same
          files the pipeline runs.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The pipeline calls the LLM once per substance and topic, and the harness appends the
          block-selection contract to whichever prompt it is running. We do not name the
          model here, because it changes as better models appear. The LLM only selects
          block ids and never emits source text. A change of model cannot change the
          wording of an excerpt. It can only change which passages are kept.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The eight share one skeleton: hard verbatim rules, an input format, and
          empty-result handling. They differ mainly in their &quot;what counts&quot;
          sections. Read one prompt in full, then skim the others for that section.
        </p>

        <p className={`${PROSE_CLASS} mt-5`}>
          <strong>Read the block-selection contract first.</strong>{" "}
          Each prompt below
          still carries an &quot;Output format&quot; section describing an excerpt file.
          The contract replaces those sections at run time. A prompt defines what counts as
          relevant for its topic. The harness owns what the LLM actually returns, which
          is a list of block ids and nothing else.
        </p>

        <DisclosureCard
          variant="subtle"
          summary="The block-selection contract, appended after every prompt below"
          className="mt-3"
        >
          <p className={PROMPT_META_CLASS}>
            The harness appends this text to all eight prompts, replacing{" "}
            <code>{"{{TOPIC}}"}</code> with the topic name. This is the instruction that
            makes the excerpts verbatim. The LLM names blocks, and a script copies them
            out.
          </p>
          <PromptBody label="The block-selection contract, appended after every prompt below">
            {BLOCK_CONTRACT}
          </PromptBody>
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
            <PromptBody label={`Extraction prompt: ${prompt.label}`}>
              {prompt.body}
            </PromptBody>
          </DisclosureCard>
        ))}</section>

        <section id="synthesis" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>05</span>{" "}AI synthesis &amp; the prompts
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          Six sections of the finished article are AI-written end to end: summary,
          pharmacology, tolerance, harm potential, history &amp; culture, and legality.
          An LLM writes each one from exactly two inputs: the excerpt document for that
          topic, and a section-specific prompt. The model differs by section and changes
          over time. What stays fixed is the contract: the LLM writes original prose
          from the excerpts, under the prompts published below.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The two remaining excerpt topics, dosage &amp; duration and subjective effects,
          serve a narrower purpose. Those sections come from parsed tables and from Josie
          Kins&apos; effect taxonomy. Their excerpts only fill documented gaps, and never
          overwrite what is already there.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          The prompts share one skeleton: a style definition, a hard evidence rule, a fixed
          output format, worked examples, and a checklist. All of them carry the same two
          constraints:
        </p>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>Evidence only</h3>
            <p className={PROSE_CLASS}>
              The prompts instruct the LLM to include only information explicitly stated
              or clearly implied in the supplied quotes, and to omit information that it cannot
              find there. The limits of that rule are stated once, in{" "}
              <SectionRef s="limits" />.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>Original prose only</h3>
            <p className={PROSE_CLASS}>
              &quot;Synthesize information from the provided excerpts into original prose.
              Do not copy sentences or lengthy phrases verbatim from any source.&quot; The
              verbatim text exists only in the internal excerpt documents. The published
              text is new writing, anchored to that evidence.
            </p>
          </div>
        </div>

        <p className={`${PROSE_CLASS} mt-7`}>
          The section prompts for all six fully AI-written sections appear below, largest
          first. This page reads them from <code>src/data/config/sectionPrompts/</code>{" "}
          when it builds. Two copies of each prompt exist: the committed file shown here,
          and a live copy the editorial team can edit, which generation runs use. The live
          copies were seeded from these files, and a comparison script reports any drift
          between the two. The copy that produced a given article can differ from
          the copy printed here.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Read the pharmacology and harm potential prompts to see in detail how each prompt
          shapes its section.
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

        <p className={`${PROSE_CLASS} mt-7`}>
          All six prompts are part of the project. They are version-controlled alongside the
          code, and the live copies are editable by the editorial team. When a prompt
          improves, future generation runs that use it change. The citation and legality workflows
          carry their own prompt families; those live in the repository under{" "}
          <code>scripts/citations/</code> and <code>scripts/legality/</code> and are not
          yet published on this page.
        </p></section>

        <section id="citations" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>06</span>{" "}Citations &amp; legality deep research
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          The six AI-written sections are the citable sections: those that can carry
          Wikipedia-style markers linked to a reference list. Structured and excluded
          sections use separate provenance and review paths. Citation work has run in
          three passes: a marking pass that proposed the markers, a legality rebuild that
          set a stricter standard, and an entailment audit that re-examined everything
          against that standard.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Every live marker on an article today has passed the audit in pass three: the
          cited source was fetched and found to support the sentence. Markers that failed
          were removed, and their sentences now show <em>citation needed</em>.
        </p>

        <h3 className={`${SUBHEAD_CLASS} mt-8`}>Pass one: proposing markers</h3>
        <p className={PROSE_CLASS}>
          LLM research agents read the citable prose and choose bounded claims that may
          need support. They inspect candidate sources and record the relationship they
          believe each source supports. Coverage is conservative. A marker appears only
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
          summary={<h3 className={SUB_SUMMARY_CLASS}>Reference standards</h3>}
        >
          <ul className={`${LIST_CLASS} list-disc pl-5`}>
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

        <p className={`${PROSE_CLASS} mt-6`}>
          Citations render as numbered markers linked to the reference list. Behind each
          marker, the workflow retains the quote and rationale as review evidence, so a
          human can inspect exactly what the marker was based on.{" "}
          <SectionRef s="limits" cap /> states plainly what a marker does and does not
          establish.
        </p>

        <h3 className={`${SUBHEAD_CLASS} mt-8`}>Pass two: legality set the standard</h3>
        <p className={PROSE_CLASS}>
          Legality is the section most likely to become outdated, because drug law changes
          often, differs by country, and most published summaries cite other summaries
          instead of the law. So the legality section has its own deep-research
          workflow, separate from the main pipeline. It
          reads primary legal sources only: statutes, official schedules, and government
          legislation portals.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Legality was also the test case for a per-subsection research pipeline. It is one
          subsection, one kind of source, and one question per country. The invariants
          below are what the test case settled, and they are the template for a separate
          pipeline for each remaining subsection. Pharmacology is next. The end state is
          one pipeline per subsection, run over every article.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          One orchestrator agent runs the workflow for one substance at a time. It launches
          many small research agents in parallel. Each agent starts with a blank context,
          one narrow question, and a strict output contract. Research and refutation are
          never the same agent. Every surviving claim faces an independent blank-context
          refuter. A refuted claim becomes a recorded gap, or it re-enters research for at
          most two recovery cycles. The diagram below shows the full sequence, from export
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
          summary={<h3 className={SUB_SUMMARY_CLASS}>Invariants</h3>}
        >
          <ul className={`${LIST_CLASS} list-disc pl-5`}>
            <li>
              No entry enters the draft without a primary source (no source means a
              recorded gap, never a published claim).
            </li>
            <li>Research and refutation are always separate blank-context agents.</li>
            <li>A human confirms every write.</li>
            <li>
              Legacy claims that cannot be sourced are flagged <em>citation needed</em>, never
              silently edited or deleted.
            </li>
          </ul>
        </DisclosureCard>

        <h3 className={`${SUBHEAD_CLASS} mt-8`}>Pass three: the entailment audit</h3>
        <p className={PROSE_CLASS}>
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
        <p className={`${PROSE_CLASS} mt-4`}>
          The middle two steps come next: find sources for the claims that lost their
          markers, and change or remove any claim that no source supports.{" "}
          <SectionRef s="status" cap /> tracks that work.
        </p></section>

        <section id="review" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>07</span>{" "}Human review
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          Editorial review is the first person-led stage specific to one article. The
          baseline pipeline before it was produced for every substance at once. From here
          on, a named person does the work.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          Readers take part in this stage. The report-an-issue form at the bottom of
          each article sends a note to the review queue. An editor reads each note and
          decides whether the article changes. Reader feedback is the main way that
          errors reach a reviewer.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
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
        <p className={`${PROSE_CLASS} mt-4`}>
          Each article shows this as a three-step Article Status. Step 1 is automated
          synthesis, which creates the baseline draft. Step 2 is the editorial review described
          here. Step 3 is a human citation review that compares each claim with its
          source. Step 3 is the human pass planned as Phase 4 in{" "}
          <SectionRef s="status" />. No article has a completed citation review yet.
        </p>

        <p className={`${PROSE_CLASS} mt-7`}>
          The review workbench stores one of three statuses: <strong>needed</strong>,{" "}
          <strong>in progress</strong>, or <strong>completed</strong>. Completed means a
          human editor recorded a review at a point in time. When the stored reviewer
          identity resolves to a public contributor profile, the article attributes that
          specific review. Editor saves and review status are distinct records: the
          changelog shows who changed text and when, while the review status shows that a
          review was marked complete.
        </p>
        <p className={`${PROSE_CLASS} mt-5`}>
          The editorial reviewer reads and corrects the article text. The citation
          workflows (<SectionRef s="citations" />) attach and audit citation markers
          under their own recorded states, separate from editorial review.{" "}
          <SectionRef s="limits" cap /> spells out what a completed status does and does
          not establish.
        </p>
        <p className={`${PROSE_CLASS} mt-5`}>
          Structure drawings are the one pipeline output a person makes by hand. The
          molecule editor is a separate tool from the text editor
          (<SectionRef s="parsing" comma />, under Chemistry identifiers). An editor
          redraws the molecule by hand, or draws one template for a chemical class and
          applies it to every member. Hand-drawn molecules are never overwritten by a
          template. Saving a drawing does not change the article text or its review
          status.
        </p></section>

        <section id="limits" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>08</span>{" "}What can still go wrong
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          The workflows above reduce error without eliminating it. This section
          collects the limits in one place so that the rest of the page does not
          have to hedge every sentence.
        </p>

        <p className={`${PROSE_CLASS} mt-5`}>
          <strong>Source links record influence only.</strong> Source-page links document material
          that informed the pipeline. They do not, by themselves, show that a source
          supports a particular sentence. Citation markers record the separate, intended
          evidentiary relationships between claims and references, and{" "}
          <SectionRef s="citations" /> describes how those are produced and audited.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>Citation evidence can be wrong.</strong> A marker records a quote and a
          rationale, and the entailment audit checked that the source supports the
          sentence. It does not prove source quality or current accuracy.
          Important claims still need a human check against the cited source.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>Workflow controls have limits.</strong> Prompts, validators,
          citation evidence, and editorial review reduce error and make decisions
          inspectable. They cannot guarantee that prose is complete, that a citation
          entails every nearby phrase, or that information remains current.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>A completed review is a dated record.</strong> Completed means
          a human editor recorded a review at a point in time. It does not certify every
          sentence, dose, interaction, citation, or legal conclusion. The status does
          not pin the exact article revision that was reviewed. Later edits can make an
          older completion record stale, and the stored status does not change.
          Citation states (including the visible <em>citation needed</em>{" "}
          indicator) are
          workflow records, never the reviewer&apos;s personal claims.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>The working copies have a date.</strong>{" "}
          The pipeline reads working copies captured on the date given in{" "}
          <SectionRef s="sources" />. Source sites keep evolving after capture, and the
          baseline is never re-captured. Later accuracy comes from the human and citation
          stages in <SectionRef s="status" />.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          <strong>LLMs make mistakes.</strong> The verbatim-excerpt rule exists because
          an LLM that re-types source text can hallucinate: a changed digit or an invented
          phrase can slip in unnoticed (<SectionRef s="excerpts" />). So LLMs never
          transcribe, and drafts are held to their excerpt documents. Synthesis can still
          misweigh or omit evidence. Drafts stay revisable because they return
          through the citation and review workflows.
        </p>
        </section>

        <section id="status" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>09</span>{" "}Status &amp; roadmap
        </h2>

        <p className={PULL_CLASS}>
          dose.wiki is in <strong>beta</strong>. Every article is generated, checked, and
          corrected in public through workflows that are still running.
        </p>

        <p className={`${PROSE_CLASS} mt-5`}>
          Work on the baseline runs in stages. Some are finished, and the rest are
          planned. This section records where each stands as of{" "}
          <strong>August 31, 2026</strong>.
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
              The baseline is complete for every article: verbatim excerpt extraction, AI
              synthesis, and claim-level citations across the working copies. Sections{" "}
              <a href="#pipeline" className={proseLinkClassName}>02</a> through{" "}
              <a href="#citations" className={proseLinkClassName}>06</a> describe this
              pipeline. Every extraction and section prompt is published on this page.
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
              This was the country-by-country deep research in <SectionRef s="citations" />.
              The workflow validated existing legality entries against statutes and
              official schedules where possible. Remaining claims received targeted
              primary-source searches. Entries that survived were cited. Entries that could
              not be sourced were corrected, removed, or flagged <em>citation needed</em>.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 3: Citation entailment audit</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="published" /> Complete
              </div>
            </div>
            <p className={PROSE_CLASS}>
              The legality process, generalized to the other citable sections
              (<SectionRef s="citations" />): the audit re-examined every claim&ndash;citation pair
              against a fresh fetch of its source. Markers the source did not explicitly
              support were removed, and those sentences now show <em>citation needed</em>.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 4: Citation research and correction</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="review" /> Planned
              </div>
            </div>
            <p className={PROSE_CLASS}>
              A research pass over the audit&apos;s output, starting with pharmacology.
              Each <em>citation needed</em> claim receives a source search. If a source is
              found, the marker is restored. If none is found, or the source disagrees, the
              claim is changed or removed. A recorded human pass then reviews the results.
              The site tracks this separately from editorial review (<SectionRef s="review" />), so each carries
              its own status and scope. Done when every flagged entry carries a recorded
              disposition.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 5: Emergent Subjective Effect Index</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="review" /> Planned
              </div>
            </div>
            <p className={PROSE_CLASS}>
              This is a new version of the Subjective Effect Index, developed by Josie Kins at
              Mindstate Design Labs. On release it replaces the current Subjective Effect
              Index, and the subjective effects section of every article is rebuilt on it.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 6: More substances</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="automated" /> Planned
              </div>
            </div>
            <p className={PROSE_CLASS}>
              The current substance set is the one the working copies cover. New
              substances are added by running the same pipeline on new source pages, then
              passing through the audit and review stages above.
            </p>
          </div>
          <div className={DIVIDED_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className={SUBHEAD_CLASS}>Phase 7: Continuous improvement</h3>
              <div className={LEGEND_ITEM_CLASS}>
                <StageSwatch tone="source" /> Ongoing
              </div>
            </div>
            <p className={PROSE_CLASS}>
              Editor corrections, messages sent through the article feedback form,
              replication evidence, and curated additions continue to build on the baseline.
            </p>
          </div>
        </ContentCard></section>

        <section id="dataset" className={SECTION_CLASS}><h2 className={SECTION_HEADING_CLASS}>
          <span className={SECTION_NUM_CLASS}>10</span>{" "}The open dataset
        </h2>

        <p className={`${PROSE_CLASS} mt-4`}>
          This pipeline produces more than public pages. It produces{" "}
          <code>SubstanceIndex.json</code>: the full substance database in one consistent
          schema and one downloadable file. The download is a snapshot, made when the dataset
          is exported. The article database continues to change between snapshots.
        </p>
        <p className={`${PROSE_CLASS} mt-4`}>
          It also produces the molecule pack: one SVG drawing per substance, plus
          generic skeletons for chemical classes, plus a manifest that lists each
          drawing with its SMILES string and whether it was drawn by hand, aligned to a
          template, or left as an automatic layout. Each drawing is distributed in two
          color sets, the dose.wiki brand colors and the standard textbook colors. The pack
          is rebuilt every night from the live depiction database. It is a set of
          human-curated structure drawings that anyone can reuse.
        </p>

        <p className={`${PROSE_CLASS} mt-4`}>
          Researchers, developers, educators, and community projects can download the
          dataset and build on it, without rebuilding a harm-reduction encyclopedia
          first.
        </p>

        <div className="mt-6">
          <AboutArchivePreview
            previewSnapshots={previewSnapshots}
            downloads={{ substances: substanceDownload, molecules: getMoleculePackDownloadStats() }}
          />
        </div>

        <div className="mt-6 space-y-8">
          <div>
            <h3 className={SUBHEAD_CLASS}>The public prose is new writing</h3>
            <p className={PROSE_CLASS}>
              Verbatim source text stays in internal excerpt files, like research notes.
              Published article prose is drafted under instructions not to copy source
              wording. The citation and editorial workflows can identify support problems
              or wording that needs correction. Facts are not copyrightable, and
              dose.wiki uses its own wording, schema, and article structure for the expression.
            </p>
          </div>
          <div>
            <h3 className={SUBHEAD_CLASS}>The reusable parts are CC0</h3>
            <p className={PROSE_CLASS}>
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
                <h3 className={SUBHEAD_BASE_CLASS}>Questions or corrections?</h3>
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
                <h3 className={SUBHEAD_BASE_CLASS}>How the site itself is built</h3>
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
