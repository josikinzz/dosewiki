import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SearchMatch } from "@/data/builders/search";
import type {
  CategoryDetail,
  ClassificationDetail,
} from "@/data/builders/library";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ReportCardModel } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { CategoryPage } from "./CategoryPage";
import { ClassificationDetailPage } from "./ClassificationDetailPage";
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
        label: "Very Long Public Substance Name",
        secondary:
          "N,N-diethyl-very-long-secondary-name-without-friendly-breakpoints-and-expanded-alias-history",
        slug: "very-long",
        keywords: ["very long"],
        score: 0,
      },
    ];

    render(<FocusedSearchResultsPage query="long" results={results} />);

    const link = screen.getByRole("link", { name: /very long public/i });
    const secondary = screen.getByText(/N,N-diethyl/);

    expect(link).toHaveClass("whitespace-normal");
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

  it("renders classification empty states through shared taxonomy sections", () => {
    const detail: ClassificationDetail = {
      type: "chemical",
      label: "Ergolines",
      slug: "ergolines",
      total: 0,
      drugs: [],
    };

    const { container } = render(<ClassificationDetailPage detail={detail} />);

    expectSingleFocusTarget(container);
    expect(
      screen.getByText("No public substances currently map to this tag."),
    ).toBeInTheDocument();
  });

  it("groups long classification lists alphabetically with responsive structure", () => {
    const detail: ClassificationDetail = {
      type: "psychoactive",
      label: "Psychedelics",
      slug: "psychedelic",
      total: 16,
      drugs: [
        { name: "LSD", slug: "lsd" },
        { name: "Mescaline", slug: "mescaline" },
        { name: "DMT", slug: "dmt" },
        { name: "Psilocybin", slug: "psilocybin" },
        { name: "2C-B", slug: "2c-b" },
        { name: "AL-LAD", slug: "al-lad" },
        { name: "DOM", slug: "dom" },
        { name: "4-HO-MET", slug: "4-ho-met" },
        { name: "5-MeO-DMT", slug: "5-meo-dmt" },
        { name: "MDA", slug: "mda" },
        { name: "DOB", slug: "dob" },
        { name: "DOC", slug: "doc" },
        { name: "25I-NBOMe", slug: "25i-nbome" },
        { name: "Ibogaine", slug: "ibogaine" },
        { name: "Salvinorin A", slug: "salvinorin-a" },
        { name: "LSA", slug: "lsa" },
      ],
    };

    const { container } = render(
      <ClassificationDetailPage detail={detail} drugHrefPrefix="/" />,
    );

    expectSingleFocusTarget(container);
    expect(screen.getByText("16 linked substances")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Psychoactive class/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "A1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "L2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute(
      "href",
      "/lsd",
    );
    expect(
      container.querySelector(".md\\:grid-cols-2.xl\\:grid-cols-3"),
    ).not.toBeNull();
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
