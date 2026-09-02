import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtistIdentityHeader } from "./ArtistIdentityHeader";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

function renderHeader(
  overrides: Partial<Parameters<typeof ArtistIdentityHeader>[0]> = {},
) {
  return render(
    <ArtistIdentityHeader
      name="Loka"
      browseAllHref="/replications?view=artist"
      attributed
      avatarUrl={null}
      links={[]}
      counts={{ count: 3, imageCount: 1, videoCount: 2 }}
      {...overrides}
    />,
  );
}

describe("ArtistIdentityHeader status pills", () => {
  it("spells the index's star out as an Approved replicator pill", () => {
    renderHeader({ approvedReplicator: true });

    expect(screen.getByTestId("approved-replicator-badge")).toHaveTextContent(
      "Approved replicator",
    );
    expect(screen.queryByTestId("verified-replicator-badge")).toBeNull();
  });

  it("shows approval and verification side by side, and neither by default", () => {
    const { unmount } = renderHeader({
      approvedReplicator: true,
      verifiedReplicator: true,
    });
    expect(screen.getByTestId("approved-replicator-badge")).toBeInTheDocument();
    expect(screen.getByTestId("verified-replicator-badge")).toBeInTheDocument();
    unmount();

    renderHeader();
    expect(screen.queryByTestId("approved-replicator-badge")).toBeNull();
    expect(screen.queryByTestId("verified-replicator-badge")).toBeNull();
  });
});
