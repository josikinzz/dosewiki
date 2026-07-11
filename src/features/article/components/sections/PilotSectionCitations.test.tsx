import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";
import { HarmPotentialSection } from "./HarmPotentialSection";
import { HistoryCultureSection } from "./HistoryCultureSection";
import { getInstrumentShorthand, LegalitySection } from "./LegalitySection";
import { PharmacologySection } from "./PharmacologySection";
import { ToleranceSection } from "./ToleranceSection";

describe("pilot section public citations", () => {
  it("renders dosage and duration route reference markers in numbered order", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "dosage-ref", type: "webpage" as const, title: "Dosage Ref", authors: [], url: "https://example.test/dosage", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "duration-ref", type: "webpage" as const, title: "Duration Ref", authors: [], url: "https://example.test/duration", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      dosage: {
        ...createEmptyArticle().dosage,
        routes: [
          {
            route: "oral",
            reference_ids: ["dosage-ref"],
            bioavailability: "",
            bioavailability_notes: "",
            dose_ranges: {
              threshold: { min: 5, max: 5, unit: "mg" },
              light: { min: 10, max: 15, unit: "mg" },
              moderate: { min: 15, max: 20, unit: "mg" },
              strong: { min: 20, max: 25, unit: "mg" },
              heavy: { min: 25, max: null, unit: "mg" },
            },
            notes: "",
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "oral",
            reference_ids: ["duration-ref"],
            half_life: "",
            half_life_notes: "",
            stages: {
              onset: { min: 20, max: 40, unit: "minutes" },
              come_up: { min: 30, max: 45, unit: "minutes" },
              peak: { min: 2, max: 4, unit: "hours" },
              offset: { min: 1, max: 2, unit: "hours" },
              total_duration: { min: 4, max: 8, unit: "hours" },
              after_effects: { min: 1, max: 2, unit: "hours" },
            },
          },
        ],
      },
    } as SubstanceArticle;

    render(<DosageDurationSection article={article} />);

    const firstMarker = screen.getByRole("link", { name: "Citation 1" });
    expect(firstMarker).toBeInTheDocument();
    expect(firstMarker).toHaveClass("theme-citation-marker", "no-underline", "tabular-nums");
    expect(firstMarker).not.toHaveClass("underline");
    expect(screen.getByRole("link", { name: "Citation 2" })).toBeInTheDocument();
  });

  it("surfaces pilot prose citations publicly without leaking raw cite tokens", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "tolerance-ref", type: "webpage" as const, title: "Tolerance Ref", authors: [], url: "https://example.test/tolerance", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "harm-ref", type: "webpage" as const, title: "Harm Ref", authors: [], url: "https://example.test/harm", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "seizure-ref", type: "webpage" as const, title: "Seizure Ref", authors: [], url: "https://example.test/seizure", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "toxicity-ref", type: "webpage" as const, title: "Toxicity Ref", authors: [], url: "https://example.test/toxicity", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "history-ref", type: "webpage" as const, title: "History Ref", authors: [], url: "https://example.test/history", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "legal-ref", type: "webpage" as const, title: "Legal Ref", authors: [], url: "https://example.test/legal", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      tolerance: {
        ...createEmptyArticle().tolerance,
        full_tolerance: "Builds quickly [cite:tolerance-ref].",
      },
      harm_potential: {
        summary: "Risk summary [cite:harm-ref].",
        seizure: {
          level: null,
          description: "Seizure detail [cite:seizure-ref].",
        },
        toxicity: {
          organ_toxicity: [
            {
              system: "Cardiovascular",
              findings: "Toxicity finding [cite:toxicity-ref].",
              mechanism: "",
              notes: "",
            },
          ],
        },
      },
      history_culture: {
        content: "Intro history [cite:history-ref].",
        sections: [
          {
            heading: "Modern era",
            content: "Additional context.",
            subsections: [],
          },
        ],
      },
      legality: {
        international: [],
        countries: {
          "United States": {
            status: "Schedule I",
            notes: "Federal control [cite:legal-ref].",
          },
        },
      },
    } as SubstanceArticle;

    render(
      <>
        <ToleranceSection article={article} />
        <HarmPotentialSection article={article} />
        <HistoryCultureSection article={article} />
        <LegalitySection article={article} />
      </>,
    );

    expect(screen.getByText(/Builds quickly/)).toBeInTheDocument();
    expect(screen.getByText(/Risk summary/)).toBeInTheDocument();
    expect(screen.getByText(/Seizure detail/)).toBeInTheDocument();
    expect(screen.getByText(/Toxicity finding/)).toBeInTheDocument();
    expect(screen.getByText(/Intro history/)).toBeInTheDocument();
    expect(screen.getByText(/Federal control/)).toBeInTheDocument();
    expect(screen.queryByText(/\[cite:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 4" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 6" })).toBeInTheDocument();
  });

  it("renders canonical legality category and designation badges while preserving legacy badges", () => {
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: {
          Netherlands: {
            status: "Schedule III, Controlled Drugs and Substances Act (CDSA)",
            canonicalStatus: "prohibited",
            instrument: "Schedule III, Controlled Drugs and Substances Act (CDSA)",
            notes: "Prohibited under national law.",
          },
          "United States": {
            status: "Schedule I",
            notes: "Federal control.",
          },
        },
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    const canonicalBadge = screen.getByText("Illegal");
    expect(canonicalBadge).toHaveClass("theme-semantic-danger-badge");
    expect(canonicalBadge).toHaveAttribute("data-badge-tone", "red");
    const designationBadge = screen.getByText("Schedule III");
    expect(designationBadge).toHaveAttribute("data-badge-tone", "gray");
    expect(designationBadge).toHaveClass("font-mono");
    expect(screen.getByTestId("legality-instrument-citation")).toHaveTextContent(
      "Schedule III, Controlled Drugs and Substances Act (CDSA)",
    );

    const legacyBadge = screen.getByText("Schedule I");
    expect(legacyBadge).toHaveClass("theme-semantic-danger-badge");
    expect(legacyBadge).toHaveAttribute("data-badge-tone", "red");
  });

  it("omits the canonical citation line when the designation contains the full instrument", () => {
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: {
          Canada: {
            status: "Schedule I",
            canonicalStatus: "prohibited",
            instrument: "Schedule I",
            notes: "Federal control.",
          },
        },
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    expect(screen.getByText("Schedule I")).toHaveAttribute("data-badge-tone", "gray");
    expect(screen.queryByTestId("legality-instrument-citation")).not.toBeInTheDocument();
  });

  it.each([
    ["List I, Opiumwet (Netherlands)", "List I"],
    ["Schedule III, Controlled Drugs and Substances Act (CDSA)", "Schedule III"],
    [
      "Nařízení vlády No. 463/2013 Sb., List No. 5 of psychotropic substances; Supreme Court opinion Tpjn 301/2013",
      "Nařízení vlády No. 463/2013 Sb.",
    ],
  ])("derives %s as the legality designation %s", (instrument, shorthand) => {
    expect(getInstrumentShorthand(instrument)).toBe(shorthand);
  });

  it("attaches prose citation markers without preserving source-token spacing", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "summary-ref", type: "webpage" as const, title: "Summary Ref", authors: [], url: "https://example.test/summary", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      harm_potential: {
        summary: "Risk summary. [cite:summary-ref]",
      },
    } as SubstanceArticle;

    const { container } = render(<HarmPotentialSection article={article} />);

    expect(container.textContent).toContain("Risk summary.1");
    expect(container.textContent).not.toContain("Risk summary. 1");
  });

  it("renders receptor profile citation markers without leaking tokens", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "receptor-ref", type: "webpage" as const, title: "Receptor Ref", authors: [], url: "https://example.test/receptor", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        receptor_profile: [
          {
            receptor: "GABA-A receptor",
            tag: "GABA-A receptor positive allosteric modulator (benzodiazepine site)[cite:receptor-ref]",
            affinity: "",
            efficacy: "",
          },
        ],
      },
    } as SubstanceArticle;

    // No pharmacodynamics intro text, so the receptor card is expanded by default.
    const { container } = render(<PharmacologySection article={article} />);

    expect(
      screen.getByText("GABA-A receptor positive allosteric modulator"),
    ).toBeInTheDocument();
    expect(screen.getByText("benzodiazepine site")).toBeInTheDocument();
    const citation = screen.getByRole("link", { name: "Citation 1" });
    expect(citation).toHaveAttribute("data-reference-id", "receptor-ref");
    expect(citation).toHaveClass("theme-citation-marker");
    expect(container.innerHTML).not.toContain("[cite:");
  });

  it("expands the receptor affinities card by default when there is no pharmacodynamics intro text", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "",
        summary: "",
        receptor_profile: [
          { receptor: "5-HT2A receptor", tag: "agonist", affinity: "", efficacy: "" },
        ],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // No intro text above the table, so it opens expanded with the entry visible.
    expect(screen.getByText("agonist")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand receptor affinities" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse receptor affinities" }),
    ).toBeInTheDocument();
  });

  it("collapses the receptor affinities card by default when pharmacodynamics intro text is present", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "This substance acts on serotonin receptors.",
        receptor_profile: [
          { receptor: "5-HT2A receptor", tag: "agonist", affinity: "", efficacy: "" },
        ],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // Intro text exists above the table, so the table stays collapsed.
    expect(screen.queryByText("agonist")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand receptor affinities" }),
    ).toBeInTheDocument();
  });

  it("expands the metabolites card by default when there is no pharmacokinetics intro text", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacokinetics: "",
        metabolites: ["Norketamine (active)"],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // No intro text above the table, so it opens expanded with the metabolite visible.
    expect(screen.getByText("Norketamine")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand metabolites" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse metabolites" }),
    ).toBeInTheDocument();
  });

  it("collapses the metabolites card by default when pharmacokinetics intro text is present", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacokinetics: "Metabolized primarily in the liver.",
        metabolites: ["Norketamine (active)"],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // Intro text exists above the table, so the table stays collapsed.
    expect(screen.queryByText("Norketamine")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand metabolites" }),
    ).toBeInTheDocument();
  });

  it("shows more legality card text before requiring expansion", () => {
    const longNote = `Long legality note. ${"Manufacture, possession, sale, or use remains restricted except for approved medical or scientific research. ".repeat(6)}`;
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: {
          Australia: {
            status: "Schedule 9",
            notes: longNote,
          },
        },
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    const content = screen.getByText(/Long legality note/);
    expect(content.getAttribute("style")).toContain("-webkit-line-clamp: 6");
    expect(
      screen.getByRole("button", { name: "Expand Australia legality notes" }),
    ).toBeInTheDocument();
  });
});
