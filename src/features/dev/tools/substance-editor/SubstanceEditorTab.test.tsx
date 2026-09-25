import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";

const articles = [
  { slug: "lsd", title: "LSD", priority: "normal" as const },
  { slug: "mdma", title: "MDMA", priority: "normal" as const },
  { slug: "quiet", title: "Quiet", priority: "low" as const },
  { slug: "hidden-for-now", title: "Hidden for now", priority: "hide_for_now" as const },
].map((value) => ({
  ...createEmptyArticle(), ...value,
  identification: { ...createEmptyArticle().identification, common_name: value.title },
}));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({ articles, articleHydration: createHydratedArticleHydration() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { role: "editor", email: "editor@example.com" } } }),
}));
// The adapter owns selection and URLs; the shared lifecycle owns article editing.
vi.mock("@/features/article/editing/ArticleContextBridge.editor", () => ({ default: () => null }));

import { SubstanceEditorTab } from "./SubstanceEditorTab";

afterEach(() => { vi.restoreAllMocks(); });

describe("SubstanceEditorTab selection", () => {
  it("prompts for a substance before any article is selected", () => {
    render(<SubstanceEditorTab />);
    expect(screen.getByText("Select a substance to begin editing")).toBeInTheDocument();
  });

  it("records selections in the URL without rewriting an initial deep link", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { unmount } = render(<SubstanceEditorTab />);
    fireEvent.click(screen.getByRole("option", { name: /lsd/i }));
    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/articles/lsd"));
    unmount();
    replaceState.mockClear();
    render(<SubstanceEditorTab initialSlug="mdma" />);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("reveals URL-only articles on request and keeps a URL-only deep link selectable", () => {
    const { unmount } = render(<SubstanceEditorTab />);
    expect(screen.queryByRole("option", { name: /quiet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /hidden for now/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Include URL-only" }));
    expect(screen.getByRole("option", { name: /quiet/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /hidden for now/i })).toBeInTheDocument();
    unmount();
    render(<SubstanceEditorTab initialSlug="quiet" />);
    expect(screen.getByRole("option", { name: /quiet/i })).toBeInTheDocument();
  });
});
