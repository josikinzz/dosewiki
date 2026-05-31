import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  fetch: vi.fn(),
  isConvexEnabled: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: mocks.clientQuery }),
  useQuery: mocks.useQuery,
}));

vi.mock("../lib/convex", () => ({
  isConvexEnabled: mocks.isConvexEnabled,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    quotes: {
      getAvailabilityBySlug: "quotes.getAvailabilityBySlug",
      getBySlug: "quotes.getBySlug",
      getBySlugAndSection: "quotes.getBySlugAndSection",
    },
  },
}));

import { useQuote, useQuotesBySlug } from "./useQuotes";

describe("useQuote", () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset();
    mocks.fetch.mockReset();
    mocks.isConvexEnabled.mockReset();
    mocks.useQuery.mockReset();
    mocks.isConvexEnabled.mockReturnValue(true);
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("refetches the current slug and section through the Convex client", async () => {
    mocks.useQuery.mockReturnValue({
      content: "Before",
      updatedAt: "2026-05-01T00:00:00.000Z",
      updatedBy: "EDITOR",
    });
    mocks.clientQuery.mockResolvedValue({
      content: "After",
      updatedAt: "2026-05-02T00:00:00.000Z",
      updatedBy: "REVIEWER",
    });

    const { result } = renderHook(() => useQuote("lsd", "summary"));

    expect(result.current.content).toBe("Before");

    await act(async () => {
      await result.current.refetch();
    });

    expect(mocks.clientQuery).toHaveBeenCalledWith("quotes.getBySlugAndSection", {
      slug: "lsd",
      section: "summary",
    });
    expect(result.current.content).toBe("After");
    expect(result.current.updatedBy).toBe("REVIEWER");
  });

  it("updates local quote state after a successful save so editor evidence state is current", async () => {
    mocks.useQuery.mockReturnValue({
      content: "Before",
      updatedAt: "2026-05-01T00:00:00.000Z",
      updatedBy: "EDITOR",
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        updated: true,
        id: "quote-id",
        updatedBy: "REVIEWER",
      }),
    });

    const { result } = renderHook(() => useQuote("lsd", "summary"));

    await act(async () => {
      await result.current.save("Saved quote", "reviewer");
    });

    expect(mocks.fetch).toHaveBeenCalledWith("/api/save-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "lsd",
        section: "summary",
        content: "Saved quote",
      }),
    });
    expect(result.current.content).toBe("Saved quote");
    expect(result.current.updatedBy).toBe("REVIEWER");
  });

  it("patches slug-level quote state when a quote save event is published", () => {
    mocks.useQuery.mockReturnValue([
      {
        slug: "lsd",
        section: "summary",
        content: "Before",
        updatedAt: "2026-05-01T00:00:00.000Z",
        updatedBy: "EDITOR",
      },
    ]);

    const { result } = renderHook(() => useQuotesBySlug("lsd"));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("dosewiki:quote-saved", {
          detail: {
            slug: "lsd",
            section: "summary",
            content: "After",
            updatedAt: "2026-05-02T00:00:00.000Z",
            updatedBy: "REVIEWER",
          },
        }),
      );
    });

    expect(result.current.quotes).toEqual([
      {
        slug: "lsd",
        section: "summary",
        content: "After",
        updatedAt: "2026-05-02T00:00:00.000Z",
        updatedBy: "REVIEWER",
        isFromConvex: true,
      },
    ]);
  });
});
