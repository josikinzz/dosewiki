/**
 * A sign-off records the revision it covered: an article published since reads
 * "Changed since review", the queue filters to exactly those articles, and the
 * article opens with a diff of only the fields changed since the sign-off.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

vi.setConfig({ testTimeout: 30_000 });

const baseArticle = createEmptyArticle();
const makeArticle = (
  slug: string,
  title: string,
  review: Partial<SubstanceArticle["editorial_review"]> = {},
) => ({
  ...baseArticle,
  slug,
  title,
  priority: "normal" as const,
  index_categories: ["opioid"],
  identification: { ...baseArticle.identification, common_name: title },
  editorial_review: { ...baseArticle.editorial_review, ...review },
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
  categories: [{ key: "opioids", label: "Opioids", sections: [], drugs: ["heroin", "morphine", "codeine", "fentanyl"] }],
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

/** Bodies the page posted to the review endpoint, in order. */
function postedBodies(): Array<{ status?: string; revision?: string }> {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => String(url).includes("editorial-review") && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as { status?: string; revision?: string });
}

const signedSummary = { ...baseArticle, title: "Heroin", summary: "Summary the reviewer signed." };
const currentSummary = { ...signedSummary, summary: "Summary edited after review." };

beforeEach(() => {
  fixtures.articles = [
    // Signed rev1, published rev9 since: changed.
    makeArticle("heroin", "Heroin", { status: "completed", reviewed_by: "admin@example.com", reviewed_revision: "rev1" }),
    // Signed the revision still published, approving an editor's recommendation: reviewed.
    makeArticle("morphine", "Morphine", {
      status: "completed",
      reviewed_by: "admin@example.com",
      reviewed_revision: "rev2",
      recommended_by: "editor@example.com",
    }),
    // Signed before any revision was recorded, then published: changed.
    makeArticle("fentanyl", "Fentanyl", { status: "completed", reviewed_by: "admin@example.com", reviewed_revision: "initial" }),
    makeArticle("codeine", "Codeine"),
  ];
  fixtures.hydrated = new Set(["heroin", "morphine", "codeine", "fentanyl"]);
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
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("article-lifecycle")) {
        return new Response(JSON.stringify({ article: fixtures.articles[0], baseHash: "base", draft: null, draftVersion: 0, history: [], proposals: [] }), { status: 200 });
      }
      if (url.includes("article-source-stats")) {
        return new Response(JSON.stringify({ stats: [] }), { status: 200 });
      }
      if (url.includes("review-revisions?")) {
        return new Response(
          JSON.stringify({ ok: true, slug: "heroin", revision: "rev1", publishedRevision: "rev9", signed: signedSummary, current: currentSummary }),
          { status: 200 },
        );
      }
      if (url.includes("review-revisions")) {
        return new Response(JSON.stringify({ ok: true, revisions: { heroin: "rev9", morphine: "rev2", fentanyl: "rev4" } }), { status: 200 });
      }
      if (url.includes("editorial-review")) {
        const body = JSON.parse(String(init?.body)) as { slug: string; status: string; revision?: string };
        return new Response(
          JSON.stringify({
            ok: true,
            slug: body.slug,
            editorial_review: { ...baseArticle.editorial_review, status: body.status, reviewed_revision: body.revision },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

async function renderWorkbench(slug: string) {
  const view = render(<ReviewExperience initialSlug={slug} />);
  await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));
  return view;
}

describe("changed since review", () => {
  it("shows only the fields changed since the signed revision", async () => {
    await renderWorkbench("heroin");
    const notice = await screen.findByRole("region", { name: "Changed since review" });
    expect(notice).toHaveTextContent("Heroin changed after its sign-off (Reviewed by admin@example.com)");

    fireEvent.click(within(notice).getByRole("button", { name: "Show changes since review" }));

    const diff = await within(notice).findByLabelText("Article change review");
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url) === "/api/dev/review-revisions?slug=heroin&since=rev1"),
    ).toBe(true);
    expect(within(diff).getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual(["Summary"]);
    expect(diff).toHaveTextContent("Summary the reviewer signed.");
    expect(diff).toHaveTextContent("Summary edited after review.");
  });

  it("does not offer the diff on an article whose sign-off is current", async () => {
    await renderWorkbench("morphine");
    expect(screen.queryByRole("region", { name: "Changed since review" })).toBeNull();
  });

  it("credits both the recommending editor and the approving admin", async () => {
    await renderWorkbench("morphine");
    expect(await screen.findByTestId("review-signoff-credit")).toHaveTextContent(
      "Recommended by editor@example.com, approved by admin@example.com.",
    );
  });

  it("filters the queue to exactly the articles changed since review", async () => {
    const user = userEvent.setup();
    await renderWorkbench("codeine");
    await waitFor(() => expect(screen.getByTestId("review-progress-text")).toHaveTextContent("1 of 4 reviewed"));

    await user.click(screen.getByRole("button", { name: "Queue settings" }));
    await user.click(await screen.findByRole("checkbox", { name: "Changed since review only (2)" }));

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("button", { name: /Changed since review/ }));
    const options = screen.getAllByRole("option").map((node) => node.textContent ?? "");
    expect(options).toHaveLength(2);
    expect(options.some((text) => text.includes("Heroin"))).toBe(true);
    expect(options.some((text) => text.includes("Fentanyl"))).toBe(true);
  });

  it("signs off the revision on screen again with a second R, after the first opens the changes", async () => {
    await renderWorkbench("heroin");
    const notice = await screen.findByRole("region", { name: "Changed since review" });
    fireEvent.keyDown(window, { key: "r" });
    await within(notice).findByLabelText("Article change review");
    fireEvent.keyDown(window, { key: "r" });

    await waitFor(() => expect(postedBodies()).toEqual([{ slug: "heroin", status: "completed", revision: "rev9" }]));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Changed since review" })).toBeNull());
  });

  it("undoes a re-sign-off back to the revision the stale sign-off covered", async () => {
    await renderWorkbench("heroin");
    await screen.findByRole("region", { name: "Changed since review" });
    fireEvent.keyDown(window, { key: "r" });
    await screen.findByRole("button", { name: "Confirm reviewed" });
    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    await screen.findByRole("status");

    fireEvent.keyDown(window, { key: "u" });
    await waitFor(() => expect(postedBodies()[1]).toEqual({ slug: "heroin", status: "completed", revision: "rev1" }));
    await screen.findByRole("region", { name: "Changed since review" });
  });

  describe("the re-sign-off gate", () => {
    it("opens the changes on the first press and writes nothing", async () => {
      await renderWorkbench("heroin");
      const notice = await screen.findByRole("region", { name: "Changed since review" });
      fireEvent.click(screen.getByRole("button", { name: "Mark as reviewed" }));

      expect(await within(notice).findByLabelText("Article change review")).toBeTruthy();
      expect(within(notice).getByRole("button", { name: "Hide changes since review" })).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByRole("button", { name: "Confirm reviewed" })).toBeEnabled();
      expect(screen.getByText("Changes since the last review are shown above.")).toBeVisible();
      expect(postedBodies()).toEqual([]);
    });

    it("signs off with the same request as before on the second press", async () => {
      await renderWorkbench("heroin");
      await screen.findByRole("region", { name: "Changed since review" });
      fireEvent.click(screen.getByRole("button", { name: "Mark as reviewed" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm reviewed" }));

      await waitFor(() => expect(postedBodies()).toEqual([{ slug: "heroin", status: "completed", revision: "rev9" }]));
    });

    it("counts changes opened by hand, so the next press signs off", async () => {
      await renderWorkbench("heroin");
      const notice = await screen.findByRole("region", { name: "Changed since review" });
      fireEvent.click(within(notice).getByRole("button", { name: "Show changes since review" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm reviewed" }));

      await waitFor(() => expect(postedBodies()).toEqual([{ slug: "heroin", status: "completed", revision: "rev9" }]));
    });

    it("keeps an article that is not stale to one step", async () => {
      await renderWorkbench("codeine");
      await waitFor(() => expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeEnabled());
      fireEvent.keyDown(window, { key: "r" });

      await waitFor(() => expect(postedBodies()).toEqual([{ slug: "codeine", status: "completed" }]));
    });

    it("resets when the reviewer moves to another article and back", async () => {
      await renderWorkbench("heroin");
      await screen.findByRole("region", { name: "Changed since review" });
      fireEvent.keyDown(window, { key: "r" });
      await screen.findByRole("button", { name: "Confirm reviewed" });

      fireEvent.keyDown(window, { key: "ArrowRight" });
      await waitFor(() => expect(screen.queryByRole("region", { name: "Changed since review" })).toBeNull());
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      await screen.findByRole("region", { name: "Changed since review" });

      expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Confirm reviewed" })).toBeNull();
      fireEvent.keyDown(window, { key: "r" });
      await screen.findByRole("button", { name: "Confirm reviewed" });
      expect(postedBodies()).toEqual([]);
    });
  });
});
