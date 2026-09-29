import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";
import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import type { SearchManifest } from "@/data/builders/searchManifest";
import type { AppView } from "@/types/navigation";
import { GlobalSearch, LIVE_RESULTS_SETTLE_MS } from "./GlobalSearch";
import { resetSearchSuggestionsCacheForTests } from "./useGlobalSearchSuggestions";

const routing = vi.hoisted(() => ({ request: vi.fn() }));

// Keep the application's result links and search hooks real. Only the Next
// router boundary is replaced so the test controls when a destination commits.
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, onClick, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        routing.request(href);
      }}
    >
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

const MANIFEST: SearchManifest = {
  locale: "en",
  version: "navigation-test",
  shape: 2,
  entries: [{ id: "substance:dmt", type: "substance", slug: "dmt", label: "DMT" }],
};

function setup({ editQuery = true } = {}) {
  const onNavigate = vi.fn();
  const onReplaceNavigate = vi.fn();
  const ui = (view: AppView) => (
    <>
      <GlobalSearch
        currentView={view}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
        compact
      />
      {view.type === "search" ? (
        <LiveSearchResultsPage initialQuery={view.query} initialResults={MANIFEST.entries} />
      ) : (
        <article>DMT article</article>
      )}
    </>
  );
  const rendered = render(ui({ type: "search", query: "d" }));
  const input = screen.getByRole("searchbox");
  fireEvent.focus(input);
  if (editQuery) fireEvent.change(input, { target: { value: "dm" } });
  return { rendered, ui, input, onNavigate, onReplaceNavigate };
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(LIVE_RESULTS_SETTLE_MS);
  });
}

describe("GlobalSearch result navigation ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/search?q=d");
    resetSearchManifestForTests();
    resetSearchSuggestionsCacheForTests();
    routing.request.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(MANIFEST), { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    resetSearchManifestForTests();
    resetSearchSuggestionsCacheForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("does not request search after pointer result activation while the article route is pending", async () => {
    const { onNavigate, onReplaceNavigate } = setup();
    const result = screen.getByRole("link", { name: "DMT" });
    fireEvent.pointerDown(result);
    fireEvent.click(result);
    expect(routing.request).toHaveBeenCalledWith("/dmt");

    await settle();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("does not revive a draft when route departure and debounce completion share an update", async () => {
    const { rendered, ui, onNavigate, onReplaceNavigate } = setup();

    await act(async () => {
      vi.advanceTimersByTime(LIVE_RESULTS_SETTLE_MS);
      rendered.rerender(ui({ type: "substance", slug: "dmt" }));
    });

    expect(screen.getByText("DMT article")).toBeVisible();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("does not request search after keyboard result activation", async () => {
    const { input, onNavigate, onReplaceNavigate } = setup();
    const result = screen.getByRole("link", { name: "DMT" });
    act(() => {
      input.focus();
      result.focus();
    });

    fireEvent.keyDown(result, { key: "Enter" });
    // jsdom does not synthesize a native anchor's keyboard click.
    fireEvent.click(result, { detail: 0 });
    fireEvent.keyUp(result, { key: "Enter" });
    expect(routing.request).toHaveBeenCalledWith("/dmt");
    await settle();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("still settles a draft after a background tap", async () => {
    const { onReplaceNavigate } = setup();
    fireEvent.pointerDown(document.body);
    await settle();
    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "dm" });
  });

  it("lets continued typing start a fresh search after result activation", async () => {
    const { input, onReplaceNavigate } = setup();
    fireEvent.click(screen.getByRole("link", { name: "DMT" }));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dmt" } });
    await settle();
    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "dmt" });
  });

  it.each(["Enter", "search button"])("submits once through %s without a delayed automatic navigation", async (action) => {
    const { input, onNavigate, onReplaceNavigate } = setup();
    if (action === "Enter") {
      fireEvent.keyDown(input, { key: "Enter" });
    } else {
      fireEvent.click(screen.getByRole("button", { name: /^search /i }));
    }
    expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "dm" });

    await settle();

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("clears an outgoing draft without a later navigation", async () => {
    const { input, onNavigate, onReplaceNavigate } = setup();
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(input).toHaveValue("");
    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "" });
    await settle();
    expect(onReplaceNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    { name: "Meta click", click: { metaKey: true } },
    { name: "Control click", click: { ctrlKey: true } },
    { name: "Shift click", click: { shiftKey: true } },
    { name: "Alt click", click: { altKey: true } },
    { name: "middle click", click: { button: 1 } },
    { name: "new-tab link", attribute: ["target", "_blank"] },
    { name: "named-window link", attribute: ["target", "other-window"] },
    { name: "download link", attribute: ["download", "article.html"] },
    { name: "fragment link", attribute: ["href", "#pharmacology"] },
    { name: "empty fragment link", attribute: ["href", "#"] },
    { name: "full same-page anchor", attribute: ["href", "/search?q=d#pharmacology"] },
    { name: "full empty same-page anchor", attribute: ["href", "/search?q=d#"] },
  ])("keeps the current-tab draft for $name", async ({ click, attribute }) => {
    const { onReplaceNavigate } = setup();
    const result = screen.getByRole("link", { name: "DMT" });
    if (attribute) result.setAttribute(attribute[0], attribute[1]);
    fireEvent.pointerDown(result);
    fireEvent.click(result, click);
    await settle();
    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "dm" });
  });

  it.each([
    { href: "/dmt", view: { type: "substance", slug: "dmt" } as AppView },
    { href: "/search?q=lsd", view: { type: "search", query: "lsd" } as AppView },
  ])("follows history to $href without resuming an abandoned draft", async ({ href, view }) => {
    const { rendered, ui, onNavigate, onReplaceNavigate } = setup();
    window.history.replaceState({}, "", href);
    fireEvent(window, new PopStateEvent("popstate"));

    await settle();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
    rendered.rerender(ui(view));
    await settle();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
    if (view.type === "search") {
      expect(screen.getByRole("searchbox")).toHaveValue(view.query);
    } else {
      expect(screen.getByText("DMT article")).toBeVisible();
    }
  });

  it("keeps a pending search through same-page fragment history", async () => {
    const { onReplaceNavigate } = setup();
    window.history.replaceState({}, "", "/search?q=d#pharmacology");
    fireEvent(window, new PopStateEvent("popstate"));
    await settle();
    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "dm" });
  });

  it("keeps the article after an outgoing suggestion HTTP response completes", async () => {
    let resolveSuggestions!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((url) => {
      if (String(url).includes("/api/search-manifest")) {
        return Promise.resolve(new Response(JSON.stringify(MANIFEST), { status: 200 }));
      }
      return new Promise<Response>((resolve) => { resolveSuggestions = resolve; });
    });
    const { rendered, ui, input, onNavigate, onReplaceNavigate } = setup({ editQuery: false });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/api/search-suggestions"))).toBe(true);

    fireEvent.change(input, { target: { value: "dm" } });
    fireEvent.click(screen.getByRole("link", { name: "DMT" }));
    rendered.rerender(ui({ type: "substance", slug: "dmt" }));
    await act(async () => {
      resolveSuggestions(new Response(JSON.stringify({ results: MANIFEST.entries }), { status: 200 }));
    });
    await settle();

    expect(screen.getByText("DMT article")).toBeVisible();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });
});
