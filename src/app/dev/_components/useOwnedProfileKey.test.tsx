import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useOwnedProfileKey } from "./useOwnedProfileKey";

describe("useOwnedProfileKey", () => {
  it("paints on the email-derived key before the lookup lands", () => {
    let resolveKey: (key: string | null) => void = () => undefined;
    const pending = new Promise<string | null>((resolve) => {
      resolveKey = resolve;
    });

    const { result } = renderHook(() => useOwnedProfileKey("EDITOR", pending));

    expect(result.current).toBe("EDITOR");
    resolveKey(null);
  });

  it("adopts the canonical key once the lookup resolves", async () => {
    const { result } = renderHook(() =>
      useOwnedProfileKey("EDITOR", Promise.resolve("editor-canonical")),
    );

    await waitFor(() => {
      expect(result.current).toBe("editor-canonical");
    });
  });

  it("keeps the derived key when the lookup resolves without a bound profile", async () => {
    const settled = Promise.resolve(null);
    const { result } = renderHook(() => useOwnedProfileKey("EDITOR", settled));

    await settled;
    expect(result.current).toBe("EDITOR");
  });

  it("keeps the derived key and logs when the lookup rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("Postgres credential rejected");

    const { result } = renderHook(() =>
      useOwnedProfileKey("EDITOR", Promise.reject(failure)),
    );

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Unable to resolve the owned contributor profile key.",
        failure,
      );
    });
    expect(result.current).toBe("EDITOR");
    consoleError.mockRestore();
  });

  it("returns nothing when there is neither a derived key nor a lookup", () => {
    const { result } = renderHook(() => useOwnedProfileKey(undefined, undefined));

    expect(result.current).toBeUndefined();
  });
});
