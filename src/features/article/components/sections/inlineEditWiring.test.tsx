import { render, screen, within } from "@testing-library/react";
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

const freeformHistoryArticle = {
  references: [],
  history_culture: {
    content: LONG_HISTORY_CONTENT,
    sections: [],
  },
} as unknown as SubstanceArticle;

/** Modern shape: every rendered string is stored at its canonical path. */
const modernHarmArticle = {
  references: [],
  harm_potential: {
    addiction: {
      psychological: { level: "moderate", description: "Psychological reliance is common." },
      physical_dependence: { level: "low", description: "Physical dependence is rare." },
    },
    psychosis: { level: "low", description: "Psychosis risk is low." },
    seizure: { level: "low", description: "Seizure risk is low." },
    toxicity: {
      lethal_dosage: { ld50: [], notes: "No reliable human LD50 exists." },
      organ_toxicity: [
        {
          system: "Hepatic",
          findings: "Elevated transaminases.",
          mechanism: "Oxidative stress.",
          notes: "Reversible on cessation.",
        },
      ],
    },
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

/**
 * The public page must carry none of the editing surface: no wrapper paths,
 * no `Edit ...` controls or textboxes, no contenteditable, and no editor-only
 * status vocabulary in the visible text.
 */
function expectNoEditingSurface(container: HTMLElement) {
  expect(editablePaths(container)).toEqual([]);
  expect(within(container).queryAllByRole("button", { name: /^Edit / })).toEqual([]);
  expect(within(container).queryAllByRole("textbox")).toEqual([]);
  expect(container.querySelectorAll("[contenteditable], textarea, input")).toHaveLength(0);
  expect(container.textContent).not.toContain("editorial_review");
  expect(container.textContent).not.toMatch(/^Add /m);
}

// ---------------------------------------------------------------------------
// Public render is unchanged
// ---------------------------------------------------------------------------

describe("public article render", () => {
  it("renders legality without any editing markup", () => {
    const { container } = render(<LegalitySection article={legalityArticle} />);
    expect(screen.getByRole("heading", { name: "Legality" })).toBeVisible();
    expect(screen.getByText("Listed under the 1971 Convention.")).toBeVisible();
    expect(screen.getByText("Federally prohibited.")).toBeInTheDocument();
    expect(screen.getByText("Anlage I BtMG.")).toBeInTheDocument();
    expect(screen.getByText("Portugal")).toBeInTheDocument();
    expectNoEditingSurface(container);
  });

  it("renders expanded US state and city rows without any editing markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<LegalitySection article={legalityArticle} />);
    await user.click(screen.getByRole("button", { name: "Show details for United States" }));
    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));
    await user.click(screen.getByRole("button", { name: "Show details for Miami" }));
    expect(screen.getByText("State law varies considerably.")).toBeVisible();
    expect(screen.getByText("State ban.")).toBeVisible();
    expect(screen.getByText("City ordinance.")).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("renders collapsed history & culture without any editing markup", () => {
    const { container } = render(<HistoryCultureSection article={historyArticle} />);
    expect(screen.getByRole("heading", { name: "History & Culture" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Origins" })).toBeInTheDocument();
    expect(screen.queryByText("Modern Era")).toBeNull();
    expect(
      screen.getByRole("button", { name: /expand history and culture/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expectNoEditingSurface(container);
  });

  it("renders expanded history & culture without any editing markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<HistoryCultureSection article={historyArticle} />);
    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    expect(screen.getByRole("heading", { name: "Origins" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Early Reports" })).toBeVisible();
    expect(screen.getByText("An early report.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Modern Era" })).toBeVisible();
    expect(screen.getByText(/Rediscovered in/)).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("renders freeform history & culture without any editing markup", () => {
    const { container } = render(<HistoryCultureSection article={freeformHistoryArticle} />);
    expect(screen.getByRole("heading", { name: "History & Culture" })).toBeVisible();
    expect(screen.getAllByText(/by chemists working on haemostatic agents/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Origins" })).toBeNull();
    expectNoEditingSurface(container);
  });

  it("renders harm potential without any editing markup", () => {
    const { container } = render(harmPotentialTree(modernHarmArticle));
    expect(screen.getByRole("heading", { name: "Addiction & Dependence" })).toBeVisible();
    expect(screen.getByText("Psychological reliance is common.")).toBeVisible();
    expect(screen.getByText("Physical dependence is rare.")).toBeVisible();
    expect(screen.getByText("Psychosis risk is low.")).toBeVisible();
    expect(screen.getByText("Seizure risk is low.")).toBeVisible();
    expect(screen.getByText("No reliable human LD50 exists.")).toBeVisible();
    expect(screen.getByText("Elevated transaminases.")).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("renders legacy harm potential without any editing markup", () => {
    const { container } = render(harmPotentialTree(legacyHarmArticle));
    expect(screen.getByText("Legacy addiction liability text.")).toBeVisible();
    expect(screen.getByText("Legacy dependence liability text.")).toBeVisible();
    expect(screen.getByText("Legacy psychosis text.")).toBeVisible();
    expect(screen.getByText("Legacy seizure text.")).toBeVisible();
    expect(screen.getByText("Legacy LD50 string.")).toBeVisible();
    expectNoEditingSurface(container);
  });
});

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

  it("addresses state and city notes once their rows are open", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);

    await user.click(screen.getByRole("button", { name: "Show details for United States" }));
    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));
    await user.click(screen.getByRole("button", { name: "Show details for Miami" }));

    expect(editablePaths(container)).toContain("legality.usStates.Florida.notes");
    expect(editablePaths(container)).toContain(
      "legality.usStates.Florida.cities.Miami.notes",
    );
  });

  it("leaves every status badge read-only", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(<LegalitySection article={legalityArticle} />);
    await user.click(screen.getByRole("button", { name: "Show details for United States" }));
    await user.click(screen.getByRole("button", { name: "Show details for Florida" }));

    // The badge shows "Illegal", a label derived from `canonicalStatus`. Wiring
    // it would write that label into the stored status.
    expect(screen.getAllByText("Illegal").length).toBeGreaterThan(0);
    for (const path of editablePaths(container)) {
      expect(path).not.toMatch(/status$/i);
    }
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
  it("wires every canonical field on a modern article", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(harmPotentialTree(modernHarmArticle));

    expect(editablePaths(container)).toEqual([
      "harm_potential.addiction.psychological.description",
      "harm_potential.addiction.physical_dependence.description",
      "harm_potential.psychosis.description",
      "harm_potential.seizure.description",
      "harm_potential.toxicity.lethal_dosage.notes",
      "harm_potential.toxicity.organ_toxicity[0].findings",
    ]);

    // Mechanism and notes only exist once the organ card is open.
    await user.click(screen.getByRole("button", { name: "Expand section" }));
    expect(editablePaths(container)).toContain(
      "harm_potential.toxicity.organ_toxicity[0].mechanism",
    );
    expect(editablePaths(container)).toContain(
      "harm_potential.toxicity.organ_toxicity[0].notes",
    );
  });

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

  it("gates each field independently", () => {
    // One description that the article stores at its canonical path beside one
    // the normalizer produced from somewhere else. Only the first is editable,
    // so a half-migrated article is not all-or-nothing.
    const drifted: NormalizedHarmPotential["addiction"] = {
      psychological: { level: null, description: "Text that is stored nowhere." },
      physical_dependence: { level: null, description: "Physical dependence is rare." },
    };

    const { container } = withProvider(
      <AddictionSubsection addiction={drifted} article={modernHarmArticle} />,
    );

    expect(editablePaths(container)).toEqual([
      "harm_potential.addiction.physical_dependence.description",
    ]);
    expect(screen.getByText("Text that is stored nowhere.")).toBeInTheDocument();
  });

  it("commits a canonical description", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(harmPotentialTree(modernHarmArticle), commit);

    await user.click(
      screen.getByRole("button", { name: "Edit Psychosis risk description" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Edit Psychosis risk description" }),
      " Reports are sparse.{Enter}",
    );

    expect(commit).toHaveBeenCalledWith(
      "harm_potential.psychosis.description",
      "Psychosis risk is low. Reports are sparse.",
      "Psychosis risk is low.",
    );
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

  it("does not offer an editor for truncated freeform content", async () => {
    const user = userEvent.setup();
    const { container } = withProvider(
      <HistoryCultureSection article={freeformHistoryArticle} />,
    );
    expect(editablePaths(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    expect(editablePaths(container)).toEqual(["history_culture.content"]);
  });

  it("seeds the freeform editor from the raw field rather than the preview", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    withProvider(<HistoryCultureSection article={freeformHistoryArticle} />, commit);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(
      screen.getByRole("button", { name: "Edit History & culture overview" }),
    );

    const field = screen.getByRole("textbox", { name: "Edit History & culture overview" });
    expect(field).toHaveValue(freeformHistoryArticle.history_culture!.content);
    expect(field).not.toHaveValue(expect.stringContaining("…"));
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

// ---------------------------------------------------------------------------
// Notable Individuals: an editor nested inside a card-sized <button>
// ---------------------------------------------------------------------------

const notableIndividualsArticle = {
  references: [],
  history_culture: {
    content: "An overview paragraph.",
    sections: [
      {
        heading: "Notable Individuals",
        content: "",
        subsections: [
          { heading: "Alexander Shulgin", content: "Synthesised many compounds." },
        ],
      },
    ],
  },
} as unknown as SubstanceArticle;

describe("notable individuals card", () => {
  it("renders no editing markup on the public page", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HistoryCultureSection article={notableIndividualsArticle} />,
    );

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(screen.getByRole("button", { name: /Alexander Shulgin/ }));

    expect(screen.getByText(/Synthesised many compounds/)).toBeInTheDocument();
    expect(editablePaths(container)).toEqual([]);
  });

  it("edits a biography without the card's own click closing it", async () => {
    const user = userEvent.setup();
    const commit = vi.fn<ArticleEditContextValue["commit"]>(async (_path, value) => value);
    withProvider(<HistoryCultureSection article={notableIndividualsArticle} />, commit);

    await user.click(screen.getByRole("button", { name: /expand history and culture/i }));
    await user.click(screen.getByRole("button", { name: /^Alexander Shulgin/ }));

    const label = "Edit Alexander Shulgin biography";
    await user.click(screen.getByRole("button", { name: label }));

    // The click that opened the editor must not have toggled the card shut.
    const field = screen.getByRole("textbox", { name: label });
    await user.click(field);
    expect(screen.getByRole("textbox", { name: label })).toBe(field);

    await user.clear(field);
    await user.type(field, "Synthesised hundreds of compounds.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "history_culture.sections[0].subsections[0].content",
      "Synthesised hundreds of compounds.",
      "Synthesised many compounds.",
    );
  });
});
