import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
} from "../../editing";
import { HistoryCultureSection } from "./HistoryCultureSection";
import { LegalitySection } from "./LegalitySection";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import {
  PsychosisRiskSubsection,
  SeizureRiskSubsection,
} from "./harm-potential/RisksSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import {
  normalizeHarmPotential,
  type NormalizedHarmPotential,
} from "./harm-potential/HarmPotentialUtils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const legalityArticle = {
  title: "Example",
  references: [],
  legality: {
    international: ["Listed under the 1971 Convention.", "No WHO review."],
    countries: {
      "United States": {
        canonicalStatus: "prohibited",
        notes: "Federally prohibited.",
      },
      Germany: {
        canonicalStatus: "prohibited",
        notes: "Anlage I BtMG.",
      },
      Portugal: {
        canonicalStatus: "decriminalized",
      },
    },
    usStates: {
      Florida: {
        canonicalStatus: "prohibited",
        notes: "State ban.",
        cities: {
          Miami: { canonicalStatus: "decriminalized", notes: "City ordinance." },
        },
      },
    },
    usStatesNote: "State law varies considerably.",
  },
} as unknown as SubstanceArticle;

const LONG_HISTORY_CONTENT = `${"Synthesised in 1912 by chemists working on haemostatic agents. ".repeat(12)}`;

const historyArticle = {
  references: [],
  history_culture: {
    content: LONG_HISTORY_CONTENT,
    sections: [
      // Empty leading entry: filtered out of the render, so every later
      // section's rendered position is one lower than its stored index.
      { heading: "", content: "", subsections: [] },
      {
        heading: "Origins",
        content: `${"The first documented use dates to 1927. ".repeat(14)}`,
        subsections: [{ heading: "Early Reports", content: "An early report." }],
      },
      { heading: "Modern Era", content: "Rediscovered in 1976." },
    ],
  },
} as unknown as SubstanceArticle;

const freeformHistoryArticle = {
  references: [],
  history_culture: {
    content: LONG_HISTORY_CONTENT,
    sections: [],
  },
} as unknown as SubstanceArticle;

/** Modern shape: every rendered string is stored at its canonical path. */
const modernHarmArticle = {
  references: [],
  harm_potential: {
    addiction: {
      psychological: { level: "moderate", description: "Psychological reliance is common." },
      physical_dependence: { level: "low", description: "Physical dependence is rare." },
    },
    psychosis: { level: "low", description: "Psychosis risk is low." },
    seizure: { level: "low", description: "Seizure risk is low." },
    toxicity: {
      lethal_dosage: { ld50: [], notes: "No reliable human LD50 exists." },
      organ_toxicity: [
        {
          system: "Hepatic",
          findings: "Elevated transaminases.",
          mechanism: "Oxidative stress.",
          notes: "Reversible on cessation.",
        },
      ],
    },
  },
} as unknown as SubstanceArticle;

/**
 * Legacy shape: the same four descriptions and the lethal-dosage note are
 * synthesised by the normalizer out of `addiction_liability`,
 * `dependence_liability`, `risks.*` and a string `toxicity.ld50`. Nothing is
 * stored at the canonical paths, so nothing here may be editable.
 */
const legacyHarmArticle = {
  references: [],
  harm_potential: {
    addiction_liability: "Legacy addiction liability text.",
    dependence_liability: "Legacy dependence liability text.",
    risks: {
      psychosis: "Legacy psychosis text.",
      seizure: "Legacy seizure text.",
    },
    toxicity: {
      ld50: "Legacy LD50 string.",
    },
  },
} as unknown as SubstanceArticle;

function normalized(article: SubstanceArticle): NormalizedHarmPotential {
  const value = normalizeHarmPotential(article);
  if (!value) throw new Error("fixture produced no harm potential");
  return value;
}

function withProvider(
  node: ReactNode,
  commit: ArticleEditContextValue["commit"] = async (_path, value) => value,
) {
  return render(<ArticleEditProvider value={{ commit }}>{node}</ArticleEditProvider>);
}

function harmPotentialTree(article: SubstanceArticle) {
  const harm = normalized(article);
  return (
    <>
      <AddictionSubsection addiction={harm.addiction} article={article} />
      <PsychosisRiskSubsection risks={harm.risks} article={article} />
      <SeizureRiskSubsection risks={harm.risks} article={article} />
      <ToxicitySubsection toxicity={harm.toxicity} article={article} />
    </>
  );
}

const editablePaths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-editable-path]")).map((node) =>
    node.getAttribute("data-editable-path"),
  );

// ---------------------------------------------------------------------------
// Public render is unchanged
// ---------------------------------------------------------------------------

describe("public article render", () => {
  it("renders legality without any editing markup", () => {
    const { container } = render(<LegalitySection article={legalityArticle} />);
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="legality" class="space-y-6 pt-12 scroll-mt-6"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">Legality</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><section class="space-y-4 mb-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary font-semibold normal-case tracking-normal">International</h3></div></div><div class="space-y-2"><p class="text-sm leading-relaxed theme-text-primary">Listed under the 1971 Convention.</p><p class="text-sm leading-relaxed theme-text-primary">No WHO review.</p></div></section><section class="space-y-4 mt-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary font-semibold normal-case tracking-normal">By Country</h3></div></div><div class="flex w-full gap-4"><div style="width: 50%;" class="flex min-w-0 flex-1 flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="United States flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/us.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">United States</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><div class="theme-text-secondary mt-1 whitespace-pre-line text-sm leading-relaxed theme-text-muted">Federally prohibited.</div><div class="mt-4 pt-4"><div class="theme-horizontal-divider mb-3"></div><div class="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">By state</div><div class="mb-4 min-w-0 break-words text-sm leading-relaxed theme-text-muted" data-testid="us-states-summary">State law varies considerably.</div><div class="space-y-3"><div class="min-w-0"><div class="flex min-w-0 flex-wrap items-center gap-1.5"><img alt="Florida flag" width="24" height="16" class="h-4 w-6 shrink-0 overflow-hidden rounded-sm object-cover object-center" src="/flags/us/florida.svg"><span class="shrink-0 text-xs font-medium theme-text-primary">Florida</span><div class="flex min-w-0 flex-wrap items-center gap-1.5"><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-1.5 py-px text-[9px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><button type="button" aria-controls="_r_0_" aria-expanded="false" aria-label="Show details for Florida" class="theme-control-pill-faint ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"></button></div></div></div></div></div><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="Portugal flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/pt.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">Portugal</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-evidence-surface" data-badge-tone="green">Decriminalized</span></div></div></div><div style="width: 50%;" class="flex min-w-0 flex-1 flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="Germany flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/de.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">Germany</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><div class="theme-text-secondary mt-1 whitespace-pre-line text-sm leading-relaxed theme-text-muted">Anlage I BtMG.</div></div></div></div></section></section>"`);
  });

  it("renders expanded US state and city rows without any editing markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<LegalitySection article={legalityArticle} />);
    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));
    await user.click(screen.getByRole("button", { name: "Show details for Miami" }));
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="legality" class="space-y-6 pt-12 scroll-mt-6"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">Legality</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><section class="space-y-4 mb-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary font-semibold normal-case tracking-normal">International</h3></div></div><div class="space-y-2"><p class="text-sm leading-relaxed theme-text-primary">Listed under the 1971 Convention.</p><p class="text-sm leading-relaxed theme-text-primary">No WHO review.</p></div></section><section class="space-y-4 mt-4"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary font-semibold normal-case tracking-normal">By Country</h3></div></div><div class="flex w-full gap-4"><div style="width: 50%;" class="flex min-w-0 flex-1 flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="United States flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/us.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">United States</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><div class="theme-text-secondary mt-1 whitespace-pre-line text-sm leading-relaxed theme-text-muted">Federally prohibited.</div><div class="mt-4 pt-4"><div class="theme-horizontal-divider mb-3"></div><div class="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">By state</div><div class="mb-4 min-w-0 break-words text-sm leading-relaxed theme-text-muted" data-testid="us-states-summary">State law varies considerably.</div><div class="space-y-3"><div class="min-w-0"><div class="flex min-w-0 flex-wrap items-center gap-1.5"><img alt="Florida flag" width="24" height="16" class="h-4 w-6 shrink-0 overflow-hidden rounded-sm object-cover object-center" src="/flags/us/florida.svg"><span class="shrink-0 text-xs font-medium theme-text-primary">Florida</span><div class="flex min-w-0 flex-wrap items-center gap-1.5"><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-1.5 py-px text-[9px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><button type="button" aria-controls="_r_1_" aria-expanded="true" aria-label="Hide details for Florida" class="theme-control-pill-faint ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"></button></div><div id="_r_1_" class="mt-2 min-w-0"><div class="theme-text-secondary mt-1 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed theme-text-muted">State ban.</div><div class="mt-3 space-y-3 border-l border-dose-border-subtle pl-2" data-testid="legality-city-list"><div class="min-w-0 pl-4"><div class="flex min-w-0 flex-wrap items-center gap-1.5"><span class="shrink-0 text-xs font-medium theme-text-primary">Miami</span><div class="flex min-w-0 flex-wrap items-center gap-1.5"><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-1.5 py-px text-[9px] font-medium theme-evidence-surface" data-badge-tone="green">Decriminalized</span></div><button type="button" aria-controls="_r_2_" aria-expanded="true" aria-label="Hide details for Miami" class="theme-control-pill-faint ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"></button></div><div id="_r_2_" class="mt-2 min-w-0"><div class="theme-text-secondary mt-1 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed theme-text-muted">City ordinance.</div></div></div></div></div></div></div></div></div><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="Portugal flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/pt.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">Portugal</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-evidence-surface" data-badge-tone="green">Decriminalized</span></div></div></div><div style="width: 50%;" class="flex min-w-0 flex-1 flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-nested p-3 theme-public-card-hover-quiet relative min-w-0"><img alt="Germany flag" loading="lazy" width="24" height="24" decoding="async" data-nimg="1" class="theme-country-flag absolute right-3 top-3 h-6 w-6" style="color: transparent;" src="/flags/de.svg"><div class="flex flex-wrap items-center gap-2 pr-8"><span class="min-w-0 break-words font-medium theme-text-primary">Germany</span><span class="theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium theme-semantic-danger-badge" data-badge-tone="red">Illegal</span></div><div class="theme-text-secondary mt-1 whitespace-pre-line text-sm leading-relaxed theme-text-muted">Anlage I BtMG.</div></div></div></div></section></section>"`);
  });

  it("renders collapsed history & culture without any editing markup", () => {
    const { container } = render(<HistoryCultureSection article={historyArticle} />);
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="history-culture" class="space-y-6 pt-12 scroll-mt-6"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">History &amp; Culture</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. </p><div class="space-y-8"><section class="theme-section-group-divider"><div><h3 class="mb-3 flex items-center gap-2 font-semibold text-dose-text">Origins</h3><div class="relative"><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first</p></div></div></section></div><div class="flex justify-center theme-article-section-adornment mt-4 -mb-8"><button type="button" aria-expanded="false" aria-label="Expand history and culture" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"><span aria-hidden="true" data-expand-indicator="" class="inline-flex items-center gap-0.5"></span></button></div></section>"`);
  });

  it("renders expanded history & culture without any editing markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<HistoryCultureSection article={historyArticle} />);
    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="history-culture" class="space-y-6 pt-12 scroll-mt-6"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">History &amp; Culture</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. </p><div class="space-y-8"><section class="theme-section-group-divider"><div><h3 class="mb-3 flex items-center gap-2 font-semibold text-dose-text">Origins</h3><div class="relative"><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. The first documented use dates to <strong class="font-semibold text-dose-accent">1927</strong>. </p></div><div class="flex flex-col gap-3 mt-4 pl-4"><div><h4 class="mb-1 font-medium text-dose-text-secondary">Early Reports</h4><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">An early report.</p></div></div></div></section><section class="theme-section-group-divider"><div><h3 class="mb-3 flex items-center gap-2 font-semibold text-dose-text">Modern Era</h3><div class="relative"><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">Rediscovered in <strong class="font-semibold text-dose-accent">1976</strong>.</p></div></div></section></div><div class="flex justify-center theme-article-section-adornment mt-4 -mb-8"><button type="button" aria-expanded="true" aria-label="Collapse history and culture" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"><span aria-hidden="true" data-expand-indicator="" class="inline-flex items-center gap-0.5"></span></button></div></section>"`);
  });

  it("renders freeform history & culture without any editing markup", () => {
    const { container } = render(<HistoryCultureSection article={freeformHistoryArticle} />);
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section id="history-culture" class="space-y-6 pt-12 scroll-mt-6"><div class="flex items-center gap-4"><div class="relative shrink-0"><h2 class="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-[var(--theme-section-heading)] whitespace-nowrap sm:text-3xl">History &amp; Culture</h2></div><div class="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]"></div></div><p class="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on haemostatic agents. Synthesised in <strong class="font-semibold text-dose-accent">1912</strong> by chemists working on…</p><div class="flex justify-center theme-article-section-adornment mt-4 -mb-8"><button type="button" aria-expanded="false" aria-label="Expand history and culture" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"><span aria-hidden="true" data-expand-indicator="" class="inline-flex items-center gap-0.5"></span></button></div></section>"`);
  });

  it("renders harm potential without any editing markup", () => {
    const harm = normalized(modernHarmArticle);
    const { container } = render(
      <>
        <AddictionSubsection addiction={harm.addiction} article={modernHarmArticle} />
        <PsychosisRiskSubsection risks={harm.risks} article={modernHarmArticle} />
        <SeizureRiskSubsection risks={harm.risks} article={modernHarmArticle} />
        <ToxicitySubsection toxicity={harm.toxicity} article={modernHarmArticle} />
      </>,
    );
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Addiction &amp; Dependence</h3></div></div><div class="space-y-4"><section class="pl-5 pt-5 first:pt-0 sm:pl-6"><div class="mb-2.5 flex items-center justify-between gap-3"><h4 class="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">Psychological</h4><span class="theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium theme-semantic-caution-badge" data-badge-tone="yellow">Moderate</span></div><p class="theme-text-secondary theme-text-muted mb-3 text-xs italic leading-relaxed">Psychological reliance is common.</p></section><section class="pl-5 pt-5 first:pt-0 sm:pl-6"><div class="mb-2.5 flex items-center justify-between gap-3"><h4 class="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">Physical</h4><span class="theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium theme-evidence-surface" data-badge-tone="green">Low</span></div><p class="theme-text-secondary theme-text-muted mb-3 text-xs italic leading-relaxed">Physical dependence is rare.</p></section></div></section><section class="theme-section-group-divider space-y-4"><div class="flex items-center gap-2 justify-between"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Psychosis Risk</h3></div><span class="theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium theme-evidence-surface" data-badge-tone="green">Low</span></div><p class="text-sm leading-relaxed theme-text-secondary">Psychosis risk is low.</p></section><section class="theme-section-group-divider space-y-4"><div class="flex items-center gap-2 justify-between"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Seizure Risk</h3></div><span class="theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium theme-evidence-surface" data-badge-tone="green">Low</span></div><p class="text-sm leading-relaxed theme-text-secondary">Seizure risk is low.</p></section><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Toxicity</h3></div></div><div class="flex flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 p-4 flex flex-col gap-2.5 break-inside-avoid" data-tone="neutral"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Lethal Dosage</span></span></div><div class="theme-text-primary text-sm leading-relaxed space-y-3"><p>No reliable human LD50 exists.</p></div></div><div class="-mb-4 grid grid-cols-1 items-start gap-x-4 md:grid-cols-2"><div class="rounded-xl border theme-article-subsection-card-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 p-4 flex flex-col gap-2.5 mb-4" data-tone="neutral"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Hepatic</span></span></div><div class="theme-text-primary text-sm leading-relaxed space-y-3"><p>Elevated transaminases.</p><div class="mt-3 flex justify-start"><button type="button" aria-expanded="false" aria-label="Expand section" class="relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] before:absolute before:inset-[-0.5rem] before:content-[''] before:pointer-events-auto [@media(pointer:fine)]:before:inset-0 theme-control-pill-quiet inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs"><span aria-hidden="true" data-expand-indicator="" class="inline-flex items-center gap-0.5"></span></button></div></div></div></div></div></section>"`);
  });

  it("renders legacy harm potential without any editing markup", () => {
    const harm = normalized(legacyHarmArticle);
    const { container } = render(
      <>
        <AddictionSubsection addiction={harm.addiction} article={legacyHarmArticle} />
        <PsychosisRiskSubsection risks={harm.risks} article={legacyHarmArticle} />
        <SeizureRiskSubsection risks={harm.risks} article={legacyHarmArticle} />
        <ToxicitySubsection toxicity={harm.toxicity} article={legacyHarmArticle} />
      </>,
    );
    expect(editablePaths(container)).toEqual([]);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Addiction &amp; Dependence</h3></div></div><div class="space-y-4"><section class="pl-5 pt-5 first:pt-0 sm:pl-6"><div class="mb-2.5 flex items-center justify-between gap-3"><h4 class="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">Psychological</h4></div><p class="theme-text-secondary theme-text-muted mb-3 text-xs italic leading-relaxed">Legacy addiction liability text.</p></section><section class="pl-5 pt-5 first:pt-0 sm:pl-6"><div class="mb-2.5 flex items-center justify-between gap-3"><h4 class="theme-text-secondary flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">Physical</h4></div><p class="theme-text-secondary theme-text-muted mb-3 text-xs italic leading-relaxed">Legacy dependence liability text.</p></section></div></section><section class="theme-section-group-divider space-y-4"><div class="flex items-center gap-2 justify-between"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Psychosis Risk</h3></div></div><p class="text-sm leading-relaxed theme-text-secondary">Legacy psychosis text.</p></section><section class="theme-section-group-divider space-y-4"><div class="flex items-center gap-2 justify-between"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Seizure Risk</h3></div></div><p class="text-sm leading-relaxed theme-text-secondary">Legacy seizure text.</p></section><section class="space-y-6 theme-section-group-divider"><div class="flex items-center gap-2"><div class="flex min-w-0 items-center gap-2"><h3 class="theme-text-primary text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8">Toxicity</h3></div></div><div class="flex flex-col gap-4"><div class="rounded-xl border theme-article-subsection-card-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 p-4 flex flex-col gap-2.5 break-inside-avoid" data-tone="neutral"><div class="flex min-w-0 items-center justify-between gap-3"><span class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide theme-text-primary"><span class="min-w-0 truncate">Lethal Dosage</span></span></div><div class="theme-text-primary text-sm leading-relaxed space-y-3"><p>Legacy LD50 string.</p></div></div></div></section>"`);
  });
});

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

describe("legality inline editing", () => {
  it("addresses every wired field by an encoded path", () => {
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);

    expect(editablePaths(container)).toEqual([
      "legality.international[0]",
      "legality.international[1]",
      // "United States" cannot be spelled literally inside a path.
      "legality.countries.United%20States.notes",
      "legality.usStatesNote",
      // Portugal has no note at all; the slot is how one gets written.
      "legality.countries.Portugal.notes",
      "legality.countries.Germany.notes",
    ]);
  });

  it("addresses state and city notes once their rows are open", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);

    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));
    await user.click(screen.getByRole("button", { name: "Show details for Miami" }));

    expect(editablePaths(container)).toContain("legality.usStates.Florida.notes");
    expect(editablePaths(container)).toContain(
      "legality.usStates.Florida.cities.Miami.notes",
    );
  });

  it("leaves every status badge read-only", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);
    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));

    // The badge shows "Illegal", a label derived from `canonicalStatus`. Wiring
    // it would write that label into the stored status.
    expect(screen.getAllByText("Illegal").length).toBeGreaterThan(0);
    for (const path of editablePaths(container)) {
      expect(path).not.toMatch(/status$/i);
    }
  });

  it("commits a country note through its encoded path", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<LegalitySection article={legalityArticle} />, commit);

    await user.click(screen.getByRole("button", { name: "Edit Germany legality notes" }));
    const field = screen.getByRole("textbox", { name: "Edit Germany legality notes" });
    expect(field).toHaveValue("Anlage I BtMG.");
    await user.clear(field);
    await user.type(field, "Anlage II BtMG.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "legality.countries.Germany.notes",
      "Anlage II BtMG.",
      "Anlage I BtMG.",
    );
  });
});

// ---------------------------------------------------------------------------
// Harm potential: the identity gate
// ---------------------------------------------------------------------------

describe("harm potential inline editing", () => {
  it("wires every canonical field on a modern article", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(harmPotentialTree(modernHarmArticle));

    expect(editablePaths(container)).toEqual([
      "harm_potential.addiction.psychological.description",
      "harm_potential.addiction.physical_dependence.description",
      "harm_potential.psychosis.description",
      "harm_potential.seizure.description",
      "harm_potential.toxicity.lethal_dosage.notes",
      "harm_potential.toxicity.organ_toxicity[0].findings",
    ]);

    // Mechanism and notes only exist once the organ card is open.
    await user.click(screen.getByRole("button", { name: "Expand section" }));
    expect(editablePaths(container)).toContain(
      "harm_potential.toxicity.organ_toxicity[0].mechanism",
    );
    expect(editablePaths(container)).toContain(
      "harm_potential.toxicity.organ_toxicity[0].notes",
    );
  });

  it("renders plain text when the normalized value is not what the canonical path holds", () => {
    const { container } = withProvider(harmPotentialTree(legacyHarmArticle));

    // Every string on screen was synthesised by the normalizer from a legacy
    // key. None of it may be offered as an edit to the canonical path.
    expect(editablePaths(container)).toEqual([]);
    expect(screen.getByText("Legacy addiction liability text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy dependence liability text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy psychosis text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy seizure text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy LD50 string.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
  });

  it("gates each field independently", () => {
    // One description that the article stores at its canonical path beside one
    // the normalizer produced from somewhere else. Only the first is editable,
    // so a half-migrated article is not all-or-nothing.
    const drifted: NormalizedHarmPotential["addiction"] = {
      psychological: { level: null, description: "Text that is stored nowhere." },
      physical_dependence: { level: null, description: "Physical dependence is rare." },
    };

    const { container } = withProvider(
      <AddictionSubsection addiction={drifted} article={modernHarmArticle} />,
    );

    expect(editablePaths(container)).toEqual([
      "harm_potential.addiction.physical_dependence.description",
    ]);
    expect(screen.getByText("Text that is stored nowhere.")).toBeInTheDocument();
  });

  it("commits a canonical description", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(harmPotentialTree(modernHarmArticle), commit);

    await user.click(
      screen.getByRole("button", { name: "Edit Psychosis risk description" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Edit Psychosis risk description" }),
      " Reports are sparse.{Enter}",
    );

    expect(commit).toHaveBeenCalledWith(
      "harm_potential.psychosis.description",
      "Psychosis risk is low. Reports are sparse.",
      "Psychosis risk is low.",
    );
  });
});

// ---------------------------------------------------------------------------
// History & culture
// ---------------------------------------------------------------------------

describe("history & culture inline editing", () => {
  it("addresses sections by their stored index, not their rendered position", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<HistoryCultureSection article={historyArticle} />);
    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));

    // The fixture's stored section 0 is empty and filtered out, so "Origins"
    // renders first while living at index 1.
    expect(editablePaths(container)).toEqual([
      "history_culture.content",
      "history_culture.sections[1].content",
      "history_culture.sections[1].subsections[0].content",
      "history_culture.sections[2].content",
    ]);
  });

  it("does not offer an editor for truncated section content", () => {
    const { container } = withProvider(<HistoryCultureSection article={historyArticle} />);

    // Collapsed: the overview renders whole and is editable; the first
    // section's content is a mid-word preview and is not.
    expect(editablePaths(container)).toEqual(["history_culture.content"]);
  });

  it("does not offer an editor for truncated freeform content", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(
      <HistoryCultureSection article={freeformHistoryArticle} />,
    );
    expect(editablePaths(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    expect(editablePaths(container)).toEqual(["history_culture.content"]);
  });

  it("seeds the freeform editor from the raw field rather than the preview", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<HistoryCultureSection article={freeformHistoryArticle} />, commit);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(
      screen.getByRole("button", { name: "Edit History & culture overview" }),
    );

    const field = screen.getByRole("textbox", { name: "Edit History & culture overview" });
    expect(field).toHaveValue(freeformHistoryArticle.history_culture!.content);
    expect(field).not.toHaveValue(expect.stringContaining("…"));
  });

  it("commits a section body to its stored index", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<HistoryCultureSection article={historyArticle} />, commit);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(screen.getByRole("button", { name: "Edit Modern Era history content" }));
    const field = screen.getByRole("textbox", { name: "Edit Modern Era history content" });
    await user.clear(field);
    await user.type(field, "Rediscovered in 1977.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "history_culture.sections[2].content",
      "Rediscovered in 1977.",
      "Rediscovered in 1976.",
    );
  });
});
