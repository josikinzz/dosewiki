import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReagentData } from "./useReagentData";

describe("useReagentData", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reads one canonical slug from the database-backed route", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useReagentData("1-4-butanediol"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reagent-proxy?slug=1-4-butanediol",
    );
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
