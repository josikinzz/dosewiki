/**
 * A failed editor-library read shows the load error with a retry instead of
 * holding the loading skeleton forever.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const libraryState = vi.hoisted(() => ({
  current: {
    library: null as unknown,
    isLoading: false,
    error: "Editor library read failed (503)." as string | null,
    requestLibrary: vi.fn(async () => {}),
  },
}));

vi.mock("@/hooks/useLazyLibrary", () => ({ useLazyLibrary: () => libraryState.current }));
vi.mock("@/hooks/useCategoryLayout", () => ({
  useCategoryLayout: () => ({ layout: { version: 1, categories: [] } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/review",
}));
vi.mock("@/features/dev/tools/review-mode/ReviewExperience", () => ({
  ReviewExperience: () => <div data-testid="review-experience" />,
}));

import { ReviewRouteClient } from "./ReviewRouteClient";

beforeEach(() => {
  libraryState.current.requestLibrary.mockClear();
});

describe("ReviewRouteClient", () => {
  it("shows the load error with a retry when the library fails to load", () => {
    render(<ReviewRouteClient />);

    expect(screen.getByText("Editor library read failed (503).")).toBeVisible();
    expect(screen.queryByText("Loading review workbench")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(libraryState.current.requestLibrary).toHaveBeenCalledTimes(1);
  });
});
