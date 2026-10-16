import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { DurationRoute } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";
import {
  hollowDosageRoute,
  dosedRoute,
  hollowDurationRoute,
  timedRoute,
  articleWithRoutes,
  tabNames,
  renderEditing,
  openEditor,
} from "./DosageDurationSection.testHarness";

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

describe("DosageDurationSection route tabs", () => {
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

  it("combines dosage and duration routes that differ only by canonical spelling", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Route Normalization Test",
      dosage: {
        routes: [
          {
            route: "rectal",
            dose_ranges: {
              threshold: { min: 2, max: null, unit: "mg" },
              light: { min: 4, max: 8, unit: "mg" },
              moderate: { min: 8, max: 14, unit: "mg" },
              strong: { min: null, max: null, unit: "mg" },
              heavy: { min: null, max: null, unit: "mg" },
            },
            bioavailability: "",
            bioavailability_notes: "",
            notes: "",
          },
        ],
        plateau_dosing: null,
      },
      duration: {
        routes: [
          {
            route: "Rectal",
            stages: {
              onset: { min: 5, max: 10, unit: "minutes" },
              come_up: { min: null, max: null, unit: "minutes" },
              peak: { min: 1, max: 2, unit: "hours" },
              offset: { min: null, max: null, unit: "hours" },
              after_effects: { min: null, max: null, unit: "hours" },
              total_duration: { min: 3, max: 5, unit: "hours" },
            },
            half_life: "",
            half_life_notes: "",
          },
        ],
      },
    };

    render(<DosageDurationSection article={article} />);

    expect(screen.getAllByRole("tab", { name: "Rectal route" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "Dosage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Duration" })).toBeInTheDocument();
    expect(screen.getByText("4-8 mg")).toBeInTheDocument();
    expect(screen.getByText("5-10 minutes")).toBeInTheDocument();
  });
});

describe("DosageDurationSection public render", () => {
  const populated = () =>
    articleWithRoutes(
      [dosedRoute("oral", { bioavailability: "80%", notes: "Take on an empty stomach." })],
      [timedRoute("oral", { half_life: "3 hours" })],
    );

  it("mounts no editing affordance at all", () => {
    const { container } = render(<DosageDurationSection article={populated()} />);

    expect(container.querySelectorAll("[data-editable-path]")).toHaveLength(0);
    expect(
      container.querySelectorAll('[role="button"][aria-label^="Edit "]'),
    ).toHaveLength(0);
    expect(container.textContent).not.toContain("Add ");
  });
});

function mixedScaleRoute(route: string): DurationRoute {
  return hollowDurationRoute(route, {
    stages: {
      onset: { min: 120, max: 420, unit: "minutes" },
      come_up: { min: 180, max: 360, unit: "minutes" },
      peak: { min: 6, max: 12, unit: "hours" },
      offset: { min: 3, max: 8, unit: "hours" },
      after_effects: { min: 12, max: 36, unit: "hours" },
      total_duration: { min: 24, max: 96, unit: "hours" },
    },
  });
}

describe("DosageDurationSection duration units", () => {
  it("seeds an inline edit from the stored value, not the printed one", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(articleWithRoutes([], [mixedScaleRoute("oral")]));

    expect(screen.getByText("2-7 hours")).toBeInTheDocument();
    const field = await openEditor(user, "Oral onset duration");
    expect(field).toHaveValue("120-420 minutes");

    await user.type(field, "{Enter}");
    expect(commit).not.toHaveBeenCalled();

    const reopened = await openEditor(user, "Oral onset duration");
    await user.clear(reopened);
    await user.type(reopened, "2-7 hours{Enter}");
    expect(commit).toHaveBeenCalledWith(
      "duration.routes[0].stages.onset",
      { min: 2, max: 7, unit: "hours" },
      { min: 120, max: 420, unit: "minutes" },
    );
  });
});
