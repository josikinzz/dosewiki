import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContributorEffectCredit } from "@/types/effectCredits";
import { UserProfileEffectCreditsSection } from "./UserProfileEffectCreditsSection";

const credits = (count: number): ContributorEffectCredit[] =>
  Array.from({ length: count }, (_, index) => ({
    slug: `effect-${index + 1}`,
    name: `Effect ${index + 1}`,
  }));

describe("UserProfileEffectCreditsSection", () => {
  it("renders a single credit as one tag with no disclosure", () => {
    render(
      <UserProfileEffectCreditsSection
        credits={[{ slug: "brightness-alteration", name: "Brightness alteration" }]}
        contributorName="Viscid"
      />,
    );

    expect(screen.getByRole("link", { name: "Brightness alteration" })).toHaveAttribute(
      "href",
      "/effects/brightness-alteration",
    );
    // Nothing to expand at one entry, so the count and the list do not repeat
    // the same information twice.
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("keeps a mid-sized list wholly inline", () => {
    render(<UserProfileEffectCreditsSection credits={credits(10)} contributorName="liv" />);

    expect(screen.getAllByRole("link")).toHaveLength(10);
    expect(screen.queryByText(/^The other/)).toBeNull();
  });

  it("caps the visible tags and puts the rest behind a native disclosure", () => {
    render(<UserProfileEffectCreditsSection credits={credits(225)} contributorName="Josie Kins" />);

    // The count is on the heading, so the reader is told 225 without 225 tags
    // pushing the rest of the profile off the page.
    expect(screen.getByRole("heading", { name: "Effect articles" })).toBeInTheDocument();
    expect(screen.getByText("225")).toBeInTheDocument();

    const preview = screen.getByRole("list", {
      name: "Effect articles Josie Kins contributed to",
    });
    expect(within(preview).getAllByRole("link")).toHaveLength(24);

    // Everything is still in the document and still reachable without
    // JavaScript — <details> hides it, it is not dropped.
    expect(screen.getByText("The other 201")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(225);
    expect(screen.getByRole("link", { name: "Effect 225" })).toHaveAttribute(
      "href",
      "/effects/effect-225",
    );
  });

  it("renders nothing at all for a contributor credited on no article", () => {
    const { container } = render(
      <UserProfileEffectCreditsSection credits={[]} contributorName="Lyrea" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the effect's display name rather than its slug", () => {
    render(
      <UserProfileEffectCreditsSection
        credits={[{ slug: "object-alteration", name: "Object alteration" }]}
        contributorName="Kaytwo"
      />,
    );

    expect(screen.getByText("Object alteration")).toBeInTheDocument();
    expect(screen.queryByText("object-alteration")).toBeNull();
  });
});
