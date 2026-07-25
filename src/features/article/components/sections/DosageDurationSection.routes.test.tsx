import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { DosageRoute, DurationRoute, SubstanceArticle } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({
      children,
      animate: _animate,
      exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div data-motion-exit={exit ? "true" : undefined} {...props}>
        {children}
      </div>
    ),
  },
  useReducedMotion: () => false,
}));

/**
 * The shape generators scaffold when a source merely mentions a route: every
 * tier present, every value null.
 */
function hollowDosageRoute(route: string, overrides: Partial<DosageRoute> = {}): DosageRoute {
  const nullDose = { min: null, max: null, unit: "mg" };
  return {
    route,
    dose_ranges: {
      threshold: { ...nullDose },
      light: { ...nullDose },
      moderate: { ...nullDose },
      strong: { ...nullDose },
      heavy: { ...nullDose },
    },
    bioavailability: "",
    bioavailability_notes: "",
    notes: "",
    ...overrides,
  };
}

function dosedRoute(route: string, overrides: Partial<DosageRoute> = {}): DosageRoute {
  return hollowDosageRoute(route, {
    dose_ranges: {
      threshold: { min: 2, max: null, unit: "mg" },
      light: { min: 4, max: 8, unit: "mg" },
      moderate: { min: 8, max: 14, unit: "mg" },
      strong: { min: null, max: null, unit: "mg" },
      heavy: { min: null, max: null, unit: "mg" },
    },
    ...overrides,
  });
}

function hollowDurationRoute(route: string, overrides: Partial<DurationRoute> = {}): DurationRoute {
  const nullStage = { min: null, max: null, unit: "min" };
  return {
    route,
    stages: {
      onset: { ...nullStage },
      come_up: { ...nullStage },
      peak: { ...nullStage },
      offset: { ...nullStage },
      after_effects: { ...nullStage },
      total_duration: { ...nullStage },
    },
    half_life: "",
    half_life_notes: "",
    ...overrides,
  };
}

function timedRoute(route: string, overrides: Partial<DurationRoute> = {}): DurationRoute {
  return hollowDurationRoute(route, {
    stages: {
      onset: { min: 5, max: 10, unit: "minutes" },
      come_up: { min: null, max: null, unit: "minutes" },
      peak: { min: 1, max: 2, unit: "hours" },
      offset: { min: null, max: null, unit: "hours" },
      after_effects: { min: null, max: null, unit: "hours" },
      total_duration: { min: 3, max: 5, unit: "hours" },
    },
    ...overrides,
  });
}

function articleWithRoutes(
  dosageRoutes: DosageRoute[],
  durationRoutes: DurationRoute[],
): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    title: "Route Presence Test",
    dosage: { routes: dosageRoutes, plateau_dosing: null },
    duration: { routes: durationRoutes },
  };
}

function tabNames(): string[] {
  return screen.queryAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? "");
}

describe("DosageDurationSection route tabs", () => {
  it("drops routes that are hollow on both sides", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [dosedRoute("oral"), hollowDosageRoute("insufflated"), hollowDosageRoute("rectal")],
          [timedRoute("oral"), hollowDurationRoute("insufflated")],
        )}
      />,
    );

    expect(tabNames()).toEqual(["Oral route"]);
    expect(screen.queryByRole("tab", { name: "Insufflated route" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Rectal route" })).not.toBeInTheDocument();
  });

  it("keeps a route documented only by its duration", async () => {
    const user = userEvent.setup();
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [dosedRoute("oral"), hollowDosageRoute("sublingual")],
          [timedRoute("oral"), timedRoute("sublingual")],
        )}
      />,
    );

    const sublingual = screen.getByRole("tab", { name: "Sublingual route" });
    await user.click(sublingual);

    expect(screen.getByRole("heading", { level: 3, name: "Duration" })).toBeInTheDocument();
    // The hollow dosage scaffold for this route must not render an empty table.
    expect(screen.queryByRole("heading", { level: 3, name: "Dosage" })).not.toBeInTheDocument();
    expect(screen.getByText("5-10 minutes")).toBeInTheDocument();
  });

  it("keeps a route whose only dosage content is prose", async () => {
    const user = userEvent.setup();
    const notes = "Extract potency is unstandardized, so no dose ladder is published.";
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [dosedRoute("oral"), hollowDosageRoute("smoked", { notes })],
          [timedRoute("oral")],
        )}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Smoked route" }));

    expect(screen.getByRole("heading", { level: 3, name: "Dosage" })).toBeInTheDocument();
    expect(screen.getByText(notes)).toBeInTheDocument();
  });

  it("opens on a route documented on both sides rather than the first dosage route", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [dosedRoute("oral"), dosedRoute("insufflated")],
          [timedRoute("insufflated")],
        )}
      />,
    );

    expect(screen.getByRole("tab", { name: "Oral route" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Insufflated route" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Dosage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Duration" })).toBeInTheDocument();
  });

  it("falls back to the gap notice when every route is hollow scaffolding", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [hollowDosageRoute("oral"), hollowDosageRoute("insufflated")],
          [hollowDurationRoute("oral"), hollowDurationRoute("insufflated")],
        )}
      />,
    );

    expect(screen.getByText("Dosage & Duration not written up yet")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("heading", { level: 3, name: "Dosage" })).not.toBeInTheDocument();
  });

  it("renders the populated sibling when two raw routes share a canonical name", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [hollowDosageRoute("intranasal"), dosedRoute("snorted")],
          [hollowDurationRoute("intranasal"), timedRoute("snorted")],
        )}
      />,
    );

    expect(tabNames()).toEqual(["Insufflated route"]);
    expect(screen.getByText("4-8 mg")).toBeInTheDocument();
    expect(screen.getByText("5-10 minutes")).toBeInTheDocument();
  });
});
