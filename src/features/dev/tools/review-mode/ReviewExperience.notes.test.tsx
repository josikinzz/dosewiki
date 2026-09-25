/**
 * A reviewer who holds an article back records why: F opens the notes and
 * flags panel with the cursor in the note, a flag with that note persists
 * through the existing add-flag action, and the next reviewer reads it.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { ReviewFlag, SubstanceArticle } from "@/schema";

// Each case mounts the whole workbench, which is slow under a loaded runner.
vi.setConfig({ testTimeout: 30_000 });

const baseArticle = createEmptyArticle();
const makeArticle = (slug: string, title: string, flags: ReviewFlag[] = []) => ({
  ...baseArticle,
  slug,
  title,
  priority: "normal" as const,
  index_categories: ["opioid"],
  identification: { ...baseArticle.identification, common_name: title },
  editorial_review: { ...baseArticle.editorial_review, status: "needed" as const, flags },
});

const fixtures = vi.hoisted(() => ({
  articles: [] as unknown[],
  /** What the server holds, so a remount reads what the last write stored. */
  storedFlags: [] as ReviewFlag[],
}));

const layout = {
  categories: [{ key: "opioids", label: "Opioids", sections: [], drugs: ["heroin", "morphine"] }],
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { email: "editor@example.com", role: "editor" } } }),
}));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: fixtures.articles,
    sourceArticles: fixtures.articles,
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

function reviewBodies(): Array<Record<string, unknown>> {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => String(url).includes("editorial-review") && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

beforeEach(() => {
  fixtures.storedFlags = [];
  fixtures.articles = [makeArticle("heroin", "Heroin"), makeArticle("morphine", "Morphine")];
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
        const body = JSON.parse(String(init?.body)) as {
          slug: string;
          action?: string;
          flag?: Omit<ReviewFlag, "source" | "created_at">;
          identity?: { created_at: string };
        };
        if (body.action === "add-flag" && body.flag) {
          fixtures.storedFlags = [
            ...fixtures.storedFlags,
            { ...body.flag, source: "human", created_at: "2026-09-24T12:00:00.000Z", created_by: "editor@example.com" },
          ];
        } else if (body.action === "delete-flag") {
          fixtures.storedFlags = fixtures.storedFlags.filter((flag) => flag.created_at !== body.identity?.created_at);
        }
        return new Response(JSON.stringify({ ok: true, slug: body.slug, flags: fixtures.storedFlags }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

async function renderWorkbench() {
  const view = render(<ReviewExperience initialSlug="heroin" />);
  await waitFor(() => expect(view.getAllByTestId("article-layout").length).toBeGreaterThan(0));
  return view;
}

describe("review notes and flags", () => {
  it("opens with F, focused in the note", async () => {
    await renderWorkbench();

    fireEvent.keyDown(window, { key: "f" });
    const panel = await screen.findByRole("region", { name: "Notes and flags" });
    expect(within(panel).getByLabelText("Note")).toHaveFocus();
    // F no longer changes the review status.
    expect(reviewBodies()).toEqual([]);
  });

  it("adds a flag with a note that persists and renders on reload", async () => {
    const view = await renderWorkbench();

    fireEvent.keyDown(window, { key: "f" });
    const panel = await screen.findByRole("region", { name: "Notes and flags" });
    fireEvent.change(within(panel).getByLabelText("Note"), { target: { value: "Dosage table disagrees with the cited source." } });
    fireEvent.change(within(panel).getByLabelText("Flag label"), { target: { value: "incomplete table" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add flag" }));

    await waitFor(() =>
      expect(reviewBodies()).toEqual([
        {
          slug: "heroin",
          action: "add-flag",
          flag: { label: "incomplete table", severity: "minor", note: "Dosage table disagrees with the cited source." },
        },
      ]),
    );
    expect(await within(panel).findByText("Dosage table disagrees with the cited source.")).toBeVisible();

    // A fresh session reads what the server stored.
    view.unmount();
    fixtures.articles = [makeArticle("heroin", "Heroin", fixtures.storedFlags), makeArticle("morphine", "Morphine")];
    await renderWorkbench();
    fireEvent.keyDown(window, { key: "f" });
    const reloaded = await screen.findByRole("region", { name: "Notes and flags" });
    expect(within(reloaded).getByText("Dosage table disagrees with the cited source.")).toBeVisible();
    expect(within(reloaded).getByText("incomplete table")).toBeVisible();
  });

  it("deletes a flag through the delete-flag action", async () => {
    const flag: ReviewFlag = {
      label: "stale data",
      severity: "note",
      note: "Legality predates the 2025 scheduling change.",
      source: "human",
      created_at: "2026-09-01T00:00:00.000Z",
    };
    fixtures.storedFlags = [flag];
    fixtures.articles = [makeArticle("heroin", "Heroin", [flag]), makeArticle("morphine", "Morphine")];
    await renderWorkbench();

    fireEvent.keyDown(window, { key: "f" });
    const panel = await screen.findByRole("region", { name: "Notes and flags" });
    fireEvent.click(within(panel).getByRole("button", { name: "Delete flag stale data" }));

    await waitFor(() =>
      expect(reviewBodies()).toEqual([
        { slug: "heroin", action: "delete-flag", identity: { created_at: flag.created_at, label: "stale data", source: "human" } },
      ]),
    );
    await waitFor(() => expect(within(panel).queryByText(flag.note)).toBeNull());
  });

  it("names the in-progress control Hold", async () => {
    await renderWorkbench();
    fireEvent.click(screen.getAllByRole("button", { name: "Hold" })[0]);
    await waitFor(() => expect(reviewBodies()).toEqual([{ slug: "heroin", status: "in_progress" }]));
    await act(async () => {});
    expect(await screen.findByRole("status")).toHaveTextContent("Held Heroin");
  });
});
