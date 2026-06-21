import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EffectsIndexPage } from "./EffectsIndexPage";

describe("EffectsIndexPage", () => {
  it("owns the skip-link main landmark", () => {
    render(<EffectsIndexPage effects={[]} />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
