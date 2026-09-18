import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EffectCitationsSection } from "./EffectCitationsSection";

describe("EffectCitationsSection", () => {
  it("renders effect citation groups from the shared projection", () => {
    render(
      <EffectCitationsSection
        seeAlso={[
          { title: "Geometry", location: "/effects/geometry" },
          { title: "Missing effect", location: "/effects/missing-effect" },
        ]}
        externalLinks={[{ title: "EffectIndex", url: "https://effectindex.com" }]}
        citations={[{ text: "Reference paper", url: "https://example.com/paper", from: "paper" }]}
        linkableEffectSlugs={["geometry"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "References" })).toBeInTheDocument();
    expect(screen.getByText("See Also")).toBeInTheDocument();
    expect(screen.getByText("External Links")).toBeInTheDocument();
    expect(screen.getByText("Citations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Geometry" })).toHaveAttribute("href", "/effects/geometry");
    expect(screen.queryByRole("link", { name: "Missing effect" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /EffectIndex/ })).toHaveAttribute("href", "https://effectindex.com");
    expect(screen.getByText("Reference paper").closest("li")).toHaveAttribute("id", "cite-paper");
  });
});
