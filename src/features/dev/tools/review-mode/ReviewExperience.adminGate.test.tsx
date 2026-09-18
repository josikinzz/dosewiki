/** Review ticks persist separately; editor inline edits are now private drafts. */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

const baseArticle = createEmptyArticle();
const articles = [
  {
    ...baseArticle,
    slug: "heroin",
    title: "Heroin",
    priority: "normal" as const,
    index_categories: ["opioid"],
    identification: { ...baseArticle.identification, common_name: "Heroin" },
    editorial_review: { ...baseArticle.editorial_review, status: "needed" as const },
  },
];

const layout = {
  categories: [{ key: "opioids", label: "Opioids", sections: [], drugs: ["heroin"] }],
};

const sessionState = vi.hoisted(() => ({
  current: {
    status: "authenticated" as const,
    data: { user: { email: "editor@example.com", role: "editor" } },
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => sessionState.current,
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

vi.mock("@/data/LightweightDataProvider", () => ({
  useLightweightData: () => ({ layout }),
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: () => undefined,
}));

vi.mock("@/features/article/components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => (
    <div data-testid="article-layout">{article.title}</div>
  ),
}));


vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import { ReviewExperience } from "./ReviewExperience";

beforeEach(() => {
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
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("article-lifecycle")) return new Response(JSON.stringify({ article: articles[0], baseHash: "base", draft: null, draftVersion: 0, history: [], proposals: [] }), { status: 200 });
      if (url.includes("article-source-stats")) {
        return new Response(JSON.stringify({ stats: [] }), { status: 200 });
      }
      if (url.includes("editorial-review")) {
        return new Response(
          JSON.stringify({
            ok: true,
            slug: "heroin",
            editorial_review: {
              status: "completed",
              notes: "",
              reviewed_by: "editor@example.com",
              reviewed_at: "2026-08-15T00:00:00.000Z",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

describe("review workbench drafting capability", () => {
  it("lets an editor arm local editing while the review tick still persists", async () => {
    sessionState.current = {
      status: "authenticated",
      data: { user: { email: "editor@example.com", role: "editor" } },
    };
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));

    const pill = view.getAllByRole("button", { name: "Inline editing" })[0];
    expect(pill).toBeEnabled();

    // Entering local edit mode never publishes the article.
    fireEvent.keyDown(window, { key: "e" });
    await waitFor(() => expect(pill).toHaveAttribute("aria-pressed", "true"));
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).includes("article-lifecycle") && init?.method === "POST")).toBe(false);

    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() => {
      const posted = vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("editorial-review"));
      expect(posted).toBe(true);
    });
  });

  it("lets an admin arm inline editing with E", async () => {
    sessionState.current = {
      status: "authenticated",
      data: { user: { email: "admin@example.com", role: "admin" } },
    };
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));

    const pill = view.getAllByRole("button", { name: "Inline editing" })[0];
    expect(pill).toBeEnabled();

    fireEvent.keyDown(window, { key: "e" });
    await waitFor(() => expect(pill).toHaveAttribute("aria-pressed", "true"));
  });
});
