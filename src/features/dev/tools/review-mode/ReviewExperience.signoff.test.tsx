/**
 * Review sign-off matches the signed-in role, undo restores the status the
 * reviewer actually saw, every status change can be undone from its toast, and
 * keys a menu already handled never reach the workbench.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

// Each case mounts the whole workbench, which is slow under a loaded runner.
vi.setConfig({ testTimeout: 30_000 });

const baseArticle = createEmptyArticle();
const makeArticle = (slug: string, title: string, status: "needed" | "in_progress" | "completed" = "needed") => ({
  ...baseArticle,
  slug,
  title,
  priority: "normal" as const,
  index_categories: ["opioid"],
  identification: { ...baseArticle.identification, common_name: title },
  editorial_review: { ...baseArticle.editorial_review, status },
});

const fixtures = vi.hoisted(() => ({
  articles: [] as unknown[],
  hydrated: new Set<string>(),
  session: {
    status: "authenticated" as const,
    data: { user: { email: "admin@example.com", role: "admin" } },
  },
}));

const layout = {
  categories: [{ key: "opioids", label: "Opioids", sections: [], drugs: ["heroin", "morphine"] }],
};

vi.mock("next-auth/react", () => ({ useSession: () => fixtures.session }));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: fixtures.articles,
    sourceArticles: fixtures.articles,
    articlesRefreshConflict: null,
    applyArticlesTransform: vi.fn(),
    articleHydration: createHydratedArticleHydration({
      hydratedSlugs: fixtures.hydrated,
      isArticleHydrated: (slug) => typeof slug === "string" && fixtures.hydrated.has(slug),
    }),
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

/** Status bodies the page posted to the review endpoint, in order. */
function postedStatuses(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => String(url).includes("editorial-review") && init?.method === "POST")
    .map(([, init]) => (JSON.parse(String(init?.body)) as { status?: string }).status ?? "");
}

function signInAs(role: "admin" | "editor") {
  fixtures.session = {
    status: "authenticated",
    data: { user: { email: `${role}@example.com`, role } },
  };
}

beforeEach(() => {
  fixtures.articles = [makeArticle("heroin", "Heroin"), makeArticle("morphine", "Morphine")];
  fixtures.hydrated = new Set(["heroin", "morphine"]);
  signInAs("admin");
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
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
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("article-lifecycle")) {
        return new Response(JSON.stringify({ article: fixtures.articles[0], baseHash: "base", draft: null, draftVersion: 0, history: [], proposals: [] }), { status: 200 });
      }
      if (url.includes("article-source-stats")) {
        return new Response(JSON.stringify({ stats: [] }), { status: 200 });
      }
      if (url.includes("editorial-review")) {
        const body = JSON.parse(String(init?.body)) as { slug: string; status: string };
        return new Response(
          JSON.stringify({ ok: true, slug: body.slug, editorial_review: { ...baseArticle.editorial_review, status: body.status } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

async function renderWorkbench(slug = "heroin") {
  const view = render(<ReviewExperience initialSlug={slug} />);
  await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));
  return view;
}

describe("review sign-off", () => {
  it("shows editors a disabled Mark reviewed with the reason in visible text, and R posts nothing", async () => {
    signInAs("editor");
    await renderWorkbench();

    expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeDisabled();
    expect(screen.getByText("Only admins can sign off a review.")).toBeVisible();

    fireEvent.keyDown(window, { key: "r" });
    await act(async () => {});
    expect(postedStatuses()).toEqual([]);
  });

  it("lets an admin mark reviewed", async () => {
    await renderWorkbench();
    const button = screen.getByRole("button", { name: "Mark as reviewed" });
    expect(button).toBeEnabled();
    expect(screen.queryByText("Only admins can sign off a review.")).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(postedStatuses()).toEqual(["completed"]));
  });

  it("returns Hold, R, Undo to in progress, not to the status the library row held", async () => {
    await renderWorkbench();

    fireEvent.click(screen.getAllByRole("button", { name: "Hold" })[0]);
    await waitFor(() => expect(postedStatuses()).toEqual(["in_progress"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeEnabled());
    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() => expect(postedStatuses()).toEqual(["in_progress", "completed"]));
    await screen.findByRole("button", { name: "Reviewed: undo" });

    fireEvent.keyDown(window, { key: "u" });
    await waitFor(() => expect(postedStatuses()).toEqual(["in_progress", "completed", "in_progress"]));
  });

  it("offers Undo in a toast for un-reviewing too", async () => {
    fixtures.articles = [makeArticle("heroin", "Heroin", "completed"), makeArticle("morphine", "Morphine")];
    await renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: "Reviewed: undo" }));
    await waitFor(() => expect(postedStatuses()).toEqual(["needed"]));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Marked Heroin not reviewed");
    fireEvent.click(within(toast).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(postedStatuses()).toEqual(["needed", "completed"]));
  });

  it("does not change article when ArrowRight is pressed inside the Open in menu", async () => {
    await renderWorkbench();
    const shownArticles = () => screen.getAllByTestId("article-layout").map((node) => node.textContent);
    expect(shownArticles()).toEqual(["Heroin"]);

    const trigger = screen.getAllByRole("button", { name: "Open this article in another tool" })[0];
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    const item = within(menu).getAllByRole("menuitem")[0];
    item.focus();
    fireEvent.keyDown(item, { key: "ArrowRight" });
    await act(async () => {});

    expect(shownArticles()).toEqual(["Heroin"]);
  });

  it("ignores R until the current article body has loaded", async () => {
    fixtures.hydrated = new Set(["morphine"]);
    const view = render(<ReviewExperience initialSlug="heroin" />);
    await waitFor(() => expect(view.getByTestId("review-article-loading")).toBeTruthy());

    fireEvent.keyDown(window, { key: "r" });
    await act(async () => {});
    expect(postedStatuses()).toEqual([]);
  });
});
