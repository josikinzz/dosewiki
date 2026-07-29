import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";

const applyArticlesTransformMock = vi.fn();
const articles = [{
  ...createEmptyArticle(),
  slug: "lsd",
  title: "LSD",
  priority: "normal" as const,
  identification: { ...createEmptyArticle().identification, common_name: "LSD" },
  editorial_review: { ...createEmptyArticle().editorial_review, status: "needed" as const },
}];

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles,
    applyArticlesTransform: applyArticlesTransformMock,
  }),
}));

import { SubstanceEditorTab } from "./SubstanceEditorTab";

describe("SubstanceEditorTab", () => {
  it("supports manual article editing without source or generation controls", async () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);

    expect(screen.queryByText(/available sources/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/openrouter/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));

    expect(await screen.findByText("Substance Article")).toBeInTheDocument();
    expect(screen.getByText("Commit panel")).toBeInTheDocument();
  });
});
