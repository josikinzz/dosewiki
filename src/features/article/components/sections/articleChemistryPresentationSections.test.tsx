import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { useReagentData } from "@/hooks/useReagentData";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";

import { HeroSection } from "./HeroSection";
import { ReagentSection } from "./ReagentSection";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img alt={alt} data-priority={priority ? "true" : "false"} {...props} />
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

function renderWithAppearance(children: ReactNode) {
  return render(<AppearanceTestProvider>{children}</AppearanceTestProvider>);
}

describe("article chemistry presentation sections", () => {
  const mockedUseReagentData = vi.mocked(useReagentData);

  beforeEach(() => {
    // Earlier renders in this file persist the appearance they open on; the
    // molecule-asset test pins Neutral and must not inherit that saved accent.
    window.localStorage.clear();
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

    renderWithAppearance(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        showPreviewBadge={false}
      />,
    );

    const detailsButton = screen.getByRole("button", { name: "Expand chemistry details" });
    expect(detailsButton).toHaveTextContent("Details");
    expect(detailsButton).toHaveAttribute("aria-controls", "hero-chemistry-details");

    fireEvent.click(detailsButton);

    expect(screen.getByText("Presentation IUPAC")).toBeInTheDocument();
    expect(screen.getByText("Presentation IUPAC").closest("#hero-chemistry-details")).toBeInTheDocument();
  });

  it("renders a supplied molecule asset without a client-side catalog lookup", () => {
    const article = createEmptyArticle();
    article.title = "Display Only";
    article.identification.common_name = "Display Only";

    const chemistryPresentation = buildArticleChemistryPresentation(article);

    // Accent saturation is pinned to zero because the assertion below is about the
    // grey→Pro-dark molecule mapping, not the site's opening level (saturated, which
    // maps to the Fun colourway).
    render(
      <AppearanceTestProvider initialAccentChroma={0}>
        <HeroSection
          article={article}
          chemistryPresentation={chemistryPresentation}
          moleculeAsset={{
            filename: "display-only.svg",
            url: "/api/molecules/display-only?v=seeded",
            matchedField: "data-molecule",
            matchedValue: "Display Only",
          }}
          showPreviewBadge={false}
        />
      </AppearanceTestProvider>,
    );

    const moleculeImages = screen.getAllByAltText(chemistryPresentation.molecule.alt);
    expect(moleculeImages[0]).toHaveAttribute("src", "/api/molecules/display-only?v=seeded&colorway=pro-dark");
  });

  it("prioritizes above-the-fold molecule images with responsive sizes", () => {
    const article = createEmptyArticle();
    article.title = "Priority Molecule";
    article.identification.common_name = "Priority Molecule";

    const chemistryPresentation = buildArticleChemistryPresentation(article);

    renderWithAppearance(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={{
          filename: "priority-molecule.svg",
          url: "/api/molecules/priority-molecule?v=seeded",
          matchedField: "data-molecule",
          matchedValue: "Priority Molecule",
        }}
        showPreviewBadge={false}
      />,
    );

    // MoleculeImage renders one variant per colour scheme; the flavor's default
    // scheme is the one that carries priority.
    const [desktopMolecule, mobileMolecule] = screen
      .getAllByAltText(chemistryPresentation.molecule.alt)
      .filter((image) => image.dataset.moleculeColorway === `pro-${SITE_FLAVOR_CONFIG.defaultColorScheme}`);

    expect(desktopMolecule).toHaveAttribute("data-priority", "true");
    expect(desktopMolecule).toHaveAttribute("sizes", "(min-width: 768px) 16rem, 0px");
    expect(desktopMolecule).toHaveAttribute("width", "256");
    expect(desktopMolecule).toHaveAttribute("height", "256");

    expect(mobileMolecule).toHaveAttribute("data-priority", "true");
    expect(mobileMolecule).toHaveAttribute("sizes", "(max-width: 767px) min(85vw, 18rem), 0px");
    expect(mobileMolecule).toHaveAttribute("width", "288");
    expect(mobileMolecule).toHaveAttribute("height", "288");
  });

  it("moves the desktop molecule below a title that needs the molecule row", () => {
    const article = createEmptyArticle();
    article.title = "Dextromethorphan";
    article.identification.common_name = "Dextromethorphan";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    const moleculeAsset = {
      filename: "dextromethorphan.svg",
      url: "/api/molecules/dextromethorphan?v=seeded",
      matchedField: "data-molecule",
      matchedValue: "Dextromethorphan",
    } as const;
    let titleContentWidth = 687;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect() {
        if (this instanceof HTMLElement && this.tagName === "H1") {
          return rect(33, 33, 564, 75);
        }
        if (this instanceof HTMLElement && this.classList.contains("theme-article-hero")) {
          return rect(0, 0, 896, 510);
        }
        return rect(0, 0, 0, 0);
      });
    const rangeSpy = vi.spyOn(document, "createRange").mockImplementation(
      () =>
        ({
          selectNodeContents: vi.fn(),
          getBoundingClientRect: () => rect(33, 33, titleContentWidth, 75),
        }) as unknown as Range,
    );

    try {
      const { rerender } = render(
        <AppearanceTestProvider>
          <HeroSection
            article={article}
            chemistryPresentation={chemistryPresentation}
            moleculeAsset={moleculeAsset}
            showPreviewBadge={false}
          />
        </AppearanceTestProvider>,
      );

      expect(
        document.querySelector('[data-hero-molecule-layout="below-title"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-hero-molecule-layout="top"]'),
      ).toBeNull();

      titleContentWidth = 493;
      const shortArticle = { ...article, title: "Short title" };
      rerender(
        <AppearanceTestProvider>
          <HeroSection
            article={shortArticle}
            chemistryPresentation={chemistryPresentation}
            moleculeAsset={moleculeAsset}
            showPreviewBadge={false}
          />
        </AppearanceTestProvider>,
      );

      expect(
        document.querySelector('[data-hero-molecule-layout="top"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-hero-molecule-layout="below-title"]'),
      ).toBeNull();
    } finally {
      rectSpy.mockRestore();
      rangeSpy.mockRestore();
    }
  });

  it("bumps the molecule below a title the float would wrap, even when wrapped lines fit", () => {
    const article = createEmptyArticle();
    article.title = "Dextromethorphan";
    article.identification.common_name = "Dextromethorphan";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    const moleculeAsset = {
      filename: "dextromethorphan.svg",
      url: "/api/molecules/dextromethorphan?v=seeded",
      matchedField: "data-molecule",
      matchedValue: "Dextromethorphan",
    } as const;
    // Unwrapped width collides with the molecule column; the laid-out title
    // already wrapped around the float, so its last line ends far left of it.
    const UNWRAPPED_TITLE_WIDTH = 687;
    const WRAPPED_LAST_LINE_WIDTH = 80;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect;
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect() {
        if (this instanceof HTMLElement && this.tagName === "H1") {
          return rect(33, 33, 564, 150);
        }
        if (this instanceof HTMLElement && this.classList.contains("theme-article-hero")) {
          return rect(0, 0, 896, 510);
        }
        return rect(0, 0, 0, 0);
      });
    const rangeSpy = vi.spyOn(document, "createRange").mockImplementation(
      () =>
        ({
          selectNodeContents: vi.fn(),
          getBoundingClientRect: () => {
            const measuringUnwrapped =
              document.querySelector("h1")?.style.whiteSpace === "nowrap";
            return measuringUnwrapped
              ? rect(33, 33, UNWRAPPED_TITLE_WIDTH, 75)
              : rect(33, 108, WRAPPED_LAST_LINE_WIDTH, 75);
          },
        }) as unknown as Range,
    );

    try {
      render(
        <AppearanceTestProvider>
          <HeroSection
            article={article}
            chemistryPresentation={chemistryPresentation}
            moleculeAsset={moleculeAsset}
            showPreviewBadge={false}
          />
        </AppearanceTestProvider>,
      );

      expect(
        document.querySelector('[data-hero-molecule-layout="below-title"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-hero-molecule-layout="top"]'),
      ).toBeNull();
      // The measurement style is reverted after each layout pass.
      expect(document.querySelector("h1")?.style.whiteSpace).toBe("");
    } finally {
      rectSpy.mockRestore();
      rangeSpy.mockRestore();
    }
  });

  it("keeps mobile hero content in the legacy order without priority links", () => {
    const article = createEmptyArticle();
    article.title = "Legacy Article";
    article.identification.common_name = "Legacy Article";
    article.summary = "Opening summary for a reader who needs orientation.";
    article.identification.substitutive_name = "Legacy substitutive name";
    article.harm_potential.summary = "Risk summary.";
    article.interactions.dangerous = ["MAOIs"];
    article.legality.countries = {
      "United States": {
        status: "Schedule I",
        notes: "",
      },
    };
    article.references = [
      {
        id: "source-ref",
        type: "webpage",
        title: "Source",
        authors: [],
        url: "https://example.test/source",
        sourceType: "unknown",
        quality: "fallback",
      },
    ];

    const chemistryPresentation = buildArticleChemistryPresentation(article);

    const { container } = renderWithAppearance(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={{
          filename: "legacy-article.svg",
          url: "/api/molecules/legacy-article?v=seeded",
          matchedField: "data-molecule",
          matchedValue: "Legacy Article",
        }}
        showPreviewBadge={false}
      />,
    );

    const summary = Array.from(container.querySelectorAll(".theme-article-hero-summary"))
      .find((element) => element.textContent?.includes("Opening summary"));
    const molecule = screen.getAllByAltText(chemistryPresentation.molecule.alt)[1];
    const substitutiveName = screen.getByText("Legacy substitutive name");
    expect(summary).toBeTruthy();
    expect(molecule.compareDocumentPosition(substitutiveName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(substitutiveName.compareDocumentPosition(summary!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByRole("navigation", { name: "Priority article sections" })).not.toBeInTheDocument();
    expect(container.querySelector(".theme-article-hero-priority")).not.toBeInTheDocument();
  });

  it("renders citation-needed markers inside a translated summary without whitespace", () => {
    const article = createEmptyArticle();
    article.title = "Dextromethorphan";
    article.summary = "右美沙芬（DXM）是一种解离剂。[citation-needed][citation-needed] 后续说明。";
    const chemistryPresentation = buildArticleChemistryPresentation(article);

    const { container } = renderWithAppearance(
      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={null}
        showPreviewBadge={false}
      />,
    );

    expect(container.textContent).not.toContain("[citation-needed]");
    expect(container.querySelectorAll(".theme-citation-needed-marker")).toHaveLength(1);
  });

  it("uses the canonical article slug for snapshot reads", () => {
    const article = createEmptyArticle();
    article.title = "Lookup Name";
    article.identification.common_name = "Lookup Name";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    chemistryPresentation.reagentTesting.lookupName = "Presentation Lookup";
    chemistryPresentation.reagentTesting.aliases = ["Alias"];
    chemistryPresentation.reagentTesting.shouldFetchApiData = true;

    renderWithAppearance(<ReagentSection article={article} chemistryPresentation={chemistryPresentation} />);

    expect(mockedUseReagentData).toHaveBeenCalledWith("lookup-name");
  });

  it("renders static reagent entries from the presentation model without API lookup", () => {
    const article = createEmptyArticle();
    article.title = "Static Reagent";
    article.identification.common_name = "Static Reagent";

    const chemistryPresentation = buildArticleChemistryPresentation(article);
    chemistryPresentation.reagentTesting.staticEntries = [["marquis", "purple to black"]];
    chemistryPresentation.reagentTesting.hasStaticData = true;
    chemistryPresentation.reagentTesting.shouldFetchApiData = false;

    renderWithAppearance(<ReagentSection article={article} chemistryPresentation={chemistryPresentation} />);

    expect(mockedUseReagentData).toHaveBeenCalledWith("");
    expect(screen.getByText("Reagent Testing")).toBeInTheDocument();
    expect(screen.getByText("purple to black")).toBeInTheDocument();
  });
});
