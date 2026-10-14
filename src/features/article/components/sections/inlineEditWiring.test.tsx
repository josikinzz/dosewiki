import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
} from "../../editing";
import { HistoryCultureSection } from "./HistoryCultureSection";
import { LegalitySection } from "./LegalitySection";
import { AddictionSubsection } from "./harm-potential/AddictionSubsection";
import {
  PsychosisRiskSubsection,
  SeizureRiskSubsection,
} from "./harm-potential/RisksSubsection";
import { ToxicitySubsection } from "./harm-potential/ToxicitySubsection";
import {
  normalizeHarmPotential,
  type NormalizedHarmPotential,
} from "./harm-potential/HarmPotentialUtils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const legalityArticle = {
  title: "Example",
  references: [],
  legality: {
    international: ["Listed under the 1971 Convention.", "No WHO review."],
    countries: {
      "United States": {
        canonicalStatus: "prohibited",
        notes: "Federally prohibited.",
      },
      Germany: {
        canonicalStatus: "prohibited",
        notes: "Anlage I BtMG.",
      },
      Portugal: {
        canonicalStatus: "decriminalized",
      },
    },
    usStates: {
      Florida: {
        canonicalStatus: "prohibited",
        notes: "State ban.",
        cities: {
          Miami: { canonicalStatus: "decriminalized", notes: "City ordinance." },
        },
      },
    },
    usStatesNote: "State law varies considerably.",
  },
} as unknown as SubstanceArticle;

const LONG_HISTORY_CONTENT = `${"Synthesised in 1912 by chemists working on haemostatic agents. ".repeat(12)}`;

const historyArticle = {
  references: [],
  history_culture: {
    content: LONG_HISTORY_CONTENT,
    sections: [
      // Empty leading entry: filtered out of the render, so every later
      // section's rendered position is one lower than its stored index.
      { heading: "", content: "", subsections: [] },
      {
        heading: "Origins",
        content: `${"The first documented use dates to 1927. ".repeat(14)}`,
        subsections: [{ heading: "Early Reports", content: "An early report." }],
      },
      { heading: "Modern Era", content: "Rediscovered in 1976." },
    ],
  },
} as unknown as SubstanceArticle;

/**
 * Legacy shape: the same four descriptions and the lethal-dosage note are
 * synthesised by the normalizer out of `addiction_liability`,
 * `dependence_liability`, `risks.*` and a string `toxicity.ld50`. Nothing is
 * stored at the canonical paths, so nothing here may be editable.
 */
const legacyHarmArticle = {
  references: [],
  harm_potential: {
    addiction_liability: "Legacy addiction liability text.",
    dependence_liability: "Legacy dependence liability text.",
    risks: {
      psychosis: "Legacy psychosis text.",
      seizure: "Legacy seizure text.",
    },
    toxicity: {
      ld50: "Legacy LD50 string.",
    },
  },
} as unknown as SubstanceArticle;

function normalized(article: SubstanceArticle): NormalizedHarmPotential {
  const value = normalizeHarmPotential(article);
  if (!value) throw new Error("fixture produced no harm potential");
  return value;
}

function withProvider(
  node: ReactNode,
  commit: ArticleEditContextValue["commit"] = async (_path, value) => value,
) {
  return render(<ArticleEditProvider value={{ commit }}>{node}</ArticleEditProvider>);
}

function harmPotentialTree(article: SubstanceArticle) {
  const harm = normalized(article);
  return (
    <>
      <AddictionSubsection addiction={harm.addiction} article={article} />
      <PsychosisRiskSubsection risks={harm.risks} article={article} />
      <SeizureRiskSubsection risks={harm.risks} article={article} />
      <ToxicitySubsection toxicity={harm.toxicity} article={article} />
    </>
  );
}

const editablePaths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-editable-path]")).map((node) =>
    node.getAttribute("data-editable-path"),
  );

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

describe("legality inline editing", () => {
  it("addresses every wired field by an encoded path", () => {
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);

    // Collapsed rows keep their details in the DOM (`hidden="until-found"`),
    // so every note path is wired without expanding anything.
    expect(editablePaths(container)).toEqual([
      "legality.international[0]",
      "legality.international[1]",
      // "United States" cannot be spelled literally inside a path.
      "legality.countries.United%20States.notes",
      "legality.usStatesNote",
      "legality.usStates.Florida.notes",
      "legality.usStates.Florida.cities.Miami.notes",
      "legality.countries.Germany.notes",
      // Portugal has no note at all; the slot is how one gets written.
      "legality.countries.Portugal.notes",
    ]);
  });

  it("commits a country note through its encoded path", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<LegalitySection article={legalityArticle} />, commit);

    await user.click(screen.getByRole("button", { name: "Show details for Germany" }));
    await user.click(screen.getByRole("button", { name: "Edit Germany legality notes" }));
    const field = screen.getByRole("textbox", { name: "Edit Germany legality notes" });
    expect(field).toHaveValue("Anlage I BtMG.");
    await user.clear(field);
    await user.type(field, "Anlage II BtMG.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "legality.countries.Germany.notes",
      "Anlage II BtMG.",
      "Anlage I BtMG.",
    );
  });
});

// ---------------------------------------------------------------------------
// Harm potential: the identity gate
// ---------------------------------------------------------------------------

describe("harm potential inline editing", () => {
  it("renders plain text when the normalized value is not what the canonical path holds", () => {
    const { container } = withProvider(harmPotentialTree(legacyHarmArticle));

    // Every string on screen was synthesised by the normalizer from a legacy
    // key. None of it may be offered as an edit to the canonical path.
    expect(editablePaths(container)).toEqual([]);
    expect(screen.getByText("Legacy addiction liability text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy dependence liability text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy psychosis text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy seizure text.")).toBeInTheDocument();
    expect(screen.getByText("Legacy LD50 string.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// History & culture
// ---------------------------------------------------------------------------

describe("history & culture inline editing", () => {
  it("addresses sections by their stored index, not their rendered position", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<HistoryCultureSection article={historyArticle} />);
    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));

    // The fixture's stored section 0 is empty and filtered out, so "Origins"
    // renders first while living at index 1.
    expect(editablePaths(container)).toEqual([
      "history_culture.content",
      "history_culture.sections[1].content",
      "history_culture.sections[1].subsections[0].content",
      "history_culture.sections[2].content",
    ]);
  });

  it("does not offer an editor for truncated section content", () => {
    const { container } = withProvider(<HistoryCultureSection article={historyArticle} />);

    // Collapsed: the overview renders whole and is editable; the first
    // section's content is a mid-word preview and is not.
    expect(editablePaths(container)).toEqual(["history_culture.content"]);
  });

  it("commits a section body to its stored index", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<HistoryCultureSection article={historyArticle} />, commit);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(screen.getByRole("button", { name: "Edit Modern Era history content" }));
    const field = screen.getByRole("textbox", { name: "Edit Modern Era history content" });
    await user.clear(field);
    await user.type(field, "Rediscovered in 1977.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "history_culture.sections[2].content",
      "Rediscovered in 1977.",
      "Rediscovered in 1976.",
    );
  });
});
