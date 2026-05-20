import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { useReagentData } from "@/hooks/useReagentData";

import { HeroSection } from "./HeroSection";
import { ReagentSection } from "./ReagentSection";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock("@/hooks/useReagentData", () => ({
  useReagentData: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    isError: false,
  })),
}));

describe("article chemistry presentation sections", () => {
  const mockedUseReagentData = vi.mocked(useReagentData);

  beforeEach(() => {
    mockedUseReagentData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      isError: false,
    });
  });

  it("drives hero chemistry detail visibility from the presentation model", () => {
    const article = createEmptyArticle();
    article.title = "Display Only";
    article.identification.common_name = "Display Only";
    article.classification.chemical_class = ["Arylcyclohexylamine"];
    article.identification.iupac_name = "";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    chemistryPresentation.hasIdentifiers = true;
    chemistryPresentation.identifiers = [
      { key: "iupac_name", label: "IUPAC", value: "Presentation IUPAC", format: "code" },
    ];

    render(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        showPreviewBadge={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand chemistry details" }));

    expect(screen.getByText("Presentation IUPAC")).toBeInTheDocument();
  });

  it("renders a supplied molecule asset without a client-side catalog lookup", () => {
    const article = createEmptyArticle();
    article.title = "Display Only";
    article.identification.common_name = "Display Only";

    const chemistryPresentation = buildArticleChemistryPresentation(article);

    render(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={{
          filename: "Display Only.svg",
          url: "/molecules/Display%20Only.svg",
          matchedField: "title",
          matchedValue: "Display Only",
        }}
        showPreviewBadge={false}
      />,
    );

    const moleculeImages = screen.getAllByAltText(chemistryPresentation.molecule.alt);
    expect(moleculeImages[0]).toHaveAttribute("src", "/molecules/Display%20Only.svg");
  });

  it("uses presentation reagent lookup state for API fetching", () => {
    const article = createEmptyArticle();
    article.title = "Lookup Name";
    article.identification.common_name = "Lookup Name";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    chemistryPresentation.reagentTesting.lookupName = "Presentation Lookup";
    chemistryPresentation.reagentTesting.aliases = ["Alias"];
    chemistryPresentation.reagentTesting.shouldFetchApiData = true;

    render(<ReagentSection article={article} chemistryPresentation={chemistryPresentation} />);

    expect(mockedUseReagentData).toHaveBeenCalledWith("Presentation Lookup", ["Alias"]);
  });

  it("renders static reagent entries from the presentation model without API lookup", () => {
    const article = createEmptyArticle();
    article.title = "Static Reagent";
    article.identification.common_name = "Static Reagent";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    chemistryPresentation.reagentTesting.staticEntries = [["marquis", "purple to black"]];
    chemistryPresentation.reagentTesting.hasStaticData = true;
    chemistryPresentation.reagentTesting.shouldFetchApiData = false;

    render(<ReagentSection article={article} chemistryPresentation={chemistryPresentation} />);

    expect(mockedUseReagentData).toHaveBeenCalledWith("", []);
    expect(screen.getByText("Reagent Testing")).toBeInTheDocument();
    expect(screen.getByText("purple to black")).toBeInTheDocument();
  });
});
