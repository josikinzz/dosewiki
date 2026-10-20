import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { DosageRoute, DurationRoute, PlateauDosing, SubstanceArticle } from "@/schema";
import { collectCitationIdsFromPublicRenderOrder } from "../../../../../lib/citations/citationPlacement.mjs";
import { DosageDurationSection } from "./DosageDurationSection";
import {
  dosedRoute,
  hollowDosageRoute,
  hollowDurationRoute,
  timedRoute,
} from "./DosageDurationSection.testHarness";

const REFERENCE_IDS = [
  "s",
  "p",
  "shown",
  "hidden-bio",
  "bio",
  "bio-note",
  "hidden-half",
  "half",
  "half-note",
  "dose",
  "second-dose",
  "plateau-effects",
  "plateau-notes",
  "hidden-tier",
  "tier",
  "sigma",
  "host",
  "duration",
];

function plateauTier(
  min: number | null,
  max: number | null,
  effects: string,
): PlateauDosing["first_plateau"] {
  return { min, max, unit: "mg", effects };
}

function plateauDosing(overrides: Partial<PlateauDosing>): PlateauDosing {
  return {
    first_plateau: plateauTier(null, null, ""),
    second_plateau: plateauTier(null, null, ""),
    third_plateau: plateauTier(null, null, ""),
    fourth_plateau: plateauTier(null, null, ""),
    fifth_plateau: null,
    notes: null,
    ...overrides,
  };
}

function citedArticle(
  dosageRoutes: DosageRoute[],
  durationRoutes: DurationRoute[],
  plateau: PlateauDosing | null = null,
): SubstanceArticle {
  const empty = createEmptyArticle();
  return {
    ...empty,
    title: "Dosage Citation Order Test",
    summary: "Summary claim [cite:s].",
    dosage: { routes: dosageRoutes, plateau_dosing: plateau },
    duration: { routes: durationRoutes },
    pharmacology: { ...empty.pharmacology, pharmacodynamics: "Mechanism [cite:p]." },
    references: REFERENCE_IDS.map((id) => ({
      id,
      type: "webpage",
      title: `Source ${id}`,
      authors: [],
      url: `https://example.org/${id}`,
      sourceType: "unknown",
      quality: "fallback",
    })),
  };
}

function mergeInDomOrder(snapshots: string[][]): string[] {
  const merged: string[] = [];
  for (const snapshot of snapshots) {
    const present = new Set(snapshot);
    let insertAt = 0;
    for (const id of snapshot) {
      const existing = merged.indexOf(id);
      if (existing >= 0) {
        insertAt = existing + 1;
        continue;
      }
      while (insertAt < merged.length && !present.has(merged[insertAt])) insertAt += 1;
      merged.splice(insertAt, 0, id);
      insertAt += 1;
    }
  }
  return merged;
}

async function readReachableCitations(article: SubstanceArticle) {
  const user = userEvent.setup();
  const { container } = render(<DosageDurationSection article={article} />);
  const snapshot = () =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>("a[data-reference-id]"), (link) => ({
      id: link.dataset.referenceId ?? "",
      label: link.textContent ?? "",
    }));
  const labels = new Map<string, string>();
  const order: string[] = [];
  const routeTabs = Array.from(
    container.querySelectorAll<HTMLElement>(".theme-route-tabs-list [role='tab']"),
  );
  for (const routeTab of routeTabs) {
    await user.click(routeTab);
    const snapshots = [snapshot()];
    const plateauTab = within(container).queryByRole("tab", { name: "Plateau" });
    if (plateauTab) {
      await user.click(plateauTab);
      const tierToggles = Array.from(
        container.querySelectorAll<HTMLElement>("button[aria-controls^='plateau-']"),
      );
      for (const toggle of tierToggles) {
        await user.click(toggle);
        snapshots.push(snapshot());
        await user.click(toggle);
      }
    }
    for (const entry of snapshots.flat()) labels.set(entry.id, entry.label);
    for (const id of mergeInDomOrder(snapshots.map((links) => links.map((link) => link.id)))) {
      if (!order.includes(id)) order.push(id);
    }
  }
  return { order, labels: order.map((id) => labels.get(id)) };
}

async function expectNumberedInReadingOrder(article: SubstanceArticle, expected: string[]) {
  const { order, labels } = await readReachableCitations(article);
  expect(order).toEqual(expected);
  expect(labels).toEqual(expected.map((_, index) => String(index + 2)));
  expect(collectCitationIdsFromPublicRenderOrder(article)).toEqual(["s", ...expected, "p"]);
}

describe("published dosage citation numbering", () => {
  it("numbers detail notes only when their parent field renders", async () => {
    await expectNumberedInReadingOrder(
      citedArticle(
        [
          dosedRoute("Oral", {
            bioavailability_notes: "Hidden [cite:hidden-bio].",
            notes: "Shown [cite:shown].",
          }),
          dosedRoute("Insufflated", {
            bioavailability: "About half [cite:bio]",
            bioavailability_notes: "Collapsed [cite:bio-note].",
          }),
        ],
        [
          timedRoute("Oral", { half_life_notes: "Hidden [cite:hidden-half]." }),
          timedRoute("Insufflated", {
            half_life: "Two hours [cite:half]",
            half_life_notes: "Collapsed [cite:half-note].",
          }),
        ],
      ),
      ["shown", "bio", "bio-note", "half", "half-note"],
    );
  });

  it("numbers plateau evidence inside the dosage panel, before its duration sibling", async () => {
    await expectNumberedInReadingOrder(
      citedArticle(
        [
          dosedRoute("Oral", { notes: "Dose [cite:dose]." }),
          dosedRoute("Insufflated", { reference_ids: ["second-dose"] }),
        ],
        [timedRoute("Oral", { half_life: "Six hours [cite:half]" })],
        plateauDosing({
          first_plateau: plateauTier(1, 2, "Mild [cite:plateau-effects]."),
          notes: "Plateau note [cite:plateau-notes].",
        }),
      ),
      ["dose", "plateau-effects", "plateau-notes", "half", "second-dose"],
    );
  });

  it("skips plateau tiers the tiers table hides and keeps the boundless Sigma tier", async () => {
    await expectNumberedInReadingOrder(
      citedArticle(
        [dosedRoute("Oral", { reference_ids: ["shown"] })],
        [],
        plateauDosing({
          first_plateau: plateauTier(null, null, "Hidden [cite:hidden-tier]."),
          second_plateau: plateauTier(4, null, "Shown [cite:tier]."),
          fifth_plateau: plateauTier(null, null, "Sigma [cite:sigma]."),
        }),
      ),
      ["shown", "tier", "sigma"],
    );
  });

  it("numbers plateau evidence through a blank host route", async () => {
    await expectNumberedInReadingOrder(
      citedArticle(
        [hollowDosageRoute("Oral", { reference_ids: ["host"] })],
        [timedRoute("Oral", { reference_ids: ["duration"] })],
        plateauDosing({ notes: "Plateau note [cite:plateau-notes]." }),
      ),
      ["host", "plateau-notes", "duration"],
    );
  });

  it("does not number plateau evidence when no dosage panel can host it", async () => {
    await expectNumberedInReadingOrder(
      citedArticle(
        [],
        [timedRoute("Oral", { reference_ids: ["duration"] }), hollowDurationRoute("Rectal")],
        plateauDosing({
          first_plateau: plateauTier(1, 2, "Unhosted [cite:plateau-effects]."),
          notes: "Unhosted [cite:plateau-notes].",
        }),
      ),
      ["duration"],
    );
  });
});
