import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import type { SubstanceArticle } from "@/schema";

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: () => null,
  useInvalidateEditorReads: () => async () => undefined,
}));

vi.mock("@iconify/react", () => ({
  Icon: () => null,
  addCollection: () => {},
  loadIcon: () => Promise.resolve({}),
}));

import { ArticlePreviewFrame, clearArticlePreviewCache } from "./ArticlePreviewFrame";

// The first render of the whole article layout is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  // cmdk scrolls the active item into view; jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView ??= () => {};
});

function article(slug: string, title: string): SubstanceArticle {
  return { ...createEmptyArticle(), slug, title } as unknown as SubstanceArticle;
}

const ARTICLES: Record<string, SubstanceArticle> = {
  diazepam: article("diazepam", "Diazepam"),
  alprazolam: article("alprazolam", "Alprazolam"),
};

function preset(overrides: Partial<WarningBannerPreset>): WarningBannerPreset {
  return {
    key: "preset",
    tone: "danger",
    icon: "custom:benzene",
    severityLabel: "Danger",
    headline: "Headline",
    points: [],
    enabled: true,
    allSubstances: false,
    enabledSlugs: ["diazepam", "alprazolam"],
    ...overrides,
  };
}

const SAVED_DANGER = preset({ key: "benzo-danger", headline: "Saved danger banner" });

let requested: string[] = [];

beforeEach(() => {
  clearArticlePreviewCache();
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const slug = url.searchParams.get("slug") ?? "";
      requested.push(slug);
      const found = url.pathname === "/api/dev/editor-library" ? ARTICLES[slug] : undefined;
      return found
        ? new Response(JSON.stringify({ ok: true, scope: "article", article: found }), { status: 200 })
        : new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
});

function frameOf(name: RegExp) {
  return screen.getByTitle(name) as HTMLIFrameElement;
}

function frameBody(frame: HTMLIFrameElement) {
  return within(frame.contentDocument!.body);
}

describe("ArticlePreviewFrame", () => {
  it("places the draft banner in the article's real stack order, above the article title", async () => {
    // Caution ranks after danger, so the draft lands second whatever order
    // the stored presets arrive in.
    const draft = preset({ key: "a-draft", tone: "caution", severityLabel: "Caution", headline: "Draft caution banner" });
    render(
      <ArticlePreviewFrame
        slug="diazepam"
        draft={{ banner: { preset: draft, presets: [SAVED_DANGER] } }}
      />,
    );

    const frame = frameOf(/Article preview/);
    const body = frameBody(frame);
    await body.findByRole("heading", { level: 1, name: "Diazepam" });

    const saved = body.getByText("Saved danger banner");
    const drafted = body.getByText("Draft caution banner");
    const title = body.getByRole("heading", { level: 1, name: "Diazepam" });
    expect(saved.compareDocumentPosition(drafted) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(drafted.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The frame renders inside its own document, never in the editor's.
    expect(screen.queryByText("Draft caution banner")).not.toBeInTheDocument();
  });

  it("replaces the saved copy of the draft and says when the cap leaves the draft out", async () => {
    const second = preset({ key: "benzo-danger-2", headline: "Second danger banner" });
    const draft = preset({ key: "z-caution", tone: "caution", headline: "Edited caution" });
    const saved = preset({ key: "z-caution", tone: "caution", headline: "Stale caution" });
    render(
      <ArticlePreviewFrame
        slug="diazepam"
        draft={{ banner: { preset: draft, presets: [SAVED_DANGER, second, saved] } }}
      />,
    );

    const body = frameBody(frameOf(/Article preview/));
    await body.findByRole("heading", { level: 1, name: "Diazepam" });
    expect(body.getByText("Saved danger banner")).toBeInTheDocument();
    expect(body.getByText("Second danger banner")).toBeInTheDocument();
    expect(body.queryByText("Stale caution")).not.toBeInTheDocument();
    expect(body.queryByText("Edited caution")).not.toBeInTheDocument();
    expect(screen.getByText(/readers would not see this one/)).toBeInTheDocument();
  });

  it("shows a draft that is not live on this article, and says it is shown as if enabled", async () => {
    const draft = preset({ key: "new-one", enabled: false, enabledSlugs: [], headline: "Not live yet" });
    render(<ArticlePreviewFrame slug="diazepam" draft={{ banner: { preset: draft, presets: [] } }} />);

    const body = frameBody(frameOf(/Article preview/));
    await body.findByRole("heading", { level: 1, name: "Diazepam" });
    expect(body.getByText("Not live yet")).toBeInTheDocument();
    expect(screen.getByText(/Shown as if enabled on Diazepam/)).toBeInTheDocument();
  });

  it("switches the frame's theme and width without touching the editor's theme", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<ArticlePreviewFrame slug="diazepam" />);

    const frame = frameOf(/Article preview/);
    await frameBody(frame).findByRole("heading", { level: 1, name: "Diazepam" });
    const frameRoot = frame.contentDocument!.documentElement;
    expect(frameRoot.dataset.theme).toBe("dark");
    expect(frame.style.width).toBe("1280px");

    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(frameRoot.dataset.theme).toBe("light");
    expect(frameRoot.style.colorScheme).toBe("light");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    // The editor's sheets style the frame, including ones added after mount.
    const sheet = document.createElement("style");
    sheet.textContent = ".late-sheet { color: red; }";
    document.head.appendChild(sheet);
    await waitFor(() =>
      expect(frame.contentDocument!.head.textContent).toContain(".late-sheet"),
    );
    sheet.remove();

    fireEvent.click(screen.getByRole("button", { name: "Phone" }));
    expect(frame.style.width).toBe("390px");
    expect(frame).toHaveAttribute("data-preview-width", "phone");
  });

  it("previews any enabled substance, picked by title", async () => {
    function Harness() {
      const [slug, setSlug] = useState("diazepam");
      return (
        <ArticlePreviewFrame
          slug={slug}
          onSlugChange={setSlug}
          slugOptions={[
            { slug: "diazepam", title: "Diazepam" },
            { slug: "alprazolam", title: "Alprazolam" },
          ]}
          draft={{ banner: { preset: SAVED_DANGER, presets: [SAVED_DANGER] } }}
        />
      );
    }
    render(<Harness />);
    await frameBody(frameOf(/Diazepam/)).findByRole("heading", { level: 1, name: "Diazepam" });

    const picker = screen.getByRole("combobox", { name: "Preview article" });
    expect(picker).toHaveTextContent("Diazepam");
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("option", { name: /^Alprazolam/ }));

    const body = frameBody(frameOf(/Alprazolam/));
    await body.findByRole("heading", { level: 1, name: "Alprazolam" });
    expect(body.getByText("Saved danger banner")).toBeInTheDocument();
    expect(requested).toContain("alprazolam");
  });

  it("keeps the banner stack on screen when the article cannot load", async () => {
    render(
      <ArticlePreviewFrame
        slug="missing"
        draft={{ banner: { preset: SAVED_DANGER, presets: [] } }}
      />,
    );
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
    expect(frameBody(frameOf(/Article preview/)).getByText("Saved danger banner")).toBeInTheDocument();
  });
});
