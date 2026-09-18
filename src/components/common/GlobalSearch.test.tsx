import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRenderAdapters,
  mockFetchJson,
  renderWithTestAdapters,
  resetBrowserAdapters,
} from "@/test/adapters";

import { GlobalSearch } from "./GlobalSearch";

vi.mock("../../hooks/useDebouncedValue", () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

describe("GlobalSearch", () => {
  beforeEach(() => {
    resetBrowserAdapters();
  });

  afterEach(() => {
    cleanupRenderAdapters();
    resetBrowserAdapters();
  });

  it("keeps the input menu-free and does not fetch suggestions while typing", () => {
    const fetchSpy = mockFetchJson({ results: [] });

    const onNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "lsd-open-close" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    // Focus starts the manifest, while typing itself makes no suggestion request.
    const suggestionCalls = () =>
      fetchSpy.mock.calls.filter(([input]) => String(input).includes("/api/search-suggestions"));
    expect(suggestionCalls()).toEqual([]);
    expect(screen.getByRole("button", { name: /clear search/i })).toHaveClass("theme-control-pill-quiet");

    fireEvent.blur(input);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("reports homepage search mode while an active query is present", async () => {
    const onSearchModeChange = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "home" }}
        onNavigate={vi.fn()}
        onSearchModeChange={onSearchModeChange}
        variant="home"
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dmt-mode-check" } });

    await waitFor(() => {
      expect(onSearchModeChange).toHaveBeenLastCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    await waitFor(() => {
      expect(onSearchModeChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("does not fetch search suggestions across repeated input mounts", () => {
    const fetchSpy = mockFetchJson({ results: [] });

    const onNavigate = vi.fn();

    const first = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const firstInput = screen.getByRole("searchbox", { name: /search the library/i });
    fireEvent.focus(firstInput);
    fireEvent.change(firstInput, { target: { value: "ketamine-cache-check" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const suggestionCalls = () =>
      fetchSpy.mock.calls.filter(([input]) => String(input).includes("/api/search-suggestions"));
    // The shared manifest may load on focus; typing itself must not refine eagerly.
    expect(suggestionCalls()).toEqual([]);

    first.unmount();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const secondInput = screen.getByRole("searchbox", { name: /search the library/i });
    fireEvent.focus(secondInput);
    fireEvent.change(secondInput, { target: { value: "ketamine-cache-check" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(suggestionCalls()).toEqual([]);
  });

  it("submits a search query when Enter is pressed", () => {
    const onNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "mescaline-submit-check" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onNavigate).toHaveBeenCalledWith({
      type: "search",
      query: "mescaline-submit-check",
    });
  });

  it("does not re-open live search from stale query state after route changes away", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "dmt" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("searchbox", { name: /search the library/i })).toHaveValue("dmt");
    });

    onNavigate.mockClear();
    onReplaceNavigate.mockClear();

    rendered.rerender(
      <GlobalSearch
        currentView={{ type: "substance", slug: "dmt" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("does not replace-navigate while live search is already on the same query", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "dmt" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("searchbox", { name: /search the library/i })).toHaveValue("dmt");
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onReplaceNavigate).not.toHaveBeenCalled();
  });

  it("keeps live search typing local when a stale search route render arrives", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "d" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dm" } });

    rendered.rerender(
      <GlobalSearch
        currentView={{ type: "search", query: "d" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    expect(input).toHaveValue("dm");
  });

  it("keeps a live search draft when a stale non-search route render arrives", () => {
    const onNavigate = vi.fn();
    const onLiveNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substance", slug: "dmt" }}
        onNavigate={onNavigate}
        onLiveNavigate={onLiveNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "d" } });

    rendered.rerender(
      <GlobalSearch
        currentView={{ type: "substance", slug: "dmt" }}
        onNavigate={onNavigate}
        onLiveNavigate={onLiveNavigate}
        liveResultsMode
      />,
    );

    expect(input).toHaveValue("d");
  });

  it("restores focus after live search enters the search route while typing", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <>
        <button type="button">Route focus target</button>
        <GlobalSearch
          currentView={{ type: "substance", slug: "dmt" }}
          onNavigate={onNavigate}
          onReplaceNavigate={onReplaceNavigate}
          liveResultsMode
        />
      </>,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "d" } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "d" });
    });

    screen.getByRole("button", { name: /route focus target/i }).focus();
    expect(input).not.toHaveFocus();

    rendered.rerender(
      <>
        <button type="button">Route focus target</button>
        <GlobalSearch
          currentView={{ type: "search", query: "d" }}
          onNavigate={onNavigate}
          onReplaceNavigate={onReplaceNavigate}
          liveResultsMode
        />
      </>,
    );

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it("does not restore live search focus after an intentional outside pointer action", async () => {
    const onNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <>
        <button type="button">Outside action</button>
        <GlobalSearch
          currentView={{ type: "substance", slug: "dmt" }}
          onNavigate={onNavigate}
          liveResultsMode
        />
      </>,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });
    const outsideButton = screen.getByRole("button", { name: /outside action/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "d" } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "d" });
    });

    fireEvent.pointerDown(outsideButton);
    outsideButton.focus();

    rendered.rerender(
      <>
        <button type="button">Outside action</button>
        <GlobalSearch
          currentView={{ type: "search", query: "d" }}
          onNavigate={onNavigate}
          liveResultsMode
        />
      </>,
    );

    expect(input).not.toHaveFocus();
  });

  it("uses the live navigation handler when typing enters search results", async () => {
    const onNavigate = vi.fn();
    const onLiveNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substance", slug: "dmt" }}
        onNavigate={onNavigate}
        onLiveNavigate={onLiveNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "d" } });

    await waitFor(() => {
      expect(onLiveNavigate).toHaveBeenCalledWith({ type: "search", query: "d" });
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("returns to the previous view when clearing live search", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substance", slug: "mdma" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "molly" } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "molly" });
    });

    rendered.rerender(
      <GlobalSearch
        currentView={{ type: "search", query: "molly" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    onNavigate.mockClear();
    onReplaceNavigate.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "substance", slug: "mdma" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("returns to the previous view when live search remounts on the search route", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substance", slug: "mdma" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "molly" } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "molly" });
    });

    rendered.unmount();
    onNavigate.mockClear();
    onReplaceNavigate.mockClear();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "molly" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "substance", slug: "mdma" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("returns to any previous non-search view when clearing remounted live search", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "effect", effectSlug: "tracers" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "molly" } });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith({ type: "search", query: "molly" });
    });

    rendered.unmount();
    onNavigate.mockClear();
    onReplaceNavigate.mockClear();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "molly" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "effect", effectSlug: "tracers" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

});
