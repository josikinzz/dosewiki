import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { useReagentData } from "@/hooks/useReagentData";
import { TableOfContentsSection } from "./TableOfContentsSection";

vi.mock("@/hooks/useReagentData", () => ({
  useReagentData: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    isError: false,
  })),
}));

describe("TableOfContentsSection", () => {
  const mockedUseReagentData = vi.mocked(useReagentData);

  beforeEach(() => {
    mockedUseReagentData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      isError: false,
    });
  });

  it("shows subjective effects when only the overview note is present", () => {
    const article = {
      ...createEmptyArticle(),
      id: 12,
      title: "Overview Only",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Overview Only",
      },
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        notes: {
          ...createEmptyArticle().subjective_effects.notes,
          overview: "This substance has a distinctive experiential arc.",
        },
      },
    };

    render(<TableOfContentsSection article={article} />);

    expect(screen.getByText("Subjective Effects")).toBeInTheDocument();
  });

  it("shows reagent testing when ProtestKit data exists even without static reagent data", () => {
    mockedUseReagentData.mockReturnValue({
      data: {
        reagents: [
          {
            key: "marq_desc",
            reagent: "marquis",
            label: "Marquis",
            description: "purple",
            colors: [{ id: 1, name: "purple", hex: "#666666" }],
            hint: "",
            isReacting: true,
            isKnownReagent: true,
          },
        ],
        substance: {
          name: "API Reagent Data",
          aliases: [],
        },
      },
      isLoading: false,
      error: null,
      isError: false,
    });

    const article = {
      ...createEmptyArticle(),
      id: 13,
      title: "API Reagent Data",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "API Reagent Data",
      },
      reagent_testing: {},
    };

    render(<TableOfContentsSection article={article} />);

    expect(screen.getByText("Reagent Testing")).toBeInTheDocument();
  });

  it("shows reagent testing while ProtestKit data is loading", () => {
    mockedUseReagentData.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      isError: false,
    });

    const article = {
      ...createEmptyArticle(),
      id: 14,
      title: "Loading Reagent Data",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Loading Reagent Data",
      },
      reagent_testing: {},
    };

    render(<TableOfContentsSection article={article} />);

    expect(screen.getByText("Reagent Testing")).toBeInTheDocument();
  });

  it("renders reagent testing with the default TOC styling", () => {
    mockedUseReagentData.mockReturnValue({
      data: {
        reagents: [
          {
            key: "marq_desc",
            reagent: "marquis",
            label: "Marquis",
            description: "purple",
            colors: [{ id: 1, name: "purple", hex: "#666666" }],
            hint: "",
            isReacting: true,
            isKnownReagent: true,
          },
        ],
        substance: {
          name: "Neutral TOC Item",
          aliases: [],
        },
      },
      isLoading: false,
      error: null,
      isError: false,
    });

    const article = {
      ...createEmptyArticle(),
      id: 15,
      title: "Neutral TOC Item",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Neutral TOC Item",
      },
      reagent_testing: {},
    };

    render(<TableOfContentsSection article={article} />);

    const reagentButton = screen.getByText("Reagent Testing").closest("button");
    expect(reagentButton).toBeInTheDocument();
    expect(reagentButton).not.toHaveClass("border-[color:var(--theme-warning-border)]");
    expect(reagentButton).not.toHaveClass("bg-[color:var(--theme-warning-bg)]");
  });
});
