import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage public export contract", () => {
  it("labels the static JSON file as an archival snapshot instead of the live database", () => {
    render(<AboutPage founderProfiles={[]} previewArticles={[]} missionContent={<p>Mission</p>} />);

    expect(screen.getByText("Download archival snapshot")).toBeInTheDocument();
    expect(screen.getByText("Static JSON snapshot")).toBeInTheDocument();
    expect(screen.getByText(/Convex is the live runtime source/i)).toBeInTheDocument();
    expect(screen.queryByText("Full database export")).not.toBeInTheDocument();
  });
});
