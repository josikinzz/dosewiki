import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
} from "../../editing";
import { HeroSection } from "./HeroSection";
import { PharmacologySection } from "./PharmacologySection";
import { SubjectiveEffectsSection } from "./SubjectiveEffectsSection";
import { ToleranceSection } from "./ToleranceSection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A stage key that is hostile to naive path building: it carries both a space
 * and a dot, and a dot is the field-path separator. Live articles really do
 * store `"1. Taking Off"`.
 */
const STAGE_KEY = "1. Taking Off";
/** A sensory subcategory key with a space, as stored. */
const SENSORY_SUBCATEGORY_KEY = "Hallucinatory States";

function buildProseArticle(): SubstanceArticle {
  const empty = createEmptyArticle();

  return {
    ...empty,
    title: "Psilocybin",
    summary: "Psilocybin is a naturally occurring tryptamine prodrug.",
    identification: {
      ...empty.identification,
      common_name: "Magic mushrooms",
      substitutive_name: "4-PO-DMT",
      botanical_name: "Psilocybe cubensis",
    },
    classification: {
      psychoactive_class: ["Psychedelic"],
      chemical_class: ["Tryptamine"],
    },
    index_categories: ["Common"],
    tolerance: {
      full_tolerance: "Builds over three to four consecutive doses.",
      half_tolerance: "About five days.",
      baseline_tolerance: "About two weeks.",
      cross_tolerance: ["LSD", "Mescaline"],
    },
    subjective_effects: {
      ...empty.subjective_effects,
      notes: {
        overview: "Effects are strongly dose dependent.",
        sensory: "",
        cognitive: "Cognition loosens rather than sharpens.",
        physical: "Body load is usually mild.",
      },
      physical: {
        General: { note: "A general physical note.", effects: [{ name: "Nausea", description: "" }] },
      },
      cognitive: {
        "Thought Patterns": {
          note: "Associative thinking dominates.",
          effects: [
            { name: "Conceptual thinking", description: "" },
            { name: "Thought loops", description: "" },
          ],
        },
      },
      sensory: {
        ...empty.subjective_effects.sensory,
        visual: {
          note: "Visual effects arrive first.",
          subcategories: {
            [SENSORY_SUBCATEGORY_KEY]: {
              note: "Reported above moderate doses.",
              effects: [
                { name: "Internal hallucination", description: "" },
                { name: "External hallucination", description: "" },
              ],
            },
          },
        },
      },
      progressive_stages: {
        [STAGE_KEY]: {
          note: "The first thirty minutes.",
          effects: [{ name: "Anticipation", description: "" }],
        },
      },
    },
    pharmacology: {
      ...empty.pharmacology,
      pharmacodynamics:
        "A partial agonist at 5-HT2A.\n\nAffinity at 5-HT1A is weaker but not negligible.",
      pharmacokinetics: "Dephosphorylated to psilocin in the gut.",
      binding_sites: [{ target: "5-HT2A", tag: "5-HT2A (partial agonist)" }],
      metabolites: ["Psilocin (active)"],
    },
  } as SubstanceArticle;
}

/** Everything the sections above wire is absent, but each still renders. */
function buildSparseArticle(): SubstanceArticle {
  const empty = createEmptyArticle();

  return {
    ...empty,
    title: "Sparse",
    classification: {
      psychoactive_class: ["Depressant"],
      chemical_class: [],
    },
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: ["Alcohol"],
    },
    subjective_effects: {
      ...empty.subjective_effects,
      is_stub: true,
      physical: {
        "Bodily Control": {
          note: "",
          effects: [
            { name: "Motor control loss", description: "" },
            { name: "Sedation", description: "" },
          ],
        },
      },
      progressive_stages: {
        [STAGE_KEY]: { note: "", effects: [{ name: "Anticipation", description: "" }] },
      },
    },
    pharmacology: {
      ...empty.pharmacology,
      // No stored pharmacodynamics: the section falls back to `summary`, which
      // this path does not address.
      summary: "Positive allosteric modulation at GABA-A.",
      // No stored pharmacokinetics: the section falls back to `metabolism`.
      metabolism: "Hepatic.",
    },
  } as unknown as SubstanceArticle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function editingSurface(node: ReactElement, commit: ArticleEditContextValue["commit"]) {
  return render(<ArticleEditProvider value={{ commit }}>{node}</ArticleEditProvider>);
}

function editablePaths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-editable-path]")).map(
    (node) => node.getAttribute("data-editable-path") ?? "",
  );
}

async function editField(label: string, text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Edit ${label}` }));
  const field = screen.getByRole("textbox", { name: `Edit ${label}` });
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

// ---------------------------------------------------------------------------
// The public article is untouched
// ---------------------------------------------------------------------------

/**
 * The snapshots below were captured after the wiring landed and then diffed,
 * character for character, against the same fixtures rendered through the
 * pre-wiring components. They are the unchanged public markup, not merely the
 * current one: `EditableValue` and `EditableSlot` collapse to their children
 * and to nothing at all without an `ArticleEditContext`, and no reader ever
 * supplies one. `editablePaths` is the cheap standing check — a wrapper that
 * ever leaked onto the public page would show up as a path here first.
 */
describe("public prose render", () => {
  it("renders the hero with no editing markup", () => {
    const { container } = render(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
    );

    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div id="introduction" class="theme-article-hero relative scroll-mt-6 overflow-hidden rounded-2xl p-6 shadow-[var(--theme-elevation-2xl)] sm:p-8"><h1 data-hero-title-scale="normal" class="type-page-title theme-accent-heading text-4xl sm:text-5xl md:text-6xl">Psilocybin</h1><div role="status" class="theme-article-stub-banner flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border px-4 py-2.5 mt-4 type-reading-measure" title="No dosage or duration data has been published for it. Five of its eight sections have no published data. Everything shown is sourced; the gaps are real gaps, not omissions."><span class="theme-text-primary text-sm font-semibold">This article is a stub</span><span class="theme-text-faint text-xs">missing:</span><span class="flex flex-wrap gap-1.5"><div class="inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 font-medium text-[11px] normal-case tracking-normal">Dosage &amp; Duration</div><div class="inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 font-medium text-[11px] normal-case tracking-normal">Interactions</div><div class="inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 font-medium text-[11px] normal-case tracking-normal">Harm Potential</div><div class="inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 font-medium text-[11px] normal-case tracking-normal">History &amp; Culture</div><div class="inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-strong)] focus:ring-offset-2 focus:ring-offset-transparent border-[var(--theme-border-subtle)] bg-transparent text-[var(--theme-text-secondary)] px-2.5 py-1 font-medium text-[11px] normal-case tracking-normal">Legality</div></span></div><div class="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure"><span>4-PO-DMT</span></div><div class="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure"><span class="italic">Psilocybe cubensis</span></div><div class="mt-6 space-y-4"><div class="flex items-start gap-3"><div><span class="type-meta-label theme-text-faint mb-2 block">Psychoactive Class</span><div class="flex flex-wrap gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/substances/group/psychedelic">Psychedelic</a></div></div></div><div class="flex items-start gap-3"><div><span class="type-meta-label theme-text-faint mb-2 block">Chemical Class</span><div class="flex flex-wrap items-center gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/chemical-classes/tryptamine">Tryptamine</a></div></div></div></div><div class="mt-6 space-y-1"><p class="type-detail-copy theme-text-secondary"><span class="theme-text-primary font-semibold">Common name:</span> Magic mushrooms</p></div><div class="mt-5 flex flex-wrap gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/category/Common">Common</a></div><p class="theme-article-hero-summary theme-text-primary mt-8 pt-6 text-sm leading-relaxed whitespace-pre-wrap break-words"><strong class="theme-accent-heading font-semibold">Psilocybin</strong> is a naturally occurring tryptamine prodrug.</p></div>"`);
  });

  it("renders tolerance with no editing markup", () => {
    const { container } = render(<ToleranceSection article={buildProseArticle()} />);

    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="tolerance" class="space-y-6 pt-12 scroll-mt-6 theme-offscreen-defer"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">Tolerance</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><p class="theme-text-muted mb-3 flex items-start gap-2 text-xs leading-relaxed"><span>Tolerance timelines are rules of thumb, not exact schedules, and vary widely between individuals and use patterns.</span></p><div class="flex w-full gap-4"><div style="width: 50%;" class="flex flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-4 flex flex-col gap-2.5 ring-1 ring-[rgb(var(--c-brand)/0.10)]" data-tone="accent"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Full Tolerance</span></span></div><div class="theme-text-primary text-sm leading-relaxed"><div class="text-sm leading-relaxed theme-text-primary">Builds over three to four consecutive doses.</div></div></div><div class="rounded-xl border theme-article-subsection-card-nested p-4 flex flex-col gap-2.5 ring-1 ring-[rgb(var(--c-brand)/0.10)]" data-tone="accent"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Baseline Reset</span></span></div><div class="theme-text-primary text-sm leading-relaxed"><div class="text-sm leading-relaxed theme-text-primary">About two weeks.</div></div></div></div><div style="width: 50%;" class="flex flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-4 flex flex-col gap-2.5 ring-1 ring-[rgb(var(--c-brand)/0.10)]" data-tone="accent"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Half Tolerance</span></span></div><div class="theme-text-primary text-sm leading-relaxed"><div class="text-sm leading-relaxed theme-text-primary">About five days.</div></div></div><div class="rounded-xl border theme-article-subsection-card-nested p-4 flex flex-col gap-2.5 ring-1 ring-[rgb(var(--c-brand)/0.10)]" data-tone="accent"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Cross Tolerance</span></span></div><div class="theme-text-primary text-sm leading-relaxed"><p><span>LSD</span><span>, Mescaline</span></p></div></div></div></div></section>"`);
  });

  it("renders subjective effects with no editing markup", () => {
    const { container } = render(
      <SubjectiveEffectsSection article={buildProseArticle()} />,
    );

    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`
      "<section id="subjective-effects" class="space-y-6 pt-12 scroll-mt-6 theme-offscreen-defer"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">Subjective Effects</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><p class="theme-text-faint inline-flex items-start gap-1.5 text-xs leading-5 text-pretty"><span>Legacy content. A statistically backed ontology from <a href="https://mindstate.design" target="_blank" rel="noopener noreferrer" class="theme-text-secondary underline decoration-dose-divider decoration-1 underline-offset-[3px] whitespace-nowrap transition hover:text-dose-accent hover:decoration-dose-accent"><span aria-hidden="true" class="theme-mindstate-favicon ml-0.5 mr-1 inline-block size-3 shrink-0 bg-current align-[-0.125em]"></span>Mindstate Design Labs</a> is coming soon.</span></p><p class="text-sm leading-relaxed theme-text-secondary">Effects are strongly dose dependent.</p><div class="space-y-8"><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Physical</h3></div></div><p class="theme-text-muted text-sm leading-relaxed">Body load is usually mild.</p><div class="space-y-4"><p class="theme-text-muted mb-3 text-sm leading-relaxed">A general physical note.</p><div class="flex flex-wrap gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/effects/nausea">Nausea</a></div></div></section><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Cognitive</h3></div></div><p class="theme-text-muted text-sm leading-relaxed">Cognition loosens rather than sharpens.</p><div class="space-y-4"><div class="pl-5 pt-5 first:pt-0 sm:pl-6"><h4 class="theme-text-secondary mb-2.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold leading-5"><span class="h-1.5 w-1.5 rounded-full bg-dose-accent-muted"></span>Thought Patterns</h4><p class="theme-text-muted mb-3 text-sm leading-relaxed">Associative thinking dominates.</p><div><div class="flex flex-wrap gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/effects/conceptual-thinking">Conceptual thinking</a><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/effects/thought-loops">Thought loops</a></div></div></div></div></section><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Progressive Stages</h3></div></div><div><div class="theme-progressive-stage rounded-xl"><button type="button" aria-expanded="false" aria-controls="subjective-stage-1-taking-off-note" class="theme-progressive-stage-trigger flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent"><span class="theme-text-primary min-w-0 flex-1 text-sm font-semibold">1. Taking Off</span><span aria-hidden="true" data-expand-indicator="" class="inline-flex items-center gap-0.5 theme-text-muted shrink-0"></span></button><div class="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out grid-rows-[0fr]"><div class="overflow-hidden"><p id="subjective-stage-1-taking-off-note" class="theme-text-secondary pb-3 pl-[2.625rem] pr-3 text-sm leading-relaxed">The first thirty minutes.</p></div></div></div></div></section><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Visual</h3></div></div><p class="theme-text-muted text-sm leading-relaxed">Visual effects arrive first.</p><div class="space-y-4"><div class="pl-5 pt-5 first:pt-0 sm:pl-6"><h4 class="theme-text-secondary mb-2.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold leading-5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 294.753 294.753" fill="currentColor" class="theme-icon-accent" width="16" height="16" aria-hidden="true"><g><path d="M279.025,125.777c-0.052-2.718-1.57-5.194-3.968-6.475c-2.396-1.277-5.299-1.162-7.587,0.309l-43.758,28.131
                c-0.146-0.21-0.29-0.422-0.439-0.63c3.8-2.721,6.285-7.162,6.285-12.192c0-8.284-6.716-15-15-15h-1.637H82.193h-2.634
                c-8.284,0-15,6.716-15,15c0,5.045,2.498,9.496,6.316,12.216c-0.082,0.114-0.16,0.23-0.24,0.345l-43.353-27.869
                c-2.285-1.47-5.188-1.587-7.587-0.309c-2.397,1.28-3.916,3.757-3.968,6.475c-1.157,60.778,26.863,80.65,38.48,86.264
                c5.367,46.493,44.968,82.712,92.875,82.712c47.806,0,87.341-36.066,92.84-82.418C251.127,207.142,280.203,187.668,279.025,125.777z
                M53.847,194.196c-8.712-6.944-20.666-22.206-22.815-54.343l31.961,20.546C57.945,170.747,54.751,182.156,53.847,194.196z
                M147.084,279.753c-43.285,0-78.501-35.216-78.501-78.501c0-19.615,7.248-37.558,19.186-51.332h118.631
                c11.937,13.774,19.185,31.717,19.185,51.332C225.584,244.537,190.369,279.753,147.084,279.753z M240.346,194.639
                c-0.849-12.091-4.002-23.556-9.03-33.953l32.405-20.832C261.525,172.681,249.097,187.906,240.346,194.639z"></path><circle cx="176.496" cy="186.753" r="11.472"></circle><circle cx="117.67" cy="186.754" r="11.471"></circle><path d="M176.388,20.077C171.964,7.97,160.449,0,147.559,0c-12.889,0-24.405,7.928-28.829,20.035L89.508,99.92h116.096
                L176.388,20.077z"></path><path d="M146.726,223.42c4.143,0,7.5-3.357,7.5-7.5v-13c0-4.143-3.357-7.5-7.5-7.5c-4.143,0-7.5,3.357-7.5,7.5v13
                C139.226,220.063,142.584,223.42,146.726,223.42z"></path><path d="M121.226,232.922c0,14.175,11.825,25.666,26.001,25.666c14.174,0,25.999-11.491,25.999-25.666v-0.002h-52V232.922z"></path></g></svg>Hallucinatory States</h4><p class="theme-text-muted mb-3 text-sm leading-relaxed">Reported above moderate doses.</p><div><div class="flex flex-wrap gap-2"><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/effects/internal-hallucination">Internal hallucination</a><a class="theme-name-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium ring-1 ring-transparent transition theme-focus-ring relative before:absolute before:inset-[-0.375rem] before:content-[''] [@media(pointer:fine)]:before:inset-0 theme-name-chip-interactive" data-token="public-name-chip" href="/effects/external-hallucination">External hallucination</a></div></div></div></div></section></div></section>"
    `);
  });

  it("renders pharmacology with no editing markup", () => {
    const { container } = render(<PharmacologySection article={buildProseArticle()} />);

    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="pharmacology" class="space-y-6 pt-12 scroll-mt-6 theme-offscreen-defer"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">Pharmacology</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><section class="space-y-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary font-semibold">Pharmacodynamics</h3></div></div><div class="space-y-3"><p class="text-sm leading-relaxed theme-text-primary">A partial agonist at 5-HT2A.</p><p class="text-sm leading-relaxed theme-text-primary">Affinity at 5-HT1A is weaker but not negligible.</p></div><div class="space-y-3" data-expanded="false"><div id="expandable-list-_r_0_"></div><div class="flex justify-center mt-3 pt-1.5"><button type="button" aria-expanded="false" aria-controls="expandable-list-_r_0_" aria-label="Expand binding sites" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill theme-control-pill-expander inline-flex items-center rounded-full text-xs gap-2 px-3.5 py-1.5"><span class="inline-flex min-w-0 items-center gap-1.5"><span class="inline-flex min-w-0 items-center gap-1.5 pr-0.5 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0">Binding Sites</span></span></span><span class="font-medium">+1</span></button></div></div></section><section class="space-y-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-article-subsection-heading theme-text-primary font-semibold">Pharmacokinetics</h3></div></div><p class="text-sm leading-relaxed theme-text-primary">Dephosphorylated to psilocin in the gut.</p><div class="space-y-3" data-expanded="false"><div id="expandable-list-_r_1_"></div><div class="flex justify-center theme-article-section-adornment mt-4 -mb-8"><button type="button" aria-expanded="false" aria-controls="expandable-list-_r_1_" aria-label="Expand metabolites" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill theme-control-pill-expander inline-flex items-center rounded-full text-xs gap-2 px-3.5 py-1.5"><span class="inline-flex min-w-0 items-center gap-1.5"><span class="inline-flex min-w-0 items-center gap-1.5 pr-0.5 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0">Metabolites</span></span></span><span class="font-medium">+1</span></button></div></div></section></section>"`);
  });

  it("adds nothing to a sparse article, where every empty-field prompt lives", () => {
    const article = buildSparseArticle();
    const { container } = render(
      <div>
        <HeroSection article={article} showPreviewBadge={false} />
        <ToleranceSection article={article} />
        <SubjectiveEffectsSection article={article} />
        <PharmacologySection article={article} />
      </div>,
    );

    expect(editablePaths(container)).toEqual([]);
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toEqual([]);
    // The prompts are absent as text too, not merely as controls.
    expect(container.textContent).not.toMatch(/^Add /m);
  });
});

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

describe("hero inline editing", () => {
  it("wires the title and the identification names", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await editField("Title", "Psilocybine");
    await editField("Substitutive name", "4-PO-DMT (corrected)");
    await editField("Botanical name", "Psilocybe cubensis (Earle) Singer");
    await editField("Common name", "Magic mushroom");

    expect(commit.mock.calls.map(([path, value]) => [path, value])).toEqual([
      ["title", "Psilocybine"],
      ["identification.substitutive_name", "4-PO-DMT (corrected)"],
      ["identification.botanical_name", "Psilocybe cubensis (Earle) Singer"],
      ["identification.common_name", "Magic mushroom"],
    ]);
  });

  it("edits the summary as one field, first word included", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const user = userEvent.setup();
    editingSurface(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await user.click(screen.getByRole("button", { name: "Edit Summary" }));
    const field = screen.getByRole("textbox", { name: "Edit Summary" });
    // The paragraph bolds its own first word by splitting the string. The
    // editor must still see the whole field, or saving would write the tail
    // over the head.
    expect(field).toHaveValue(
      "Psilocybin is a naturally occurring tryptamine prodrug.",
    );

    await user.clear(field);
    await user.type(field, "Psilocybin is a tryptamine prodrug.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "summary",
      "Psilocybin is a tryptamine prodrug.",
      "Psilocybin is a naturally occurring tryptamine prodrug.",
    );
  });

  it("offers a prompt for each hero field the article is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(
      <HeroSection article={buildSparseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await editField("Substitutive name", "Diazepam");
    await editField("Summary", "A benzodiazepine.");

    expect(commit.mock.calls.map(([path, value, expected]) => [path, value, expected])).toEqual([
      ["identification.substitutive_name", "Diazepam", ""],
      ["summary", "A benzodiazepine.", ""],
    ]);
    expect(
      screen.getByRole("button", { name: "Edit Botanical name" }),
    ).toHaveTextContent("Add a botanical name");
    expect(
      screen.getByRole("button", { name: "Edit Common name" }),
    ).toHaveTextContent("Add a common name");
  });
});

// ---------------------------------------------------------------------------
// Tolerance
// ---------------------------------------------------------------------------

describe("tolerance inline editing", () => {
  it("keeps the three tolerance strings wired and adds the cross-tolerance entries", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<ToleranceSection article={buildProseArticle()} />, commit);

    await editField("Full Tolerance", "Four doses.");
    await editField("Cross tolerance entry 2", "Mescaline (partial)");

    expect(commit.mock.calls.map(([path, value]) => [path, value])).toEqual([
      ["tolerance.full_tolerance", "Four doses."],
      ["tolerance.cross_tolerance[1]", "Mescaline (partial)"],
    ]);
  });

  it("prompts for the tolerance strings an article is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<ToleranceSection article={buildSparseArticle()} />, commit);

    await editField("Half Tolerance", "Three days.");

    expect(commit).toHaveBeenCalledWith("tolerance.half_tolerance", "Three days.", "");
  });
});

// ---------------------------------------------------------------------------
// Subjective effects
// ---------------------------------------------------------------------------

describe("subjective effects inline editing", () => {
  it("wires the family notes, the sense note, and the subcategory note", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildProseArticle()} />, commit);

    await editField("Subjective effects overview", "Dose dependent.");
    await editField("Physical effects note", "Mild body load.");
    await editField("Cognitive effects note", "Associative.");
    await editField("Visual note", "Visuals lead.");
    await editField("Hallucinatory States note", "Above moderate doses.");
    await editField("General note", "A general physical note, revised.");

    expect(commit.mock.calls.map(([path]) => path)).toEqual([
      "subjective_effects.notes.overview",
      "subjective_effects.notes.physical",
      "subjective_effects.notes.cognitive",
      "subjective_effects.sensory.visual.note",
      // The subcategory key travels percent-encoded; the space would otherwise
      // be indistinguishable from path syntax.
      "subjective_effects.sensory.visual.subcategories.Hallucinatory%20States.note",
      "subjective_effects.physical.General.note",
    ]);
  });

  it("encodes a progressive-stage key that contains a dot", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildProseArticle()} />, commit);

    await editField("1. Taking Off note", "The first half hour.");

    // `1. Taking Off` verbatim would split into two segments and address
    // nothing. `%2E` keeps it one.
    expect(commit).toHaveBeenCalledWith(
      "subjective_effects.progressive_stages.1%2E%20Taking%20Off.note",
      "The first half hour.",
      "The first thirty minutes.",
    );
  });

  it("seeds the overview editor from the stored note, not the fallback sentence", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <SubjectiveEffectsSection article={buildSparseArticle()} />,
      commit,
    );

    // The paragraph shows a generic sentence when the note is empty. Seeding
    // the editor from it would let a reviewer save boilerplate as though
    // somebody had written it about this substance.
    const overview = container.querySelector(
      '[data-editable-path="subjective_effects.notes.overview"]',
    );
    expect(overview).toHaveTextContent("Add an overview note");
    expect(overview?.textContent).not.toContain("Effects vary widely");

    await user.click(
      screen.getByRole("button", { name: "Edit Subjective effects overview" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Edit Subjective effects overview" }),
    ).toHaveValue("");
  });

  it("prompts for the notes a rendered group is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildSparseArticle()} />, commit);

    await editField("Physical effects note", "Sedating.");
    await editField("Bodily Control note", "Coordination degrades first.");
    await editField("1. Taking Off note", "Onset.");

    expect(commit.mock.calls.map(([path, , expected]) => [path, expected])).toEqual([
      ["subjective_effects.notes.physical", ""],
      ["subjective_effects.physical.Bodily%20Control.note", ""],
      ["subjective_effects.progressive_stages.1%2E%20Taking%20Off.note", ""],
    ]);
  });

  it("leaves the effect chips alone", () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <SubjectiveEffectsSection article={buildProseArticle()} />,
      commit,
    );

    // Subcategories are flattened and badge subtitles are regex-derived from
    // the description, so a chip has no single field to write back to.
    for (const path of editablePaths(container)) {
      expect(path).toMatch(/\.(note|overview|physical|cognitive)$/);
    }
    expect(
      screen.queryByRole("button", { name: /^Edit .*(Nausea|hallucination)/ }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pharmacology
// ---------------------------------------------------------------------------

describe("pharmacology inline editing", () => {
  it("edits pharmacodynamics as one block and pharmacokinetics one to one", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<PharmacologySection article={buildProseArticle()} />, commit);

    await user.click(screen.getByRole("button", { name: "Edit Pharmacodynamics" }));
    // Both paragraphs at once: they are one field split on the blank line, so a
    // per-paragraph editor would save one over the other.
    expect(
      screen.getByRole("textbox", { name: "Edit Pharmacodynamics" }),
    ).toHaveValue(
      "A partial agonist at 5-HT2A.\n\nAffinity at 5-HT1A is weaker but not negligible.",
    );
    await user.keyboard("{Escape}");

    await editField("Pharmacokinetics", "Dephosphorylated to psilocin.");

    expect(commit).toHaveBeenCalledExactlyOnceWith(
      "pharmacology.pharmacokinetics",
      "Dephosphorylated to psilocin.",
      "Dephosphorylated to psilocin in the gut.",
    );
  });

  it("never offers borrowed summary prose as a pharmacodynamics edit", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <PharmacologySection article={buildSparseArticle()} />,
      commit,
    );

    // The paragraph on screen is `pharmacology.summary`. Only the prompt is
    // editable, so saving cannot copy one field's prose into another.
    const editable = container.querySelector(
      '[data-editable-path="pharmacology.pharmacodynamics"]',
    );
    expect(editable).toHaveTextContent("Add pharmacodynamics");
    expect(
      within(container).getByText(/Positive allosteric modulation/),
    ).not.toHaveAttribute("data-editable-path");

    await editField("Pharmacodynamics", "Positive allosteric modulator at GABA-A.");
    expect(commit).toHaveBeenCalledWith(
      "pharmacology.pharmacodynamics",
      "Positive allosteric modulator at GABA-A.",
      "",
    );
  });

  it("prompts for pharmacokinetics when the text on screen is legacy metabolism", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<PharmacologySection article={buildSparseArticle()} />, commit);

    await editField("Pharmacokinetics", "Hepatic metabolism, renal excretion.");

    expect(commit).toHaveBeenCalledWith(
      "pharmacology.pharmacokinetics",
      "Hepatic metabolism, renal excretion.",
      "",
    );
  });
});
