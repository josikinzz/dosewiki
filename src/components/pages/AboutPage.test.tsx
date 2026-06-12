import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage public export contract", () => {
  it("keeps archival snapshot actions without the removed explanatory heading", () => {
    render(<AboutPage founderProfiles={[]} previewArticles={[]} missionContent={<p>Mission</p>} />);

    expect(screen.queryByText("Download archival snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/Convex is the live runtime source/i)).not.toBeInTheDocument();
    expect(screen.getByText("Static JSON snapshot")).toBeInTheDocument();
    expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
    expect(screen.queryByText("Full database export")).not.toBeInTheDocument();
  });
});
