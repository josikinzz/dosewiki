import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SearchMatch } from "@/data/builders/search";
import type { CategoryDetail } from "@/data/builders/library";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ReportCardModel } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { CategoryPage } from "./CategoryPage";
import { FocusedSearchResultsPage } from "./FocusedSearchResultsPage";
import { UserProfilePage } from "./UserProfilePage";

const expectSingleFocusTarget = (container: HTMLElement) => {
  const targets = container.querySelectorAll("#main-content");

  expect(targets).toHaveLength(1);
  expect(targets[0]).toHaveAttribute("tabindex", "-1");
};

describe("public page primitive migrations", () => {
  it("preserves focused search highlighting, navigation, and focus target", () => {
    const results: SearchMatch[] = [
      {
        id: "substance:lsd",
        type: "substance",
        label: "LSD",
        secondary: "Lysergic acid diethylamide",
        slug: "lsd",
        keywords: ["lsd", "lysergic"],
        meta: [{ label: "Classes", value: "psychedelic / ergoline" }],
        score: 0,
      },
    ];

    const { container } = render(<FocusedSearchResultsPage query="lsd" results={results} />);

    expectSingleFocusTarget(container);
    expect(screen.getByText("LSD").tagName.toLowerCase()).toBe("mark");
    expect(screen.getByRole("link", { name: /lysergic/i })).toHaveAttribute(
      "href",
      publicHref.substance("lsd"),
    );
  });

  it("keeps long focused search result text constrained inside mobile result rows", () => {
    const results: SearchMatch[] = [
      {
        id: "substance:very-long",
        type: "substance",
        label: "Feelings of fascination, importance and awe",
        secondary:
          "N,N-diethyl-very-long-secondary-name-without-friendly-breakpoints-and-expanded-alias-history",
        slug: "very-long",
        keywords: ["very long"],
        score: 0,
      },
    ];

    render(<FocusedSearchResultsPage query="long" results={results} />);

    const link = screen.getByRole("link", { name: /fascination/i });
    const title = screen.getByText(/Feelings of fascination/);
    const secondary = screen.getByText(/N,N-diethyl/);

    expect(link).toHaveClass("whitespace-normal");
    expect(title).toHaveClass("min-w-0", "max-w-full", "break-words", "[overflow-wrap:anywhere]");
    expect(title).not.toHaveClass("shrink-0");
    expect(secondary).toHaveClass("line-clamp-2");
  });

  it("renders category groups through shared index panels", () => {
    const detail: CategoryDetail = {
      definition: {
        key: "test-category",
        name: "Test category",
        icon: "lucide:layers",
      },
      total: 1,
      groups: [
        {
          name: "Canonical entries",
          drugs: [{ name: "LSD", slug: "lsd" }],
        },
      ],
    };

    const { container } = render(
      <CategoryPage detail={detail} drugHrefPrefix="/" />,
    );

    expectSingleFocusTarget(container);
    expect(
      screen.getByRole("heading", { name: /Canonical entries/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute(
      "href",
      "/lsd",
    );
    expect(screen.getByRole("link", { name: "LSD" })).toHaveClass(
      "theme-index-card-link",
    );
  });

  it("keeps later drug-class effect sections lightweight while preserving effect links", () => {
    const detail: CategoryDetail = {
      definition: {
        key: "psychedelic",
        name: "Psychedelics",
        icon: "lucide:sparkles",
      },
      total: 0,
      groups: [],
    };

    const { container } = render(
      <CategoryPage
        detail={detail}
        drugHrefPrefix="/"
        effects={[
          {
            slug: "visual-brightening",
            name: "Visual brightening",
            tags: ["psychedelic", "visual", "enhancement"],
            summary: "Visual brightening summary",
            long_summary_raw: "Rendered first section summary",
          },
          {
            slug: "visual-drift",
            name: "Visual drift",
            tags: ["psychedelic", "visual", "distortion"],
            summary: "Visual drift summary",
            long_summary_raw: "Rendered second section summary",
          },
          {
            slug: "geometry",
            name: "Geometry",
            tags: ["psychedelic", "visual", "geometric"],
            summary: "Geometry summary",
            long_summary_raw: "Rendered third section summary",
          },
          {
            slug: "external-hallucination",
            name: "External hallucination",
            tags: ["psychedelic", "visual", "hallucinatory state"],
            summary: "External hallucination summary",
            long_summary_raw: "Rendered fourth section summary",
          },
          {
            slug: "cognitive-lift",
            name: "Cognitive lift",
            tags: ["psychedelic", "cognitive", "enhancement"],
            summary: "Cognitive lift summary",
            long_summary_raw: "Deferred cognitive summary body",
          },
        ]}
      />,
    );

    expect(screen.getByText("Rendered first section summary")).toBeInTheDocument();
    expect(screen.queryByText("Deferred cognitive summary body")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cognitive lift" })).toHaveAttribute(
      "href",
      "/effects/cognitive-lift",
    );
    expect(container.querySelector("#cognitive-lift")).not.toBeNull();
  });

  it("renders profile avatar initials and external icon pill links with one focus target", () => {
    const profile: NormalizedUserProfile = {
      key: "JD",
      displayName: "Jane Doe",
      aliases: [],
      avatarUrl: null,
      bio: "Contributor biography",
      links: [{ label: "Website", url: "https://example.com" }],
      hasCustomBio: true,
    };

    const { container } = render(
      <UserProfilePage
        profile={profile}
        history={[]}
        bioContent={<p>Contributor biography</p>}
      />,
    );

    expectSingleFocusTarget(container);
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /website/i })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Trip Reports" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No trip reports yet")).not.toBeInTheDocument();
  });

  it("renders a contributor role beside the handle, and nothing at all without one", () => {
    const base: NormalizedUserProfile = {
      key: "VISCID",
      displayName: "Viscid",
      aliases: ["mark gillis"],
      avatarUrl: null,
      bio: "Legacy Effect Index bio",
      links: [],
      hasCustomBio: true,
    };

    const withRole = render(
      <UserProfilePage
        profile={{ ...base, role: "Former Dev" }}
        history={[]}
        bioContent={<p>Legacy Effect Index bio</p>}
      />,
    );

    const role = withRole.getByTestId("contributor-role");
    expect(role).toHaveTextContent("Former Dev");
    // Shares the muted handle line rather than becoming its own badge.
    expect(role.closest("p")).toHaveTextContent("Former Dev · @viscid");

    withRole.unmount();

    const withoutRole = render(
      <UserProfilePage profile={base} history={[]} bioContent={<p>Legacy Effect Index bio</p>} />,
    );

    expect(withoutRole.queryByTestId("contributor-role")).toBeNull();
    expect(withoutRole.container.textContent).not.toContain("·");
  });

  it("renders profile trip reports when published reports exist", () => {
    const profile: NormalizedUserProfile = {
      key: "JD",
      displayName: "Jane Doe",
      aliases: [],
      avatarUrl: null,
      bio: "Contributor biography",
      links: [],
      hasCustomBio: true,
    };
    const tripReports: ReportCardModel[] = [
      {
        slug: "quiet-mushroom-night",
        title: "Quiet Mushroom Night",
        featured: false,
        subject: {
          name: "Jane Doe",
          profile_key: "JD",
          trip_date: "2026-06-01",
        },
        substances: [{ name: "Psilocybin mushrooms", dose: "1 g" }],
      },
    ];

    render(
      <UserProfilePage
        profile={profile}
        history={[]}
        tripReports={tripReports}
        bioContent={<p>Contributor biography</p>}
        reportHrefPrefix="/reports/"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Trip Reports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Quiet Mushroom Night/i }),
    ).toHaveAttribute("href", "/reports/quiet-mushroom-night");
  });
});
