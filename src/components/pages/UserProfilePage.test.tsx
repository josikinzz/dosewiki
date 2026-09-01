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
  it("renders the reviewed verified-replicator badge only for a verified profile", () => {
    const { rerender } = render(
      <UserProfilePage profile={profile} history={[]} verifiedReplicator />,
    );
    expect(screen.getByTestId("verified-replicator-badge")).toHaveTextContent(
      "Verified replicator",
    );

    rerender(<UserProfilePage profile={profile} history={[]} />);
    expect(screen.queryByTestId("verified-replicator-badge")).toBeNull();
  });

  it("renders the works rail for a contributor with replications", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[work]} />);

    expect(
      screen.getByRole("list", { name: "Replications by Chelsea Morgan" }),
    ).toBeInTheDocument();
    // A profile's works listing opens the shared viewer over the artist page.
    expect(screen.getByRole("link", { name: /Tracers/ })).toHaveAttribute(
      "href",
      "/replications/artist/chelsea-morgan?viewer=tracers",
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

  it("lists the effect articles a contributor worked on, between their works and their writing", () => {
    render(
      <UserProfilePage
        profile={profile}
        history={[]}
        replications={[work]}
        effectArticles={[
          { slug: "tracers", name: "Tracers" },
          { slug: "geometry", name: "Geometry" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Effect articles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Geometry" })).toHaveAttribute("href", "/effects/geometry");

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Replications", "Effect articles"]);
  });

  it("renders no article section at all for a contributor credited on none", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[work]} effectArticles={[]} />);

    expect(screen.queryByRole("heading", { name: "Effect articles" })).toBeNull();
  });

  it("counts article credits alone as public contributions", () => {
    render(
      <UserProfilePage
        profile={profile}
        history={[]}
        effectArticles={[{ slug: "tracers", name: "Tracers" }]}
      />,
    );

    // Without this, a contributor whose only credit is article work would be
    // told they have nothing published while their credits sat one query away.
    expect(screen.queryByText("No public contributions yet")).toBeNull();
    expect(screen.getByRole("link", { name: "Tracers" })).toBeInTheDocument();
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

  it("shows the archival notice under the handle only for an archival profile", () => {
    const { rerender } = render(
      <UserProfilePage profile={{ ...profile, archival: true }} history={[]} />,
    );

    const notice = screen.getByTestId("archival-notice");
    expect(notice).toHaveTextContent("Archival profile");
    expect(notice).toHaveTextContent("maintained by staff, not created by this person.");

    rerender(<UserProfilePage profile={profile} history={[]} />);
    expect(screen.queryByTestId("archival-notice")).toBeNull();
  });

  it("renders the editor's note as a signed section under the bio, and nothing without one", () => {
    render(
      <UserProfilePage
        profile={profile}
        history={[]}
        editorNote={{
          content: <p>A staff note.</p>,
          attribution: "Josie Kins · founder",
          avatarUrl: "https://cdn.test/josie.webp",
          avatarHref: "/contributors/josie",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Editor's note" })).toBeInTheDocument();
    expect(screen.getByText("A staff note.")).toBeInTheDocument();
    expect(screen.getByText("Josie Kins · founder")).toBeInTheDocument();
    expect(screen.getByAltText("Josie Kins · founder")).toHaveAttribute(
      "src",
      "https://cdn.test/josie.webp",
    );
    // A note alone counts as a public section: the empty-state card must not
    // sit beside it.
    expect(screen.queryByText("No public contributions yet")).toBeNull();
  });

  it("renders no editor's note section at all when the profile has none", () => {
    render(<UserProfilePage profile={profile} history={[]} replications={[work]} />);
    expect(screen.queryByRole("heading", { name: "Editor's note" })).toBeNull();
    expect(screen.queryByTestId("editor-note")).toBeNull();
  });
});
