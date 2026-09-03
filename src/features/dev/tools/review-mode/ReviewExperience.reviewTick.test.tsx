/**
 * The review tick has to reach everything the workbench renders, not just the
 * queue. The tick persists through its own endpoint and deliberately leaves the
 * shared editor working set alone, so without an overlay the article on screen
 * — and the editor form seeded from it — keep the pre-tick review record: the
 * page still says "Not yet reviewed" after R, and applying that form would
 * write the stale status back over Convex.
 */
import { fireEvent, render, waitFor, type RenderResult } from "@testing-library/react";
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
  {
    ...baseArticle,
    slug: "morphine",
    title: "Morphine",
    priority: "normal" as const,
    index_categories: ["opioid"],
    identification: { ...baseArticle.identification, common_name: "Morphine" },
    editorial_review: { ...baseArticle.editorial_review, status: "needed" as const },
  },
];

const layout = {
  categories: [
    {
      key: "opioids",
      label: "Opioids",
      sections: [],
      drugs: ["heroin", "morphine"],
    },
  ],
};

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

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { email: "admin@example.com", role: "admin" } },
  }),
}));

/** Every article the rendered page has been handed, oldest first. */
const layoutArticles: SubstanceArticle[] = [];
vi.mock("@/features/article/components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => {
    layoutArticles.push(article);
    return <div data-testid="article-layout" />;
  },
}));

/** The same, for the editor form. */
const formArticles: SubstanceArticle[] = [];
vi.mock("../../forms/ArticleDraftFormFieldsRHF", () => ({
  ArticleDraftFormFieldsRHF: ({ article }: { article: SubstanceArticle }) => {
    formArticles.push(article);
    return <div data-testid="article-form" />;
  },
}));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import { ReviewExperience } from "./ReviewExperience";

type FetchMock = { mock: { calls: unknown[][] } };

/** The review endpoint answered, so the tick is persisted. */
async function tickPersisted(): Promise<void> {
  await waitFor(() => {
    const posted = (globalThis.fetch as unknown as FetchMock).mock.calls.some(
      ([url]) => String(url).includes("editorial-review"),
    );
    expect(posted).toBe(true);
  });
}

/** Radix activates a tab on pointer/mouse down, not on a bare click. */
function selectEditorTab(getAllByRole: RenderResult["getAllByRole"]): void {
  const editorTab = getAllByRole("tab", { name: /editor/i })[0];
  fireEvent.pointerDown(editorTab, { button: 0 });
  fireEvent.mouseDown(editorTab, { button: 0 });
  fireEvent.click(editorTab);
}

beforeEach(() => {
  layoutArticles.length = 0;
  formArticles.length = 0;
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
      if (url.includes("editorial-review")) {
        return new Response(
          JSON.stringify({
            ok: true,
            slug: "heroin",
            editorial_review: {
              status: "completed",
              notes: "",
              reviewed_by: "lyrea@local.dose.wiki",
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

describe("review tick propagation", () => {
  it("clears the unreviewed banner on the rendered article after R", async () => {
    render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(layoutArticles.length).toBeGreaterThan(0));

    fireEvent.keyDown(window, { key: "r" });
    await tickPersisted();

    await waitFor(() => {
      const latest = layoutArticles[layoutArticles.length - 1];
      expect(latest.editorial_review?.status).toBe("completed");
    });
  });

  it("hands the editor form the completed review after a tick in webpage view", async () => {
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(layoutArticles.length).toBeGreaterThan(0));

    fireEvent.keyDown(window, { key: "r" });
    await tickPersisted();

    selectEditorTab(view.getAllByRole);

    await waitFor(() => expect(formArticles.length).toBeGreaterThan(0));
    expect(formArticles[formArticles.length - 1].editorial_review?.status).toBe("completed");
  });

  it("keeps the completed review in the editor form after leaving and returning", async () => {
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(layoutArticles.length).toBeGreaterThan(0));

    fireEvent.keyDown(window, { key: "r" });
    await tickPersisted();

    // The ordinary review loop: tick, flip to the next article, come back.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(view.container.textContent).toContain("Morphine, Not reviewed"),
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(view.container.textContent).toContain("Heroin, Reviewed"));

    selectEditorTab(view.getAllByRole);

    await waitFor(() => expect(formArticles.length).toBeGreaterThan(0));
    expect(formArticles[formArticles.length - 1].editorial_review?.status).toBe("completed");
  });
});
