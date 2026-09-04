import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  doseRangeTransformer,
  durationStageTransformer,
} from "@/data/schema/transformers";
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

describe("DosageDurationSection inline dose editing", () => {
  it("seeds a tier from the transformer rather than from the rendered text", async () => {
    const user = userEvent.setup();
    const article = articleWithRoutes(
      [
        dosedRoute("oral", {
          dose_ranges: {
            threshold: { min: 2, max: null, unit: "mg" },
            light: { min: 4, max: 8, unit: "mg" },
            moderate: { min: null, max: 30, unit: "mg" },
            strong: { min: null, max: null, unit: "mg" },
            heavy: { min: null, max: null, unit: "mg" },
          },
        }),
      ],
      [],
    );
    renderEditing(article);

    // The page renders a threshold as `~2 mg` and a max-only range as a bare
    // `30 mg`; seeding the editor from either would round-trip a threshold into
    // an exact dose and a ceiling into `{min: 30, max: 30}`.
    expect(screen.getByText("~2 mg")).toBeInTheDocument();
    expect(screen.getByText("30 mg")).toBeInTheDocument();

    expect(await openEditor(user, "Oral threshold dose")).toHaveValue("2+ mg");
    await user.keyboard("{Escape}");
    expect(await openEditor(user, "Oral moderate dose")).toHaveValue("<30 mg");
  });

  it("commits the parsed range and the range the reviewer was looking at", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes([dosedRoute("oral")], []),
    );

    const field = await openEditor(user, "Oral light dose");
    expect(field).toHaveValue("4-8 mg");
    await user.clear(field);
    await user.type(field, "5-10 mg{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[0].dose_ranges.light",
      { min: 5, max: 10, unit: "mg" },
      { min: 4, max: 8, unit: "mg" },
    );
    // Round trip: what was committed is what the editor would reopen on.
    const [, committed] = (commit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(doseRangeTransformer.toForm(committed)).toBe("5-10 mg");
  });

  it("shows an error and commits nothing when the text is not a dose", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes([dosedRoute("oral")], []),
    );

    const field = await openEditor(user, "Oral light dose");
    await user.clear(field);
    await user.type(field, "a fair bit{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a dose like 10-20 mg",
    );
    expect(commit).not.toHaveBeenCalled();
    // The stored dose is untouched and the rejected draft is still recoverable.
    expect(screen.getByRole("textbox", { name: "Edit Oral light dose" })).toHaveValue(
      "a fair bit",
    );
  });

  it("offers an absent tier as a fill-in and commits its absence as expected", async () => {
    const user = userEvent.setup();
    const { container, commit } = renderEditing(
      articleWithRoutes([dosedRoute("oral")], []),
    );

    expect(tierLabels(container)).toEqual([
      "Threshold",
      "Light",
      "Moderate",
      "Strong",
      "Heavy",
    ]);
    expect(screen.getByText("Add heavy dose")).toBeInTheDocument();

    const field = await openEditor(user, "Oral heavy dose");
    expect(field).toHaveValue("");
    await user.type(field, "40+ mg{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[0].dose_ranges.heavy",
      { min: 40, max: null, unit: "mg" },
      { min: null, max: null, unit: "mg" },
    );
  });

  it("addresses the dosage route that is rendered, not the first one listed", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes(
        [hollowDosageRoute("intranasal"), dosedRoute("snorted")],
        [],
      ),
    );

    // The tab is canonical ("Insufflated"); the field label names the raw route
    // entry it actually writes to.
    const field = await openEditor(user, "Snorted light dose");
    await user.clear(field);
    await user.type(field, "6-12 mg{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[1].dose_ranges.light",
      { min: 6, max: 12, unit: "mg" },
      { min: 4, max: 8, unit: "mg" },
    );
  });

  it("wires route notes, including a route that has none", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes([dosedRoute("oral"), dosedRoute("smoked", { notes: "Redose sparingly." })], []),
    );

    expect(screen.getByText("Add dosage notes")).toBeInTheDocument();
    const field = await openEditor(user, "Oral dosage notes");
    expect(field).toHaveValue("");
    await user.type(field, "Food delays onset.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[0].notes",
      "Food delays onset.",
      "",
    );
  });

  it("wires bioavailability and its notes as whole fields", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes(
        [
          dosedRoute("oral", {
            bioavailability: "80%",
            bioavailability_notes: "First line.\nSecond line.",
          }),
        ],
        [],
      ),
    );

    const value = await openEditor(user, "Oral bioavailability");
    expect(value).toHaveValue("80%");
    await user.clear(value);
    await user.type(value, "75%{Enter}");
    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[0].bioavailability",
      "75%",
      "80%",
    );

    await user.click(
      screen.getByRole("button", { name: "Expand Oral bioavailability notes" }),
    );
    // One editor for the whole note, not one per rendered bullet.
    const notes = await openEditor(user, "Oral bioavailability notes");
    expect(notes).toHaveValue("First line.\nSecond line.");
  });
});

describe("DosageDurationSection inline duration editing", () => {
  it("addresses the duration route that is rendered, not routes[0]", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(
      articleWithRoutes(
        [hollowDosageRoute("intranasal"), dosedRoute("snorted")],
        [hollowDurationRoute("intranasal"), timedRoute("snorted")],
      ),
    );

    expect(tabNames()).toEqual(["Insufflated route"]);
    const field = await openEditor(user, "Snorted onset duration");
    expect(field).toHaveValue("5-10 minutes");
    await user.clear(field);
    await user.type(field, "2-5 minutes{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "duration.routes[1].stages.onset",
      { min: 2, max: 5, unit: "minutes" },
      { min: 5, max: 10, unit: "minutes" },
    );
  });

  it("offers every stage, including the ones with no value", async () => {
    const user = userEvent.setup();
    const { container, commit } = renderEditing(
      articleWithRoutes([], [timedRoute("oral")]),
    );

    expect(stageLabels(container)).toEqual([
      "Onset",
      "Come Up",
      "Peak",
      "Offset",
      "After Effects",
      "Total",
    ]);
    expect(screen.getByText("Add come up duration")).toBeInTheDocument();

    const field = await openEditor(user, "Oral come up duration");
    await user.type(field, "15-30 minutes{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "duration.routes[0].stages.come_up",
      { min: 15, max: 30, unit: "minutes" },
      { min: null, max: null, unit: "minutes" },
    );
    const [, committed] = (commit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(durationStageTransformer.toForm(committed)).toBe("15-30 minutes");
  });

  it("refuses an unparseable stage without touching the stored value", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(articleWithRoutes([], [timedRoute("oral")]));

    const field = await openEditor(user, "Oral peak duration");
    await user.clear(field);
    await user.type(field, "quite a while{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a duration like 30-60 minutes",
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it("wires half-life and its notes, including on a route that has neither", async () => {
    const user = userEvent.setup();
    const { commit } = renderEditing(articleWithRoutes([], [timedRoute("oral")]));

    const panel = screen.getByRole("heading", { level: 3, name: "Duration" })
      .closest("div.theme-dose-duration-panel") as HTMLElement;
    expect(within(panel).getByText("Add half-life")).toBeInTheDocument();

    const value = await openEditor(user, "Oral half-life");
    expect(value).toHaveValue("");
    await user.type(value, "3-4 hours{Enter}");
    expect(commit).toHaveBeenCalledWith(
      "duration.routes[0].half_life",
      "3-4 hours",
      "",
    );

    await user.click(screen.getByRole("button", { name: "Expand Oral half-life notes" }));
    const notes = await openEditor(user, "Oral half-life notes");
    await user.type(notes, "Longer in hepatic impairment.{Enter}");
    expect(commit).toHaveBeenCalledWith(
      "duration.routes[0].half_life_notes",
      "Longer in hepatic impairment.",
      "",
    );
  });
});
