/**
 * The workbench's tick is editor work, but its inline field edit and the
 * citation palette's add/remove write the published article directly. An
 * editor keeps the loop (R still persists) and loses only the direct writes:
 * the inline-edit pill is inert with the reason, and E arms nothing.
 */
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

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));

vi.mock("@/features/article/components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => (
    <div data-testid="article-layout">{article.title}</div>
  ),
}));

vi.mock("../../forms/ArticleDraftFormFieldsRHF", () => ({
  ArticleDraftFormFieldsRHF: () => <div data-testid="article-form" />,
}));

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

describe("review workbench admin gate", () => {
  it("keeps inline editing inert for an editor while the tick still persists", async () => {
    sessionState.current = {
      status: "authenticated",
      data: { user: { email: "editor@example.com", role: "editor" } },
    };
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));

    const pill = view.getAllByRole("button", { name: "Inline editing" })[0];
    expect(pill).toBeDisabled();
    expect(pill).toHaveAttribute("title", "Admin role required");

    // E is the keyboard route to the same mode; it must not arm it either.
    fireEvent.keyDown(window, { key: "e" });
    expect(pill).toHaveAttribute("aria-pressed", "false");

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
