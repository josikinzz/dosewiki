import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { GalleryReplication } from "@/types/replications";
import { UserProfilePage } from "./UserProfilePage";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const profile: NormalizedUserProfile = {
  key: "CHELSEA",
  displayName: "Chelsea Morgan",
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [{ label: "chelsea.example", url: "https://chelsea.example/" }],
  hasCustomBio: false,
};

const work: GalleryReplication = {
  _id: "rep-1",
  _creationTime: 0,
  slug: "tracers",
  title: "Tracers",
  artist: "Chelsea Morgan",
  type: "image",
  storage_id: "storage-1",
  effect_slug: "tracers",
  format: "webp",
  created_at: "2024-01-01T00:00:00.000Z",
  url: "https://cdn.test/tracers.webp",
};

describe("UserProfilePage", () => {
  it("renders the works rail for a contributor with replications", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[work]} />);

    expect(
      screen.getByRole("list", { name: "Replications by Chelsea Morgan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tracers/ })).toHaveAttribute(
      "href",
      "/replications/tracers",
    );
  });

  it("renders no works section at all for a contributor with none", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[]} />);

    // Consistent with the trip reports section, which stays absent rather than
    // rendering an empty shell.
    expect(screen.queryByRole("list", { name: /^Replications by/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Replications" })).toBeNull();
    expect(screen.getByText("No public contributions yet")).toBeInTheDocument();
  });

  it("surfaces the contributor's own links beside their name", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[work]} />);

    // An artist's external site lives here now that the replication byline
    // points at this page instead.
    const links = screen.getByRole("navigation", { name: "Chelsea Morgan profile links" });
    expect(links).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chelsea\.example/ })).toHaveAttribute(
      "href",
      "https://chelsea.example/",
    );
  });
});
