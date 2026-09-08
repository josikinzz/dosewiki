import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryReplication } from "@/types/replications";
import { ContributorWorksCarousel } from "./ContributorWorksCarousel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const work = (slug: string, effect_slug = "tracers"): GalleryReplication => ({
  _id: `id-${slug}`,
  _creationTime: 0,
  slug,
  title: slug,
  artist: "Chelsea Morgan",
  type: "image",
  storage_id: `storage-${slug}`,
  effect_slug,
  format: "webp",
  created_at: "2024-01-01T00:00:00.000Z",
  url: `https://cdn.test/${slug}.webp`,
});

// jsdom implements no scrolling and does not even define the method, so it has
// to be installed rather than spied on.
const scrollIntoView = vi.fn();

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: scrollIntoView,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  scrollIntoView.mockClear();
});

describe("ContributorWorksCarousel", () => {
  it("renders nothing for a contributor with no works", () => {
    const { container } = render(
      <ContributorWorksCarousel works={[]} contributorName="Chelsea Morgan" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders every work as a linked tile under a named rail", () => {
    render(
      <ContributorWorksCarousel
        works={[work("a"), work("b")]}
        contributorName="Chelsea Morgan"
      />,
    );

    expect(
      screen.getByRole("list", { name: "Replications by Chelsea Morgan" }),
    ).toBeInTheDocument();
    // Artist context: the tile opens the viewer walking this artist's works,
    // keyed by the credit line's gallery artist key. The name is anchored to
    // the title's own start because every tile's accessible name now ends with
    // the corner chip's medium marker.
    expect(screen.getByRole("link", { name: /^a,/ })).toHaveAttribute(
      "href",
      "/replications/artist/chelsea-morgan?viewer=a",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows no stepper for a single work", () => {
    render(
      <ContributorWorksCarousel
        works={[work("a")]}
        contributorName="Chelsea Morgan"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /replication by/i }),
    ).toBeNull();
  });

  it("steps forwards and stops at the end rather than wrapping", async () => {
    const user = userEvent.setup();
    render(
      <ContributorWorksCarousel
        works={[work("a"), work("b")]}
        contributorName="Chelsea Morgan"
      />,
    );

    const next = screen.getByRole("button", {
      name: "Next replication by Chelsea Morgan",
    });
    const previous = screen.getByRole("button", {
      name: "Previous replication by Chelsea Morgan",
    });

    // The rail opens at the first work, so there is nowhere back to go.
    expect(previous).toBeDisabled();

    await user.click(next);

    expect(scrollIntoView).toHaveBeenCalled();
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
  });

  it("steps on left/right arrow keys from the controls", async () => {
    const user = userEvent.setup();
    render(
      <ContributorWorksCarousel
        works={[work("a"), work("b")]}
        contributorName="Chelsea Morgan"
      />,
    );

    const next = screen.getByRole("button", {
      name: "Next replication by Chelsea Morgan",
    });
    next.focus();
    await user.keyboard("{ArrowRight}");

    expect(next).toBeDisabled();
  });

  it("withholds a work whose effect is kept out of artist views", () => {
    render(
      <ContributorWorksCarousel
        works={[work("a"), work("b", "unspeakable-horrors")]}
        contributorName="Chelsea Morgan"
      />,
    );

    // A profile is an artist surface, so the rail shows one work and says so;
    // the withheld work is still on /replications/b and under its effect.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /b/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /replication by/i }),
    ).toBeNull();
  });

  it("renders nothing for a contributor whose every work is withheld", () => {
    const { container } = render(
      <ContributorWorksCarousel
        works={[work("a", "unspeakable-horrors")]}
        contributorName="Chelsea Morgan"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
