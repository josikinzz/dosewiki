import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { PharmacologySection } from "./PharmacologySection";

describe("PharmacologySection", () => {
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
});
