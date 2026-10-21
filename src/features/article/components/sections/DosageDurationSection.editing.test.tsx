// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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

    expect(screen.getByText("~2 mg")).toBeInTheDocument();
    expect(screen.getByText("30 mg")).toBeInTheDocument();

    expect(await openEditor(user, "Oral threshold dose")).toHaveValue("2+ mg");
    await user.keyboard("{Escape}");
    expect(await openEditor(user, "Oral moderate dose")).toHaveValue("<30 mg");
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
    expect(screen.getByRole("textbox", { name: "Edit Oral light dose" })).toHaveValue(
      "a fair bit",
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

    const field = await openEditor(user, "Snorted light dose");
    await user.clear(field);
    await user.type(field, "6-12 mg{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[1].dose_ranges.light",
      { min: 6, max: 12, unit: "mg" },
      { min: 4, max: 8, unit: "mg" },
    );
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
});
