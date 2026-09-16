import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  beginPendingNavigation,
  finishPendingNavigation,
  useNavigationPending,
  type NavigationTransitionId,
} from "./SmartLink";

describe("pending navigation ownership", () => {
  it("keeps overlapping navigation pending until each owning transition finishes", () => {
    const { result } = renderHook(() => useNavigationPending());
    let first!: NavigationTransitionId;
    let second!: NavigationTransitionId;

    act(() => {
      first = beginPendingNavigation();
      second = beginPendingNavigation();
    });
    expect(result.current).toBe(true);

    act(() => finishPendingNavigation(first));
    expect(result.current).toBe(true);

    act(() => {
      finishPendingNavigation(first);
      finishPendingNavigation(second);
    });
    expect(result.current).toBe(false);
  });
});
