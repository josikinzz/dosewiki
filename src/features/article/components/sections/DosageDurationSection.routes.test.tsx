import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import {
  doseRangeTransformer,
  durationStageTransformer,
} from "@/data/schema/transformers";
import type { DosageRoute, DurationRoute, SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "../../editing";
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

function renderEditing(
  article: SubstanceArticle,
  commit: ArticleEditContextValue["commit"] = vi.fn(
    async (_path: string, value: EditableFieldValue) => value,
  ),
) {
  const result = render(
    <ArticleEditProvider value={{ commit }}>
      <DosageDurationSection article={article} />
    </ArticleEditProvider>,
  );
  return { ...result, commit };
}

/** Row labels currently drawn in the dosage panel, in render order. */
function tierLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-dose-tier]")).map(
    (marker) =>
      marker.parentElement?.querySelector("span")?.textContent ?? "",
  );
}

function stageLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".theme-duration-stage-row")).map(
    (row) => row.querySelector("span")?.textContent ?? "",
  );
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("textbox", { name: `Edit ${name}` });
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
