/**
 * The review queue covers every public article, placed on the index or not,
 * and progress reads as text in the bar rather than a hover title.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

// Each case mounts the whole workbench, which is slow under a loaded runner.
vi.setConfig({ testTimeout: 30_000 });

const baseArticle = createEmptyArticle();
const makeArticle = (slug: string, title: string, priority: "normal" | "low" = "normal") => ({
  ...baseArticle,
  slug,
  title,
  priority,
  index_categories: ["opioid"],
  identification: { ...baseArticle.identification, common_name: title },
  editorial_review: { ...baseArticle.editorial_review, status: "needed" as const },
});

const articles = [
  makeArticle("heroin", "Heroin"),
  // Public, but the index layout never places it.
  makeArticle("kratom", "Kratom"),
  // Direct-URL-only: reachable by its address, never listed.
  makeArticle("tianeptine", "Tianeptine", "low"),
  { ...makeArticle("secret", "Secret"), index_categories: ["hidden"] },
];

const layout = {
  categories: [{ key: "opioids", label: "Opioids", sections: [], drugs: ["heroin"] }],
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { email: "admin@example.com", role: "admin" } } }),
}));
vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles,
    sourceArticles: articles,
    articlesRefreshConflict: null,
    applyArticlesTransform: vi.fn(),
    articleHydration: createHydratedArticleHydration(),
  }),
}));
vi.mock("@/data/LightweightDataProvider", () => ({ useLightweightData: () => ({ layout }) }));
vi.mock("@/hooks/useEditorRead", () => ({ useEditorRead: () => undefined }));
vi.mock("@/features/article/components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => (
    <div data-testid="article-layout">{article.title}</div>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import { ReviewExperience } from "./ReviewExperience";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.innerWidth = 1280;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("article-source-stats")) {
        return new Response(JSON.stringify({ stats: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

describe("review queue coverage", () => {
  it("opens an unplaced public article instead of falling back to the first placed one", async () => {
    render(<ReviewExperience initialSlug="kratom" />);
    await waitFor(() =>
      expect(screen.getAllByTestId("article-layout").map((node) => node.textContent)).toEqual(["Kratom"]),
    );
  });

  it("includes direct-URL-only articles and leaves hidden ones out", async () => {
    render(<ReviewExperience initialSlug="tianeptine" />);
    await waitFor(() =>
      expect(screen.getAllByTestId("article-layout").map((node) => node.textContent)).toEqual(["Tianeptine"]),
    );
  });

  it("shows progress as visible text in the review dock at a 1280px viewport", async () => {
    render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(screen.getAllByTestId("article-layout").length).toBeGreaterThan(0));

    const dock = screen.getByRole("region", { name: "Review" });
    const progress = screen.getByTestId("review-progress-text");
    expect(dock).toContainElement(progress);
    expect(progress).toHaveTextContent("0 of 3 reviewed");
    expect(progress.className).not.toMatch(/\b(sr-only|hidden)\b/);
  });
});
