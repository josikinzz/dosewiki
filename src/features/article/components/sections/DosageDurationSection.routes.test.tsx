import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { DurationRoute } from "@/schema";
import { DosageDurationSection } from "./DosageDurationSection";
import { DOSAGE_PANEL_DISCLAIMER_FALLBACK } from "./articleDisclaimerCopy";
import {
  hollowDosageRoute,
  dosedRoute,
  hollowDurationRoute,
  timedRoute,
  articleWithRoutes,
  tabNames,
  renderEditing,
  tierLabels,
  stageLabels,
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

  it("opens on the first listed route even when a later route is documented on both sides", () => {
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
      "true",
    );
    expect(screen.getByRole("tab", { name: "Insufflated route" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Dosage" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Duration" })).not.toBeInTheDocument();
  });

  it("follows the authored route order when it is rearranged", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [dosedRoute("insufflated"), dosedRoute("oral")],
          [timedRoute("insufflated"), timedRoute("oral")],
        )}
      />,
    );

    expect(tabNames()).toEqual(["Insufflated route", "Oral route"]);
    expect(screen.getByRole("tab", { name: "Insufflated route" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("skips a leading route with nothing to show", () => {
    render(
      <DosageDurationSection
        article={articleWithRoutes(
          [hollowDosageRoute("oral"), dosedRoute("smoked")],
          [hollowDurationRoute("oral"), timedRoute("smoked")],
        )}
      />,
    );

    expect(tabNames()).toEqual(["Smoked route"]);
    expect(screen.getByRole("tab", { name: "Smoked route" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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

  it("renders dosage route tabs and expands note details", () => {
    const article = {
      ...createEmptyArticle(),
      title: "DXM Test",
      dosage: {
        routes: [
          {
            route: "oral",
            dose_ranges: {
              threshold: { min: 30, max: null, unit: "mg" },
              light: { min: 60, max: 120, unit: "mg" },
              moderate: { min: 120, max: 240, unit: "mg" },
              strong: { min: 240, max: 360, unit: "mg" },
              heavy: { min: 360, max: null, unit: "mg" },
            },
            bioavailability: "11-13%",
            bioavailability_notes: "Fasted onset is more reliable.",
            notes: "Standard oral route.",
          },
        ],
        plateau_dosing: {
          first_plateau: { min: 100, max: 200, unit: "mg/kg", effects: "Mild stimulation." },
          second_plateau: { min: 200, max: 300, unit: "mg/kg", effects: "" },
          third_plateau: { min: 300, max: 400, unit: "mg/kg", effects: "" },
          fourth_plateau: { min: 400, max: 500, unit: "mg/kg", effects: "" },
          fifth_plateau: { min: null, max: null, unit: "mg/kg", effects: "Dissociation via redosing." },
          notes: "Plateau notes.",
        },
      },
      duration: {
        routes: [
          {
            route: "oral",
            stages: {
              onset: { min: 20, max: 40, unit: "min" },
              come_up: { min: null, max: null, unit: "min" },
              peak: { min: 2, max: 3, unit: "hr" },
              offset: { min: 4, max: 6, unit: "hr" },
              after_effects: { min: null, max: null, unit: "hr" },
              total_duration: { min: 6, max: 8, unit: "hr" },
            },
            half_life: "3-4 hr",
            half_life_notes: "Extended by CYP2D6 inhibition.",
          },
        ],
      },
    };

    render(<DosageDurationSection article={article} />);

    expect(screen.getByRole("heading", { level: 2, name: "Dosage & Duration" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Dosage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Duration" })).toBeInTheDocument();

    const bioavailabilityButton = screen.getByRole("button", {
      name: "Expand Oral bioavailability notes",
    });
    expect(bioavailabilityButton).toHaveAttribute(
      "aria-controls",
      "dosage-oral-bioavailability-notes",
    );
    fireEvent.click(bioavailabilityButton);
    expect(screen.getByText("Fasted onset is more reliable.")).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "Plateau" })).toBeInTheDocument();
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

  it("switches route tables without an exit animation wrapper", async () => {
    const user = userEvent.setup();
    const article = {
      ...createEmptyArticle(),
      title: "Route Switch Test",
      dosage: {
        routes: [
          {
            route: "oral",
            dose_ranges: {
              threshold: { min: 5, max: null, unit: "mg" },
              light: { min: 10, max: 15, unit: "mg" },
              moderate: { min: 15, max: 25, unit: "mg" },
              strong: { min: null, max: null, unit: "mg" },
              heavy: { min: null, max: null, unit: "mg" },
            },
            bioavailability: "",
            bioavailability_notes: "",
            notes: "",
          },
          {
            route: "insufflated",
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
            route: "oral",
            stages: {
              onset: { min: 20, max: 40, unit: "min" },
              come_up: { min: null, max: null, unit: "min" },
              peak: { min: 2, max: 3, unit: "hr" },
              offset: { min: null, max: null, unit: "hr" },
              after_effects: { min: null, max: null, unit: "hr" },
              total_duration: { min: 6, max: 8, unit: "hr" },
            },
            half_life: "",
            half_life_notes: "",
          },
          {
            route: "insufflated",
            stages: {
              onset: { min: 5, max: 10, unit: "min" },
              come_up: { min: null, max: null, unit: "min" },
              peak: { min: 1, max: 2, unit: "hr" },
              offset: { min: null, max: null, unit: "hr" },
              after_effects: { min: null, max: null, unit: "hr" },
              total_duration: { min: 3, max: 5, unit: "hr" },
            },
            half_life: "",
            half_life_notes: "",
          },
        ],
      },
    };

    render(<DosageDurationSection article={article} />);

    expect(screen.getByText("10-15 mg")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Insufflated route" }));

    expect(screen.getByText("4-8 mg")).toBeInTheDocument();
    expect(screen.queryByText("10-15 mg")).not.toBeInTheDocument();
  });
});

/**
 * The public article is the whole risk of inline editing: every affordance is
 * mounted by the same components that render dose.wiki to the world, and the
 * only thing keeping the two apart is the absent edit context. These tests hold
 * the public render to exactly what it drew before any of it existed — same
 * rows, same markup, no placeholders for the tiers a reviewer may fill in.
 */
describe("DosageDurationSection public render", () => {
  const populated = () =>
    articleWithRoutes(
      [dosedRoute("oral", { bioavailability: "80%", notes: "Take on an empty stomach." })],
      [timedRoute("oral", { half_life: "3 hours" })],
    );

  it("draws only the tiers and stages that carry a value", () => {
    const { container } = render(<DosageDurationSection article={populated()} />);

    expect(tierLabels(container)).toEqual(["Threshold", "Light", "Moderate"]);
    expect(stageLabels(container)).toEqual(["Onset", "Peak", "Total"]);
    expect(container.textContent).not.toContain("N/A");
  });

  it("mounts no editing affordance at all", () => {
    const { container } = render(<DosageDurationSection article={populated()} />);

    expect(container.querySelectorAll("[data-editable-path]")).toHaveLength(0);
    expect(
      container.querySelectorAll('[role="button"][aria-label^="Edit "]'),
    ).toHaveLength(0);
    // Placeholders are the loudest possible public-page regression.
    expect(container.textContent).not.toContain("Add ");
  });

  it("keeps the tier and stage row markup byte-identical", () => {
    const { container } = render(<DosageDurationSection article={populated()} />);

    const lightRow = container
      .querySelector('[data-dose-tier="light"]')
      ?.parentElement?.outerHTML;
    expect(lightRow).toBe(
      '<div class="theme-dose-tier-row relative overflow-hidden rounded-lg px-3 py-1.5 text-sm">' +
        '<div data-dose-tier="light" class="pointer-events-none absolute bottom-0 left-0 top-0 rounded-l-lg"></div>' +
        '<div class="relative flex items-center justify-between">' +
        '<span class="theme-text-secondary font-medium">Light</span>' +
        '<span class="theme-text-muted font-mono text-xs">4-8 mg</span>' +
        "</div></div>",
    );

    const stageRows = Array.from(
      container.querySelectorAll(".theme-duration-stage-row"),
    ).map((row) => row.outerHTML);
    expect(stageRows[0]).toBe(
      '<div class="theme-duration-stage-row flex items-center justify-between rounded-lg px-3 py-1.5 text-sm">' +
        '<span class="theme-text-secondary font-medium">Onset</span>' +
        '<span class="theme-text-muted font-mono text-xs">5-10 minutes</span>' +
        "</div>",
    );
  });

  it("renders nothing extra for a route documented only by prose", () => {
    const notes = "Extract potency is unstandardized, so no dose ladder is published.";
    const { container } = render(
      <DosageDurationSection
        article={articleWithRoutes([hollowDosageRoute("smoked", { notes })], [])}
      />,
    );

    expect(tierLabels(container)).toEqual([]);
    expect(container.textContent).not.toContain("Bioavailability");
    expect(container.textContent).not.toContain("Half-life");
    expect(container.querySelectorAll("[data-editable-path]")).toHaveLength(0);
    expect(container.textContent).toContain(notes);
  });
});

/**
 * The disclaimer is copy, not chrome: it comes from the `dosage-panel-disclaimer`
 * block through the route loader, and the checked-in default is what every host
 * that mounts the article without one must still show.
 */
describe("DosagePanel disclaimer", () => {
  const article = () => articleWithRoutes([dosedRoute("oral")], []);

  it("renders the checked-in default when no copy is threaded", () => {
    render(<DosageDurationSection article={article()} />);

    expect(screen.getByText(DOSAGE_PANEL_DISCLAIMER_FALLBACK)).toBeInTheDocument();
  });

  it("renders the edited copy body instead of the default", () => {
    const edited = "Start low. Every body metabolises differently.";
    render(<DosageDurationSection article={article()} dosageDisclaimer={edited} />);

    expect(screen.getByText(edited)).toBeInTheDocument();
    expect(screen.queryByText(DOSAGE_PANEL_DISCLAIMER_FALLBACK)).not.toBeInTheDocument();
  });

  it("draws no line at all when an editor blanks the block", () => {
    const { container } = render(
      <DosageDurationSection article={article()} dosageDisclaimer="  " />,
    );

    expect(container.textContent).not.toContain("population estimates");
  });
});

/** The reported table: minute-denominated stages sitting above hour rows. */
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

/** Values as the panel prints them, in render order. */
function stageValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".theme-duration-stage-row")).map(
    (row) => row.querySelector("span.font-mono")?.textContent ?? "",
  );
}

function tierValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-dose-tier]")).map(
    (marker) => marker.parentElement?.querySelector("span.font-mono")?.textContent ?? "",
  );
}

describe("DosageDurationSection duration units", () => {
  it("prints a whole table on one scale", () => {
    const { container } = render(
      <DosageDurationSection article={articleWithRoutes([], [mixedScaleRoute("oral")])} />,
    );

    expect(stageValues(container)).toEqual([
      "2-7 hours",
      "3-6 hours",
      "6-12 hours",
      "3-8 hours",
      "12-36 hours",
      "24-96 hours",
    ]);
  });

  it("leaves dose tiers on the units they were authored in", () => {
    // A tier and a stage are the same `{min, max, unit}` leaf, and these are
    // the numbers that would move if duration normalization ever reached the
    // dose panel: 120-420 is the reported onset, in milligrams.
    const { container } = render(
      <DosageDurationSection
        article={articleWithRoutes(
          [
            dosedRoute("oral", {
              dose_ranges: {
                threshold: { min: 90, max: null, unit: "mg" },
                light: { min: 120, max: 420, unit: "mg" },
                moderate: { min: 1.9, max: 4, unit: "g" },
                strong: { min: 500, max: 1500, unit: "ug" },
                heavy: { min: null, max: null, unit: "mg" },
              },
            }),
          ],
          [],
        )}
      />,
    );

    expect(tierValues(container)).toEqual(["~90 mg", "120-420 mg", "1.9-4 g", "500-1500 ug"]);
  });

  it("seeds an inline edit from the stored value, not the printed one", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(articleWithRoutes([], [mixedScaleRoute("oral")]));

    expect(screen.getByText("2-7 hours")).toBeInTheDocument();
    // Display-only: the editor opens on what Postgres holds, and an untouched
    // save round-trips the stored triple byte for byte.
    const field = await openEditor(user, "Oral onset duration");
    expect(field).toHaveValue("120-420 minutes");

    // Closing an untouched field writes nothing: the printed conversion is not
    // a pending change.
    await user.type(field, "{Enter}");
    expect(commit).not.toHaveBeenCalled();

    // And a reviewer who does commit the printed form still writes against the
    // stored triple, not against a normalized copy of it.
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
