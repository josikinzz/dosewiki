import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GalleryReplication } from "@/types/replications";
import { EffectIndexHomePage } from "./EffectIndexHomePage";
import type { EffectIndexHomeData } from "./homeModel";

afterEach(() => vi.unstubAllGlobals());

/**
 * The Effect Index homepage layout. These assertions cover the two things most likely to
 * regress: the panel set and its typography voice (mixed-case titles — see the note in
 * HomePanel.tsx), and every panel degrading to nothing rather than to a broken tile when its
 * data resolves empty.
 */

const REPLICATION: GalleryReplication = {
  _id: "rep-1",
  _creationTime: 0,
  slug: "geometry-frog-stingrayz",
  title: "Geometry Frog",
  artist: "StingrayZ",
  type: "video",
  storage_id: "storage",
  effect_slug: "geometry",
  format: "mp4",
  created_at: "2026-01-01T00:00:00.000Z",
  url: "https://example.test/geometry-frog.mp4",
  thumbnail_url: "https://example.test/geometry-frog.webp",
};

const FULL_DATA: EffectIndexHomeData = {
  effectCount: 233,
  effectGroups: [
    {
      id: "visual",
      label: "Visual Effects",
      effects: [
        { name: "Colour shifting", slug: "colour-shifting" },
        { name: "Drifting", slug: "drifting" },
      ],
    },
    {
      id: "cognitive",
      label: "Cognitive Effects",
      effects: [{ name: "Time distortion", slug: "time-distortion" }],
    },
  ],
  featuredArticle: {
    slug: "psychedelic-intensity-scale",
    title: "Psychedelic Intensity Scale",
    authorLine: "Josie Kins",
    dateLabel: "Tuesday, April 20 2021",
    readTimeLabel: "25 min read",
    description: "Inspired by the Shulgin Rating Scale.",
  },
  featuredReports: [
    {
      slug: "hallucinate-everything-mode",
      title: "Hallucinate everything mode",
      author: "Josie",
      substanceName: "2C-E",
      doseLine: "25mg Oral",
    },
  ],
  featuredReplications: [
    {
      replication: REPLICATION,
      introduction: "A replication of ",
      effectSlug: "geometry",
      effectName: "Geometry",
    },
  ],
};

const EMPTY_DATA: EffectIndexHomeData = {
  effectCount: 0,
  effectGroups: [],
  featuredArticle: null,
  featuredReports: [],
  featuredReplications: [],
};

describe("Effect Index homepage", () => {
  it("names the publication in the document's single h1", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    const level1 = screen.getAllByRole("heading", { level: 1 });

    expect(level1).toHaveLength(1);
    expect(level1[0]).toHaveTextContent("Effect Index");
    expect(level1[0].className).toMatch(/\bsr-only\b/);
  });

  it("renders the six panels of the original front page", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    for (const title of [
      "Thank you Emergence Benefactors!",
      "Substance Summaries",
      "Featured Effects",
      "Featured Article",
      "Featured Replications",
      "Featured Reports",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: title }),
      ).toBeInTheDocument();
    }
  });

  it("keeps panel titles mixed case rather than borrowing the uppercase section-head voice", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    const title = screen.getByRole("heading", {
      level: 2,
      name: "Substance Summaries",
    });

    // The Effect Index skin rewrites `theme-accent-heading` and the
    // `--theme-section-heading` utility into uppercase, tracked-out teal. Naming either on a
    // panel title is the specific mistake this asserts against.
    expect(title.className).not.toMatch(/theme-accent-heading/);
    expect(title.className).not.toMatch(/theme-section-heading/);
    expect(title.className).not.toMatch(/\buppercase\b/);
    expect(title).toHaveTextContent("Substance Summaries");
  });

  it("gives sub-group labels inside a panel the uppercase tracked-out teal voice", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    const label = screen.getByRole("heading", {
      level: 3,
      name: "Visual Effects",
    });

    expect(label.className).toMatch(/\buppercase\b/);
    expect(label.className).toMatch(/tracking-\[0\.16em\]/);
    expect(label.className).toMatch(/\btext-dose-accent\b/);
  });

  it("quotes the live effect count in the intro and can reveal the rest of the copy", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(screen.getByText(/contains/).textContent).toContain(
      "233 effect descriptions",
    );

    const toggle = screen.getByRole("button", { name: /read more/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "About Us" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("keeps the collapsed copy out of the accessibility tree until it is revealed", async () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    // The paragraphs stay in the document for crawlers but are `hidden`, so an assistive
    // technology never announces copy the reader has not asked for.
    expect(
      screen.queryByRole("link", { name: "consistent writing style" }),
    ).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /read more/i }));

    expect(screen.getByRole("button", { name: /read less/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "consistent writing style" }),
    ).toHaveAttribute("href", "/documentation-style-guide");
    expect(screen.getByRole("link", { name: "replications" })).toHaveAttribute(
      "href",
      "/replications",
    );
  });

  it("links the intro's lead paragraph to the Subjective Effect Index", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(
      screen.getByRole("link", { name: "Subjective Effect Index" }),
    ).toHaveAttribute("href", "/effects");
  });

  it("points the substance summaries at this codebase's singular summary paths", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(screen.getByRole("link", { name: "Visual," })).toHaveAttribute(
      "href",
      "/psychoactive/psychedelic/visual",
    );
    expect(screen.getByRole("link", { name: "Dissociatives" })).toHaveAttribute(
      "href",
      "/psychoactive/dissociative",
    );
    expect(screen.getByRole("link", { name: "Deliriants" })).toHaveAttribute(
      "href",
      "/psychoactive/deliriant",
    );
  });

  it("carries every panel's stub line", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(
      screen.getAllByRole("link", { name: "articles section." }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Subjective Effect Index." }),
    ).toHaveAttribute("href", "/effects");
    expect(
      screen.getByRole("link", { name: "replications gallery." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "reports section." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Emergence Benefactors" }),
    ).toHaveAttribute("href", "https://ebenefactors.org/");
  });

  it("renders the featured article's byline, date, read time and description", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(
      screen.getByRole("link", { name: "Psychedelic Intensity Scale" }),
    ).toHaveAttribute("href", "/articles/psychedelic-intensity-scale");
    expect(screen.getByText("by Josie Kins")).toBeInTheDocument();
    expect(
      screen.getByText("Tuesday, April 20 2021 · 25 min read"),
    ).toBeInTheDocument();
  });

  it("renders a featured report with its substance, dose and route", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    expect(
      screen.getByRole("link", { name: "Hallucinate everything mode" }),
    ).toHaveAttribute("href", "/reports/hallucinate-everything-mode");
    expect(screen.getByText("2C-E")).toBeInTheDocument();
    expect(screen.getByText("25mg Oral")).toBeInTheDocument();
  });

  it("gives the replication carousel an operable prev/next and a stage linking to the work", () => {
    render(<EffectIndexHomePage {...FULL_DATA} />);

    const carousel = screen.getByRole("group", {
      name: "Featured replications",
    });

    // The label carries the title alone: the creator is rendered as a visible
    // byline just below (asserted separately), so repeating it here duplicated
    // the credit for screen readers.
    // The stage link carries the entry context: the effect article collection.
    expect(
      within(carousel).getByRole("link", { name: /^View Geometry Frog$/ }),
    ).toHaveAttribute("href", `/effects/geometry?viewer=${REPLICATION.slug}`);
    expect(
      within(carousel).getByRole("link", { name: "Geometry" }),
    ).toHaveAttribute("href", "/effects/geometry");
    expect(within(carousel).getByText("by StingrayZ")).toBeInTheDocument();

    // A single-item carousel hides the chevrons; there is nowhere to step to.
    expect(
      within(carousel).queryByRole("button", { name: "Next replication" }),
    ).toBeNull();
  });

  it("keeps the carousel static until motion and viewport gates open", () => {
    const { container } = render(<EffectIndexHomePage {...FULL_DATA} />);

    // jsdom supplies neither matchMedia nor IntersectionObserver. The
    // conservative path must issue no video request and retain the thumbnail
    // inside the same work link.
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="https://example.test/geometry-frog.webp"]',
      ),
    ).toBeInTheDocument();
  });

  it("steps between replications with the chevrons and with the arrow keys", async () => {
    vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    render(
      <EffectIndexHomePage
        {...FULL_DATA}
        featuredReplications={[
          ...FULL_DATA.featuredReplications,
          {
            replication: {
              ...REPLICATION,
              slug: "snek-stingrayz",
              title: "Snek",
            },
            introduction: "A replication of ",
            effectSlug: "drifting",
            effectName: "Drifting",
          },
        ]}
      />,
    );

    const carousel = screen.getByRole("group", {
      name: "Featured replications",
    });
    const next = within(carousel).getByRole("button", {
      name: "Next replication",
    });

    expect(
      within(carousel).getByRole("link", { name: "Geometry" }),
    ).toBeInTheDocument();

    await userEvent.click(next);
    expect(
      within(carousel).getByRole("link", { name: "Drifting" }),
    ).toBeInTheDocument();

    // Wraps at the end, as the original's index arithmetic did.
    await userEvent.click(next);
    expect(
      within(carousel).getByRole("link", { name: "Geometry" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(carousel).getByRole("button", { name: "Previous replication" }),
    );
    expect(
      within(carousel).getByRole("link", { name: "Drifting" }),
    ).toBeInTheDocument();

    // Keyboard operability: arrows work from any control inside the carousel.
    await userEvent.type(
      within(carousel).getByRole("link", { name: /^View Snek$/ }),
      "{ArrowRight}",
    );
    expect(
      within(carousel).getByRole("link", { name: "Geometry" }),
    ).toBeInTheDocument();
  });

  it("drops any panel whose data resolves empty rather than rendering an empty shell", () => {
    render(<EffectIndexHomePage {...EMPTY_DATA} />);

    for (const title of [
      "Featured Effects",
      "Featured Article",
      "Featured Replications",
      "Featured Reports",
    ]) {
      expect(
        screen.queryByRole("heading", { level: 2, name: title }),
      ).toBeNull();
    }

    // The two panels with no data behind them survive, so the page never renders bare.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Thank you Emergence Benefactors!",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Substance Summaries" }),
    ).toBeInTheDocument();
  });
});
