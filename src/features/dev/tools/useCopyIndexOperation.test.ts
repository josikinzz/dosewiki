import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CopyIndexRefusal, useCopyIndexOperation } from "./useCopyIndexOperation";

describe("useCopyIndexOperation", () => {
  it("holds a 5xx as unconfirmed, so only the same request may follow", () => {
    const { result } = renderHook(() => useCopyIndexOperation());
    act(() => void result.current.serialize({ key: "a", body: "one" }));
    act(() => {
      expect(() => result.current.acknowledge({ ok: false, status: 500 }, { error: "Server fell over." })).toThrow("Server fell over.");
    });
    expect(result.current.uncertain).toBe(true);
    expect(() => result.current.serialize({ key: "a", body: "two" })).toThrow(/no confirmed outcome/);
  });

  it("treats the write freeze as a definite refusal and names it", () => {
    const { result } = renderHook(() => useCopyIndexOperation());
    act(() => void result.current.serialize({ key: "a", body: "one" }));
    let thrown: unknown;
    act(() => {
      try {
        result.current.acknowledge({ ok: false, status: 503 }, { error: "Frozen.", code: "DATA_WRITES_FROZEN" });
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBeInstanceOf(CopyIndexRefusal);
    expect((thrown as CopyIndexRefusal).frozen).toBe(true);
    expect(result.current.uncertain).toBe(false);
    expect(() => result.current.serialize({ key: "a", body: "two" })).not.toThrow();
  });

  it("marks a revision conflict", () => {
    const { result } = renderHook(() => useCopyIndexOperation());
    act(() => void result.current.serialize({ key: "a" }));
    let thrown: unknown;
    act(() => {
      try {
        result.current.acknowledge({ ok: false, status: 409 }, { error: "Changed.", code: "EDIT_CONFLICT" });
      } catch (error) {
        thrown = error;
      }
    });
    expect((thrown as CopyIndexRefusal).conflict).toBe(true);
    expect((thrown as Error).message).toBe("Changed.");
  });
});
