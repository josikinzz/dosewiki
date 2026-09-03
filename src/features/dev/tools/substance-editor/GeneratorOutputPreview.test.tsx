import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import { buildArticleYamlDraft } from "./substanceEditorDraftUtils";
import { GeneratorOutputPreview } from "./GeneratorOutputPreview";

const article = {
  ...createEmptyArticle(),
  slug: "lsd",
  title: "LSD",
  identification: { ...createEmptyArticle().identification, common_name: "LSD" },
};

describe("GeneratorOutputPreview", () => {
  it("renders the draft through the public article layout", () => {
    render(<GeneratorOutputPreview yamlContent={buildArticleYamlDraft(article)} />);

    // Closing credits and the table of contents exist only in ArticleLayout;
    // a hand-listed set of sections never produced either.
    expect(screen.getByRole("heading", { name: "Article Status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contents" })).toBeInTheDocument();
  });

  it("reports a parse failure instead of an article", () => {
    render(<GeneratorOutputPreview yamlContent="title: [" />);

    expect(screen.getByText("Unable to parse YAML")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Article Status" })).not.toBeInTheDocument();
  });
});
