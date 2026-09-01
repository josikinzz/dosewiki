import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";
import { HarmPotentialSection } from "./HarmPotentialSection";
import { HistoryCultureSection } from "./HistoryCultureSection";
import {
  LegalitySection,
  orderCountryLegalityEntries,
} from "./LegalitySection";
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

  it("keeps the designation out of the row and quotes the law on expand", async () => {
    const user = userEvent.setup();
    const article = {
      ...createEmptyArticle(),
      references: [
        {
          id: "designation-ref",
          type: "webpage" as const,
          title: "Designation Ref",
          authors: [],
          url: "https://example.test/designation",
          sourceType: "unknown" as const,
          quality: "fallback" as const,
        },
      ],
      legality: {
        international: [],
        countries: {
          Netherlands: {
            status: "Schedule III",
            canonicalStatus: "prohibited",
            instrument: "Controlled Drugs and Substances Act (CDSA), Schedule III",
            designation: "Schedule III (CDSA)[cite:designation-ref]",
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

    // Status renders as tone-colored text, not a pill; the tone group header
    // repeats the word "Illegal", so resolve the status line by its tone attr.
    const canonicalBadge = screen
      .getAllByText("Illegal")
      .map((el) => el.closest("[data-badge-tone]"))
      .find(Boolean) as HTMLElement;
    expect(canonicalBadge).toHaveAttribute("data-badge-tone", "red");
    expect(canonicalBadge).toHaveClass("uppercase");
    // The statutory designation never renders in the collapsed row; the full
    // instrument appears as the quote-styled law line once the row expands.
    expect(screen.queryByText("Schedule III (CDSA)")).not.toBeInTheDocument();
    expect(screen.getByTestId("legality-instrument-citation")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show details for Netherlands" }));

    const lawLine = screen.getByTestId("legality-instrument-citation");
    expect(lawLine).toBeVisible();
    expect(lawLine).toHaveTextContent(
      "Controlled Drugs and Substances Act (CDSA), Schedule III",
    );
    expect(lawLine).toHaveClass("italic", "border-l");

    const legacyBadge = screen.getByText("Schedule I").closest("[data-badge-tone]");
    expect(legacyBadge).toHaveAttribute("data-badge-tone", "red");
  });

  it("renders canonical and legacy unscheduled statuses as neutral badges", () => {
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: {
          Canada: {
            status: "Not scheduled",
            notes: "No affirmative legality determination.",
          },
          France: {
            status: "Unscheduled (grey area)",
            canonicalStatus: "unscheduled",
            notes: "No affirmative legality determination.",
          },
        },
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    // The tone group header also says "Not scheduled"; only the status lines
    // carry the tone attribute.
    const statusLines = screen
      .getAllByText("Not scheduled")
      .map((el) => el.closest("[data-badge-tone]"))
      .filter((el): el is HTMLElement => el !== null);
    expect(statusLines.length).toBeGreaterThan(0);
    for (const badge of statusLines) {
      expect(badge).toHaveAttribute("data-badge-tone", "gray");
      expect(badge).toHaveClass("theme-status-text");
    }
  });

  it("quotes the instrument on expand even when it matches the derived designation", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "Show details for Canada" }));

    expect(screen.getByTestId("legality-instrument-citation")).toHaveTextContent("Schedule I");
  });

  it("places the United States first and keeps the remaining country cards alphabetical", () => {
    const unorderedCountries: [string, { status: string; notes: string }][] = [
      ["Canada", { status: "Schedule I", notes: "" }],
      ["United States", { status: "Schedule I", notes: "" }],
      ["Australia", { status: "Schedule I", notes: "" }],
    ];
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: Object.fromEntries(unorderedCountries),
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    expect(orderCountryLegalityEntries(unorderedCountries).map(([name]) => name)).toEqual([
      "United States",
      "Australia",
      "Canada",
    ]);
    const toggles = screen.getAllByRole("button", { name: /^Show details for / });
    expect(toggles.map((toggle) => toggle.getAttribute("aria-label"))).toEqual([
      "Show details for United States",
      "Show details for Australia",
      "Show details for Canada",
    ]);
  });

  it("renders US state legality in the United States country-card footer", async () => {
    const user = userEvent.setup();
    const article = {
      ...createEmptyArticle(),
      legality: {
        international: [],
        countries: {
          "United States": {
            status: "Schedule I",
            notes: "Federal control.",
            canonicalStatus: "prohibited",
            instrument: "Controlled Substances Act",
            designation: "Schedule I",
          },
          Canada: {
            status: "Schedule I",
            notes: "Federal control.",
          },
        },
        usStatesNote: "The remaining states follow federal Schedule I controls.",
        usStates: {
          Colorado: {
            status: "Decriminalized",
            notes: "Colorado decriminalizes limited possession.",
            canonicalStatus: "decriminalized",
            instrument: "Colorado Revised Statutes",
            designation: "Decriminalized",
            cities: {
              Denver: {
                status: "Lowest enforcement priority",
                notes: "Denver treats enforcement as a low priority.",
                canonicalStatus: "decriminalized",
                instrument: "Denver Municipal Code",
                designation: "Lowest priority",
              },
            },
          },
        },
      },
    } as SubstanceArticle;

    render(<LegalitySection article={article} />);

    expect(screen.queryByTestId("us-states-subsection")).not.toBeInTheDocument();
    expect(screen.getByTestId("us-states-summary")).toHaveTextContent("The remaining states follow federal Schedule I controls.");
    expect(screen.getByTestId("us-states-summary")).toHaveClass("mb-4", "text-sm", "leading-relaxed");
    const usStatus = screen
      .getAllByText("Illegal")
      .map((el) => el.closest("[data-badge-tone]"))
      .find(Boolean) as HTMLElement;
    expect(usStatus).toHaveClass("text-[10px]");

    // Country details, including the By state footer, sit behind the row
    // disclosure but stay in the DOM so find-in-page still matches them.
    const usToggle = screen.getByRole("button", { name: "Show details for United States" });
    expect(usToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("By state")).not.toBeVisible();

    await user.click(usToggle);

    expect(usToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("By state")).toHaveClass("text-[11px]");
    for (const note of screen.getAllByText("Federal control.")) {
      expect(note).toHaveClass("text-sm", "leading-relaxed");
    }
    const coloradoFlag = screen.getByAltText("Colorado flag");
    expect(coloradoFlag).toHaveAttribute("src", expect.stringContaining("/flags/us/colorado.svg"));
    expect(coloradoFlag).toHaveClass("h-4", "w-6", "overflow-hidden", "rounded-sm", "object-cover", "object-center");
    expect(coloradoFlag).not.toHaveClass("theme-country-flag");
    expect(screen.getByText("Colorado")).toBeVisible();
    expect(screen.getByText("Colorado decriminalizes limited possession.")).not.toBeVisible();
    expect(screen.getByText("Denver")).not.toBeVisible();
    const coloradoDetails = screen.getByRole("button", { name: "Show details for Colorado" });
    expect(coloradoDetails).toHaveAttribute("aria-expanded", "false");

    await user.click(coloradoDetails);

    expect(coloradoDetails).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Colorado decriminalizes limited possession.")).toHaveClass("text-sm", "leading-relaxed");
    expect(screen.getByText("Denver")).toBeInTheDocument();
    expect(screen.getByTestId("legality-city-list")).toHaveTextContent("Denver");
    expect(screen.getByRole("button", { name: "Show details for Denver" })).toHaveAttribute("aria-expanded", "false");
    for (const badge of screen.getAllByText("Decriminalized")) {
      expect(badge.closest("[data-badge-tone]")).toHaveAttribute("data-badge-tone", "green");
    }
    expect(screen.getAllByText("United States")).toHaveLength(1);
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
        binding_sites: [
          {
            target: "GABA-A receptor",
            tag: "GABA-A receptor positive allosteric modulator (benzodiazepine site)[cite:receptor-ref]",
            affinity: "",
            efficacy: "",
          },
        ],
      },
    } as SubstanceArticle;

    // No pharmacodynamics intro text, so the receptor card is expanded by default.
    const { container } = render(<PharmacologySection article={article} />);

    // The label splits so the marker can sit with the binding site rather than
    // trailing the activity phrase.
    expect(screen.getByText("GABA-A receptor")).toBeInTheDocument();
    expect(screen.getByText("positive allosteric modulator")).toBeInTheDocument();
    expect(screen.getByText("benzodiazepine site")).toBeInTheDocument();
    const citation = screen.getByRole("link", { name: "Citation 1" });
    expect(citation).toHaveAttribute("data-reference-id", "receptor-ref");
    expect(citation).toHaveClass("theme-citation-marker");
    expect(container.innerHTML).not.toContain("[cite:");
  });

  it("renders receptor affinity and efficacy citations as numbered markers instead of raw tokens", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "affinity-ref", type: "webpage" as const, title: "Affinity Ref", authors: [], url: "https://example.test/affinity", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "efficacy-ref", type: "webpage" as const, title: "Efficacy Ref", authors: [], url: "https://example.test/efficacy", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "",
        summary: "",
        binding_sites: [
          {
            target: "D1 receptor",
            tag: "",
            affinity: "Lower affinity[cite:affinity-ref]",
            efficacy: "",
          },
          {
            target: "D2 receptor",
            tag: "",
            affinity: "",
            efficacy: "Partial agonist[cite:efficacy-ref]",
          },
        ],
      },
    } as SubstanceArticle;

    const { container } = render(<PharmacologySection article={article} />);

    expect(screen.getByText("Lower affinity")).toBeInTheDocument();
    expect(screen.getByText("Partial agonist")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("[cite:");

    const affinityMarker = screen.getByRole("link", { name: "Citation 1" });
    expect(affinityMarker).toHaveAttribute("data-reference-id", "affinity-ref");
    const efficacyMarker = screen.getByRole("link", { name: "Citation 2" });
    expect(efficacyMarker).toHaveAttribute("data-reference-id", "efficacy-ref");
  });

  it("folds receptor, affinity, and efficacy reference ids into one card title cluster", () => {
    const article = {
      ...createEmptyArticle(),
      // A cited article summary puts the page on the public render-order
      // numbering path rather than the whole-object fallback, which is what a
      // real article looks like.
      summary: "Overview [cite:summary-ref].",
      references: [
        { id: "summary-ref", type: "webpage" as const, title: "Summary Ref", authors: [], url: "https://example.test/summary", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "tag-ref", type: "webpage" as const, title: "Tag Ref", authors: [], url: "https://example.test/tag", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "affinity-ref", type: "webpage" as const, title: "Affinity Ref", authors: [], url: "https://example.test/affinity", sourceType: "unknown" as const, quality: "fallback" as const },
        { id: "efficacy-ref", type: "webpage" as const, title: "Efficacy Ref", authors: [], url: "https://example.test/efficacy", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "",
        summary: "",
        binding_sites: [
          {
            target: "5-HT2A receptor",
            tag: "5-HT2A receptor agonist[cite:tag-ref]",
            affinity: "Ki = 6 nM[cite:affinity-ref]",
            efficacy: "Partial agonist[cite:efficacy-ref]",
          },
        ],
      },
    } as SubstanceArticle;

    const { container } = render(<PharmacologySection article={article} />);

    expect(screen.getByText("5-HT2A receptor")).toBeInTheDocument();
    expect(screen.getByText("agonist")).toBeInTheDocument();
    expect(screen.getByText("Ki = 6 nM")).toBeInTheDocument();
    expect(screen.getByText("Partial agonist")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("[cite:");

    // One cluster for the whole card, carrying every id its rows cite, in
    // receptor -> affinity -> efficacy order, each resolved to a real number
    // rather than the "?" an id missing from the render order would produce.
    const markers = screen.getAllByRole("link", { name: /^Citation \d+$/ });
    expect(
      markers.map((marker) => [
        marker.getAttribute("data-reference-id"),
        marker.textContent,
      ]),
    ).toEqual([
      ["tag-ref", "2"],
      ["affinity-ref", "3"],
      ["efficacy-ref", "4"],
    ]);
    expect(screen.queryByText("?")).not.toBeInTheDocument();

    // The cluster qualifies the card, so it sits on the title — ahead of every
    // row — and no marker is left behind among the rows themselves.
    const title = screen.getByText("Binding Sites");
    const site = screen.getByText("5-HT2A receptor");
    for (const marker of markers) {
      expect(title.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(marker.compareDocumentPosition(site) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("does not render an empty affinity column when the stored value is only a citation token", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "affinity-ref", type: "webpage" as const, title: "Affinity Ref", authors: [], url: "https://example.test/affinity", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "",
        summary: "",
        binding_sites: [
          {
            target: "5-HT1A receptor",
            tag: "",
            affinity: "[cite:affinity-ref]",
            efficacy: "",
          },
        ],
      },
    } as SubstanceArticle;

    const { container } = render(<PharmacologySection article={article} />);

    expect(container.innerHTML).not.toContain("[cite:");
    expect(
      screen.getByRole("link", { name: "Citation 1" }),
    ).toHaveAttribute("data-reference-id", "affinity-ref");
    expect(container.querySelector(".font-mono")).toBeNull();
  });

  it("expands the binding sites card by default when there is no pharmacodynamics intro text", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "",
        summary: "",
        binding_sites: [
          { target: "5-HT2A receptor", tag: "agonist", affinity: "", efficacy: "" },
        ],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // No intro text above the table, so it opens expanded with the entry visible.
    expect(screen.getByText("agonist")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand binding sites" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse binding sites" }),
    ).toBeInTheDocument();
  });

  it("collapses the binding sites card by default when pharmacodynamics intro text is present", () => {
    const article = {
      ...createEmptyArticle(),
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "This substance acts on serotonin receptors.",
        binding_sites: [
          { target: "5-HT2A receptor", tag: "agonist", affinity: "", efficacy: "" },
        ],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // Intro text exists above the table, so the table stays collapsed.
    expect(screen.queryByText("agonist")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand binding sites" }),
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

  it("renders metabolite cite tokens as citation markers without leaking raw text", () => {
    const article = {
      ...createEmptyArticle(),
      references: [
        { id: "doi-10-1111-j-1749-6632-2000-tb05213-x", type: "webpage" as const, title: "Ibogaine Metabolism Ref", authors: [], url: "https://example.test/ibogaine-metabolism", sourceType: "unknown" as const, quality: "fallback" as const },
      ],
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacokinetics: "",
        metabolites: [
          "Noribogaine (active)[cite:doi-10-1111-j-1749-6632-2000-tb05213-x]",
        ],
      },
    } as SubstanceArticle;

    render(<PharmacologySection article={article} />);

    // Card is expanded (no intro text); raw token never reaches the DOM,
    // and stripping the token keeps the name/active badge parsing intact.
    expect(screen.queryByText(/\[cite:/)).not.toBeInTheDocument();
    expect(screen.getByText("Noribogaine")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 1" })).toBeInTheDocument();
  });

  it("keeps long legality notes behind the country row disclosure", async () => {
    const user = userEvent.setup();
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
    expect(content).toHaveClass("text-sm", "leading-relaxed");
    expect(content).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show details for Australia" }));

    // The full note shows unclamped once the row is open.
    expect(content).toBeVisible();
    expect(content.getAttribute("style")).toBeNull();
  });
});
