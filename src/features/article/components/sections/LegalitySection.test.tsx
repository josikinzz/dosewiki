import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { LegalitySection, orderCountryLegalityEntries } from "./LegalitySection";

describe("LegalitySection", () => {
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
