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

vi.mock("../../hooks/useListboxPositioning", () => ({
  useListboxPositioning: () => ({
    position: null,
    isMobile: false,
  }),
}));

describe("GlobalSearch", () => {
  beforeEach(() => {
    resetBrowserAdapters();
  });

  afterEach(() => {
    cleanupRenderAdapters();
    resetBrowserAdapters();
  });

  it("opens suggestions while active and closes them on blur", async () => {
    mockFetchJson({
      results: [
        {
          id: "substance:lsd-open-close",
          type: "substance",
          label: "LSD",
          slug: "lsd",
          score: 0,
        },
      ],
    });

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

    expect(await screen.findByRole("option", { name: /lsd/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear search/i })).toHaveClass("theme-control-pill-quiet");
    expect(screen.getByLabelText("Best match")).toHaveClass("theme-search-best-match");

    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /lsd/i })).not.toBeInTheDocument();
    });
  });

  it("reports homepage search mode while an active query is present", async () => {
    mockFetchJson({
      results: [
        {
          id: "substance:dmt-mode-check",
          type: "substance",
          label: "DMT",
          slug: "dmt",
          score: 0,
        },
      ],
    });

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

    await screen.findByRole("option", { name: /dmt/i });

    await waitFor(() => {
      expect(onSearchModeChange).toHaveBeenLastCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    await waitFor(() => {
      expect(onSearchModeChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("reuses cached suggestions for the same query across mounts", async () => {
    const fetchSpy = mockFetchJson({
      results: [
        {
          id: "substance:ketamine-cache-check",
          type: "substance",
          label: "Ketamine",
          slug: "ketamine",
          score: 0,
        },
      ],
    });

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

    expect(await screen.findByRole("option", { name: /ketamine/i })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

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

    expect(await screen.findByRole("option", { name: /ketamine/i })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("submits a search query when Enter is pressed without a highlighted suggestion", () => {
    mockFetchJson({ results: [] });

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

  it("navigates to a selected suggestion", async () => {
    mockFetchJson({
      results: [
        {
          id: "substance:lsd-click-select",
          type: "substance",
          label: "LSD",
          slug: "lsd",
          score: 0,
        },
      ],
    });

    const onNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "lsd-click-select" } });

    const option = await screen.findByRole("option", { name: /lsd/i });
    fireEvent.click(option);

    expect(onNavigate).toHaveBeenCalledWith({
      type: "substance",
      slug: "lsd",
    });
  });

  it("navigates report and profile suggestions to their public routes", async () => {
    mockFetchJson({
      results: [
        {
          id: "report:careful-dmt-evening",
          type: "report",
          label: "A careful DMT evening",
          slug: "careful-dmt-evening",
          score: 0,
        },
        {
          id: "profile:ada",
          type: "profile",
          label: "Ada Lovelace",
          slug: "ADA",
          score: 1,
        },
      ],
    });

    const onNavigate = vi.fn();

    renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "substances" }}
        onNavigate={onNavigate}
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ada-select-check" } });
    fireEvent.click(await screen.findByRole("option", { name: /careful dmt/i }));

    expect(onNavigate).toHaveBeenCalledWith({
      type: "report",
      slug: "careful-dmt-evening",
    });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ada-select-check-again" } });
    fireEvent.click(await screen.findByRole("option", { name: /ada lovelace/i }));

    expect(onNavigate).toHaveBeenCalledWith({
      type: "contributor",
      profileKey: "ADA",
    });
  });
});
