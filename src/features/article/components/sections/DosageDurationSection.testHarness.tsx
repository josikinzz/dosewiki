import { render, screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { DosageRoute, DurationRoute, SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "../../editing";
import { DosageDurationSection } from "./DosageDurationSection";

// Shared fixture builders and DOM readers for the DosageDurationSection suites.
// Each test file installs its own next/link and framer-motion mocks because
// vi.mock is hoisted per file.

/**
 * The shape generators scaffold when a source merely mentions a route: every
 * tier present, every value null.
 */
export function hollowDosageRoute(route: string, overrides: Partial<DosageRoute> = {}): DosageRoute {
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

export function dosedRoute(route: string, overrides: Partial<DosageRoute> = {}): DosageRoute {
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

export function hollowDurationRoute(route: string, overrides: Partial<DurationRoute> = {}): DurationRoute {
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

export function timedRoute(route: string, overrides: Partial<DurationRoute> = {}): DurationRoute {
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

export function articleWithRoutes(
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

export function tabNames(): string[] {
  return screen.queryAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? "");
}

export function renderEditing(
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
export function tierLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-dose-tier]")).map(
    (marker) =>
      marker.parentElement?.querySelector("span")?.textContent ?? "",
  );
}

export function stageLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".theme-duration-stage-row")).map(
    (row) => row.querySelector("span")?.textContent ?? "",
  );
}

export async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("textbox", { name: `Edit ${name}` });
}
