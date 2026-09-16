import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { useReagentData } from "@/hooks/useReagentData";
import { ArticleTableOfContents } from "./ArticleTableOfContents";

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
  const originalMatchMedia = window.matchMedia;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    mockedUseReagentData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      isError: false,
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.history.replaceState(null, "", "/substances/test");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.querySelectorAll("[data-toc-test-target]").forEach((element) => {
      element.remove();
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

    render(<ArticleTableOfContents article={article} />);

    expect(document.querySelector("[data-nosnippet]")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Subjective Effects" }),
    ).toHaveAttribute("href", "#subjective-effects");
  });

  it("frames article content with introduction, status, and feedback links", () => {
    render(<ArticleTableOfContents article={createEmptyArticle()} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Introduction");
    expect(links[0]).toHaveAttribute("href", "#introduction");
    expect(links[links.length - 2]).toHaveTextContent("Article Status");
    expect(links[links.length - 2]).toHaveAttribute("href", "#article-status");
    expect(links[links.length - 1]).toHaveTextContent("Feedback");
    expect(links[links.length - 1]).toHaveAttribute("href", "#feedback");
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

    render(<ArticleTableOfContents article={article} />);

    expect(
      screen.getByRole("link", { name: "Reagent Testing" }),
    ).toHaveAttribute("href", "#reagent-testing");
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

    render(<ArticleTableOfContents article={article} />);

    expect(
      screen.getByRole("link", { name: "Reagent Testing" }),
    ).toBeInTheDocument();
  });

  it("shows trip reports only when the host reports related reports exist", () => {
    const article = {
      ...createEmptyArticle(),
      id: 16,
      title: "Trip Report Presence",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Trip Report Presence",
      },
    };

    const { rerender } = render(
      <ArticleTableOfContents article={article} hasTripReports />,
    );

    expect(screen.getByRole("link", { name: "Trip Reports" })).toHaveAttribute(
      "href",
      "#trip-reports",
    );

    rerender(<ArticleTableOfContents article={article} />);

    expect(
      screen.queryByRole("link", { name: "Trip Reports" }),
    ).not.toBeInTheDocument();
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

    render(<ArticleTableOfContents article={article} />);

    const reagentLink = screen.getByRole("link", { name: "Reagent Testing" });
    expect(reagentLink).toBeInTheDocument();
    expect(reagentLink).not.toHaveClass(
      "border-[color:var(--theme-warning-border)]",
    );
    expect(reagentLink).not.toHaveClass("bg-[color:var(--theme-warning-bg)]");
  });

  it("scrolls to article sections and updates the URL hash on plain clicks", () => {
    const article = {
      ...createEmptyArticle(),
      id: 16,
      title: "Hash Navigation",
      summary: "A short article summary.",
    };
    const target = document.createElement("section");
    target.id = "harm-potential";
    target.dataset.tocTestTarget = "true";
    document.body.appendChild(target);

    render(<ArticleTableOfContents article={article} />);

    fireEvent.click(screen.getByRole("link", { name: "Harm Potential" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(window.location.hash).toBe("#harm-potential");
  });

  it("uses instant scrolling for plain clicks when reduced motion is preferred", () => {
    window.matchMedia = vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const article = {
      ...createEmptyArticle(),
      id: 17,
      title: "Reduced Motion",
      summary: "A short article summary.",
    };
    const target = document.createElement("section");
    target.id = "harm-potential";
    target.dataset.tocTestTarget = "true";
    document.body.appendChild(target);

    render(<ArticleTableOfContents article={article} />);

    fireEvent.click(screen.getByRole("link", { name: "Harm Potential" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("leaves modified anchor clicks to the browser", () => {
    const article = {
      ...createEmptyArticle(),
      id: 18,
      title: "Modified Navigation",
      summary: "A short article summary.",
    };
    const target = document.createElement("section");
    target.id = "harm-potential";
    target.dataset.tocTestTarget = "true";
    document.body.appendChild(target);

    render(<ArticleTableOfContents article={article} />);

    fireEvent.click(screen.getByRole("link", { name: "Harm Potential" }), {
      metaKey: true,
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });
});
