import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReagentData } from "./useReagentData";

describe("useReagentData", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("checks all ProtestKit aliases in one request and treats no match as empty data", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useReagentData("1,4-Butanediol", ["BDO", "Butylene Glycol"]),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reagent-proxy?substance=14-butanediol&alias=bdo&alias=butyleneglycol",
    );
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
