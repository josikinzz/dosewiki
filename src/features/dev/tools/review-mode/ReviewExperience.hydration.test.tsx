/**
 * The workbench no longer drains the whole corpus: the chrome renders off the
 * slim library immediately, the current article hydrates per slug, and the
 * flip-through's immediate neighbours are prefetched behind it.
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
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
  {
    ...baseArticle,
    slug: "morphine",
    title: "Morphine",
    priority: "normal" as const,
    index_categories: ["opioid"],
    identification: { ...baseArticle.identification, common_name: "Morphine" },
    editorial_review: { ...baseArticle.editorial_review, status: "needed" as const },
  },
  {
    ...baseArticle,
    slug: "codeine",
    title: "Codeine",
    priority: "normal" as const,
    index_categories: ["opioid"],
    identification: { ...baseArticle.identification, common_name: "Codeine" },
    editorial_review: { ...baseArticle.editorial_review, status: "needed" as const },
  },
];

const layout = {
  categories: [
    {
      key: "opioids",
      label: "Opioids",
      sections: [],
      drugs: ["heroin", "morphine", "codeine"],
    },
  ],
};

const { requestArticleMock, hydratedRef, failedRef } = vi.hoisted(() => ({
  requestArticleMock: vi.fn(),
  hydratedRef: { current: new Set<string>() },
  failedRef: { current: new Set<string>() },
}));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles,
    sourceArticles: articles,
    articlesRefreshConflict: null,
    applyArticlesTransform: vi.fn(),
    articleHydration: createHydratedArticleHydration({
      hydratedSlugs: hydratedRef.current,
      failedSlugs: failedRef.current,
      isArticleHydrated: (slug) =>
        typeof slug === "string" && hydratedRef.current.has(slug),
      requestArticle: requestArticleMock,
    }),
  }),
}));

vi.mock("@/data/LightweightDataProvider", () => ({
  useLightweightData: () => ({ layout }),
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: () => undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { email: "admin@example.com", role: "admin" } },
  }),
}));

vi.mock("@/features/article/components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => (
    <div data-testid="article-layout">{article.title}</div>
  ),
}));

vi.mock("../../forms/ArticleDraftFormFieldsRHF", () => ({
  ArticleDraftFormFieldsRHF: () => <div data-testid="article-form" />,
}));


vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import { ReviewExperience } from "./ReviewExperience";

beforeEach(() => {
  requestArticleMock.mockClear();
  hydratedRef.current = new Set(["heroin", "morphine", "codeine"]);
  failedRef.current = new Set();
  // Each test mounts fresh: an entry stamped by the previous test would be
  // adopted, view and all, over the address this one sets up.
  window.history.replaceState(null, "", "/");
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
      const url = String(input);
      if (url.includes("article-source-stats")) {
        return new Response(JSON.stringify({ stats: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

describe("review workbench per-slug hydration", () => {
  it("shows the inline loading state and requests an unhydrated current article", async () => {
    hydratedRef.current = new Set(["heroin", "codeine"]);
    const view = render(<ReviewExperience initialSlug="morphine" />);

    await waitFor(() =>
      expect(view.getByTestId("review-article-loading")).toBeTruthy(),
    );
    expect(requestArticleMock).toHaveBeenCalledWith("morphine");
    // The chrome reads slim rows and stays up while the article area waits.
    expect(view.container.textContent).toContain("Morphine");
    expect(view.container.textContent).toContain("0 of 3 reviewed");
    expect(view.queryByTestId("article-layout")).toBeNull();
  });

  it("renders a hydrated article from its own per-slug request", async () => {
    const view = render(<ReviewExperience initialSlug="heroin" />);

    await waitFor(() => expect(view.getByTestId("article-layout")).toBeTruthy());
    expect(view.queryByTestId("review-article-loading")).toBeNull();
    expect(requestArticleMock).toHaveBeenCalledWith("heroin");
  });

  it("prefetches the next two and previous one once the current article lands", async () => {
    render(<ReviewExperience initialSlug="morphine" />);

    await waitFor(() => {
      expect(requestArticleMock).toHaveBeenCalledWith("morphine");
      expect(requestArticleMock).toHaveBeenCalledWith("codeine");
      expect(requestArticleMock).toHaveBeenCalledWith("heroin");
    });
  });


  it("shows a retryable error when the current article fails to hydrate", async () => {
    hydratedRef.current = new Set(["heroin", "codeine"]);
    failedRef.current = new Set(["morphine"]);
    const view = render(<ReviewExperience initialSlug="morphine" />);

    await waitFor(() => expect(view.getByTestId("review-article-failed")).toBeTruthy());
    expect(view.queryByTestId("review-article-loading")).toBeNull();
    expect(view.queryByTestId("article-layout")).toBeNull();
    // The chrome still reads slim rows and stays interactive around the notice.
    expect(view.container.textContent).toContain("0 of 3 reviewed");

    requestArticleMock.mockClear();
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    expect(requestArticleMock).toHaveBeenCalledWith("morphine");
  });

});
