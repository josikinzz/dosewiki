import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The explorer inside registers the retired-#gallery redirect on mount; the
// router must be identity-stable like Next's real useRouter.
const { router } = vi.hoisted(() => ({ router: { replace: () => {} } }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSelectedLayoutSegments: () => [],
}));
import { EffectsIndexPage } from "./EffectsIndexPage";

describe("EffectsIndexPage", () => {
  it("owns the skip-link main landmark", () => {
    render(<EffectsIndexPage effects={[]} />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
