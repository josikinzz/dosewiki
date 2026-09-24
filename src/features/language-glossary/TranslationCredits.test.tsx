import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslationCredits } from "./TranslationCredits";

const VACUE = {
  key: "VACUE",
  displayName: "Vacue",
  avatarUrl: null,
  href: "https://x.com/Vacue138950",
  contribution: "Chinese localization, terminology review, and localization workflow feedback",
};

describe("TranslationCredits", () => {
  it("lists each credited profile with its link and contribution line", () => {
    render(
      <TranslationCredits
        title="Translation contributors"
        credits={[VACUE, { ...VACUE, key: "SAM", displayName: "Sam", href: "/contributors/sam", contribution: "Review" }]}
      />,
    );

    const region = within(screen.getByRole("region", { name: "Translation contributors" }));
    const external = region.getByRole("link", { name: "Vacue" });
    expect(external).toHaveAttribute("href", "https://x.com/Vacue138950");
    expect(external).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(region.getByText(VACUE.contribution)).toBeInTheDocument();
    expect(region.getByRole("link", { name: "Sam" })).toHaveAttribute("href", "/contributors/sam");
  });

  it("renders nothing when no one is credited", () => {
    const { container } = render(<TranslationCredits title="Translation contributors" credits={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
