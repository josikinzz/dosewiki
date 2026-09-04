import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";
import { HarmPotentialSection } from "./HarmPotentialSection";
import { HistoryCultureSection } from "./HistoryCultureSection";
import { LegalitySection } from "./LegalitySection";
import { ToleranceSection } from "./ToleranceSection";

describe("public citation markers across pilot sections", () => {
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

  it("surfaces pilot prose citations publicly without leaking raw cite tokens", async () => {
    const user = userEvent.setup();
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

    // The legality note sits behind the country row disclosure.
    await user.click(screen.getByRole("button", { name: "Show details for United States" }));
    expect(screen.getByRole("link", { name: "Citation 6" })).toBeInTheDocument();
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
});
