import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRenderAdapters,
  installMatchMediaMock,
  mockFetchJson,
  renderWithTestAdapters,
  resetBrowserAdapters,
} from ".";
import { screen } from "@testing-library/react";

afterEach(() => {
  cleanupRenderAdapters();
  resetBrowserAdapters();
});

describe("test environment adapters", () => {
  it("installs and resets browser API mocks", async () => {
    const fetchMock = mockFetchJson({ results: ["ok"] });
    const matchMediaMock = installMatchMediaMock(true);

    await expect(fetch("/search").then((response) => response.json())).resolves.toEqual({
      results: ["ok"],
    });
    expect(fetchMock).toHaveBeenCalledWith("/search");
    expect(window.matchMedia("(min-width: 768px)").matches).toBe(true);
    expect(matchMediaMock).toHaveBeenCalledWith("(min-width: 768px)");

    resetBrowserAdapters();

    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  });

  it("renders through the shared render adapter", () => {
    renderWithTestAdapters(<button type="button">Ready</button>);

    expect(screen.getByRole("button", { name: "Ready" })).toBeInTheDocument();
  });
});
