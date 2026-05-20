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

    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /lsd/i })).not.toBeInTheDocument();
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
});
