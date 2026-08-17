import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { HeroSection } from "./HeroSection";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe("HeroSection category links", () => {
  it("links only index categories with canonical public routes", () => {
    const article = createEmptyArticle();
    article.title = "Mephedrone";
    article.identification.common_name = "Mephedrone";
    article.index_categories = ["stimulant", "Research Chemicals"];

    render(
      <HeroSection
        article={article}
        linkableCategoryKeys={["stimulant"]}
        showPreviewBadge={false}
      />,
    );

    expect(screen.getByRole("link", { name: "stimulant" })).toHaveAttribute(
      "href",
      "/category/stimulant",
    );
    expect(screen.getByText("Research Chemicals").closest("a")).toBeNull();
  });
});
