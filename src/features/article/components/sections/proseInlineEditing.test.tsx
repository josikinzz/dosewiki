import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
} from "../../editing";
import { HeroSection } from "./HeroSection";
import { PharmacologySection } from "./PharmacologySection";
import { SubjectiveEffectsSection } from "./SubjectiveEffectsSection";
import { ToleranceSection } from "./ToleranceSection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A stage key that is hostile to naive path building: it carries both a space
 * and a dot, and a dot is the field-path separator. Live articles really do
 * store `"1. Taking Off"`.
 */
const STAGE_KEY = "1. Taking Off";
/** A sensory subcategory key with a space, as stored. */
const SENSORY_SUBCATEGORY_KEY = "Hallucinatory States";

function buildProseArticle(): SubstanceArticle {
  const empty = createEmptyArticle();

  return {
    ...empty,
    title: "Psilocybin",
    summary: "Psilocybin is a naturally occurring tryptamine prodrug.",
    identification: {
      ...empty.identification,
      common_name: "Magic mushrooms",
      substitutive_name: "4-PO-DMT",
      botanical_name: "Psilocybe cubensis",
    },
    classification: {
      psychoactive_class: ["Psychedelic"],
      chemical_class: ["Tryptamine"],
    },
    index_categories: ["Common"],
    tolerance: {
      full_tolerance: "Builds over three to four consecutive doses.",
      half_tolerance: "About five days.",
      baseline_tolerance: "About two weeks.",
      cross_tolerance: ["LSD", "Mescaline"],
    },
    subjective_effects: {
      ...empty.subjective_effects,
      notes: {
        overview: "Effects are strongly dose dependent.",
        sensory: "",
        cognitive: "Cognition loosens rather than sharpens.",
        physical: "Body load is usually mild.",
      },
      physical: {
        General: { note: "A general physical note.", effects: [{ name: "Nausea", description: "" }] },
      },
      cognitive: {
        "Thought Patterns": {
          note: "Associative thinking dominates.",
          effects: [
            { name: "Conceptual thinking", description: "" },
            { name: "Thought loops", description: "" },
          ],
        },
      },
      sensory: {
        ...empty.subjective_effects.sensory,
        visual: {
          note: "Visual effects arrive first.",
          subcategories: {
            [SENSORY_SUBCATEGORY_KEY]: {
              note: "Reported above moderate doses.",
              effects: [
                { name: "Internal hallucination", description: "" },
                { name: "External hallucination", description: "" },
              ],
            },
          },
        },
      },
      progressive_stages: {
        [STAGE_KEY]: {
          note: "The first thirty minutes.",
          effects: [{ name: "Anticipation", description: "" }],
        },
      },
    },
    pharmacology: {
      ...empty.pharmacology,
      pharmacodynamics:
        "A partial agonist at 5-HT2A.\n\nAffinity at 5-HT1A is weaker but not negligible.",
      pharmacokinetics: "Dephosphorylated to psilocin in the gut.",
      binding_sites: [{ target: "5-HT2A", tag: "5-HT2A (partial agonist)" }],
      metabolites: ["Psilocin (active)"],
    },
  } as SubstanceArticle;
}

/** Everything the sections above wire is absent, but each still renders. */
function buildSparseArticle(): SubstanceArticle {
  const empty = createEmptyArticle();

  return {
    ...empty,
    title: "Sparse",
    classification: {
      psychoactive_class: ["Depressant"],
      chemical_class: [],
    },
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: ["Alcohol"],
    },
    subjective_effects: {
      ...empty.subjective_effects,
      is_stub: true,
      physical: {
        "Bodily Control": {
          note: "",
          effects: [
            { name: "Motor control loss", description: "" },
            { name: "Sedation", description: "" },
          ],
        },
      },
      progressive_stages: {
        [STAGE_KEY]: { note: "", effects: [{ name: "Anticipation", description: "" }] },
      },
    },
    pharmacology: {
      ...empty.pharmacology,
      // No stored pharmacodynamics: the section falls back to `summary`, which
      // this path does not address.
      summary: "Positive allosteric modulation at GABA-A.",
      // No stored pharmacokinetics: the section falls back to `metabolism`.
      metabolism: "Hepatic.",
    },
  } as unknown as SubstanceArticle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function editingSurface(node: ReactElement, commit: ArticleEditContextValue["commit"]) {
  return render(<ArticleEditProvider value={{ commit }}>{node}</ArticleEditProvider>);
}

function editablePaths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-editable-path]")).map(
    (node) => node.getAttribute("data-editable-path") ?? "",
  );
}

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

async function editField(label: string, text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Edit ${label}` }));
  const field = screen.getByRole("textbox", { name: `Edit ${label}` });
  await user.clear(field);
  await user.type(field, `${text}{Enter}`);
}

// ---------------------------------------------------------------------------
// The public article is untouched
// ---------------------------------------------------------------------------

/**
 * `EditableValue` and `EditableSlot` collapse to their children and to nothing
 * at all without an `ArticleEditContext`, and no reader ever supplies one.
 * Each case proves the public content still renders and that nothing from the
 * editing surface leaks beside it.
 */
describe("public prose render", () => {
  it("renders the hero with no editing markup", () => {
    const { container } = render(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Psilocybin" })).toBeVisible();
    expect(screen.getByText("Magic mushrooms")).toBeVisible();
    expect(screen.getByText("4-PO-DMT")).toBeVisible();
    expect(screen.getByText("Psilocybe cubensis")).toBeVisible();
    expect(
      screen.getByText((_, node) =>
        node?.tagName === "P" &&
        node.textContent === "Psilocybin is a naturally occurring tryptamine prodrug.",
      ),
    ).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("renders tolerance with no editing markup", () => {
    const { container } = render(<ToleranceSection article={buildProseArticle()} />);

    expect(screen.getByRole("heading", { name: "Tolerance" })).toBeVisible();
    expect(
      screen.getByText("Builds over three to four consecutive doses."),
    ).toBeVisible();
    expect(screen.getByText("About five days.")).toBeVisible();
    expect(screen.getByText("About two weeks.")).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("renders subjective effects with no editing markup", () => {
    const { container } = render(
      <SubjectiveEffectsSection article={buildProseArticle()} />,
    );

    expect(screen.getByRole("heading", { name: "Subjective Effects" })).toBeVisible();
    expect(screen.getByText("Effects are strongly dose dependent.")).toBeVisible();
    expect(screen.getByText("Associative thinking dominates.")).toBeVisible();
    expect(screen.getByText("Reported above moderate doses.")).toBeVisible();
    expect(screen.getByText("The first thirty minutes.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Internal hallucination" }),
    ).toHaveAttribute("href", "/effects/internal-hallucination");
    expectNoEditingSurface(container);
  });

  it("renders pharmacology with no editing markup", () => {
    const { container } = render(<PharmacologySection article={buildProseArticle()} />);

    expect(screen.getByRole("heading", { name: "Pharmacology" })).toBeVisible();
    expect(screen.getByText("A partial agonist at 5-HT2A.")).toBeVisible();
    expect(
      screen.getByText("Affinity at 5-HT1A is weaker but not negligible."),
    ).toBeVisible();
    expect(screen.getByText("Dephosphorylated to psilocin in the gut.")).toBeVisible();
    expectNoEditingSurface(container);
  });

  it("adds nothing to a sparse article, where every empty-field prompt lives", () => {
    const article = buildSparseArticle();
    const { container } = render(
      <div>
        <HeroSection article={article} showPreviewBadge={false} />
        <ToleranceSection article={article} />
        <SubjectiveEffectsSection article={article} />
        <PharmacologySection article={article} />
      </div>,
    );

    expect(editablePaths(container)).toEqual([]);
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toEqual([]);
    // The prompts are absent as text too, not merely as controls.
    expect(container.textContent).not.toMatch(/^Add /m);
  });
});

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

describe("hero inline editing", () => {
  it("wires the title and the identification names", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await editField("Title", "Psilocybine");
    await editField("Substitutive name", "4-PO-DMT (corrected)");
    await editField("Botanical name", "Psilocybe cubensis (Earle) Singer");
    await editField("Common name", "Magic mushroom");

    expect(commit.mock.calls.map(([path, value]) => [path, value])).toEqual([
      ["title", "Psilocybine"],
      ["identification.substitutive_name", "4-PO-DMT (corrected)"],
      ["identification.botanical_name", "Psilocybe cubensis (Earle) Singer"],
      ["identification.common_name", "Magic mushroom"],
    ]);
  });

  it("edits the summary as one field, first word included", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const user = userEvent.setup();
    editingSurface(
      <HeroSection article={buildProseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await user.click(screen.getByRole("button", { name: "Edit Summary" }));
    const field = screen.getByRole("textbox", { name: "Edit Summary" });
    // The paragraph bolds its own first word by splitting the string. The
    // editor must still see the whole field, or saving would write the tail
    // over the head.
    expect(field).toHaveValue(
      "Psilocybin is a naturally occurring tryptamine prodrug.",
    );

    await user.clear(field);
    await user.type(field, "Psilocybin is a tryptamine prodrug.{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "summary",
      "Psilocybin is a tryptamine prodrug.",
      "Psilocybin is a naturally occurring tryptamine prodrug.",
    );
  });

  it("offers a prompt for each hero field the article is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(
      <HeroSection article={buildSparseArticle()} showPreviewBadge={false} />,
      commit,
    );

    await editField("Substitutive name", "Diazepam");
    await editField("Summary", "A benzodiazepine.");

    expect(commit.mock.calls.map(([path, value, expected]) => [path, value, expected])).toEqual([
      ["identification.substitutive_name", "Diazepam", ""],
      ["summary", "A benzodiazepine.", ""],
    ]);
    expect(
      screen.getByRole("button", { name: "Edit Botanical name" }),
    ).toHaveTextContent("Add a botanical name");
    expect(
      screen.getByRole("button", { name: "Edit Common name" }),
    ).toHaveTextContent("Add a common name");
  });
});

// ---------------------------------------------------------------------------
// Tolerance
// ---------------------------------------------------------------------------

describe("tolerance inline editing", () => {
  it("keeps the three tolerance strings wired and adds the cross-tolerance entries", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<ToleranceSection article={buildProseArticle()} />, commit);

    await editField("Full Tolerance", "Four doses.");
    await editField("Cross tolerance entry 2", "Mescaline (partial)");

    expect(commit.mock.calls.map(([path, value]) => [path, value])).toEqual([
      ["tolerance.full_tolerance", "Four doses."],
      ["tolerance.cross_tolerance[1]", "Mescaline (partial)"],
    ]);
  });

  it("prompts for the tolerance strings an article is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<ToleranceSection article={buildSparseArticle()} />, commit);

    await editField("Half Tolerance", "Three days.");

    expect(commit).toHaveBeenCalledWith("tolerance.half_tolerance", "Three days.", "");
  });
});

// ---------------------------------------------------------------------------
// Subjective effects
// ---------------------------------------------------------------------------

describe("subjective effects inline editing", () => {
  it("wires the family notes, the sense note, and the subcategory note", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildProseArticle()} />, commit);

    await editField("Subjective effects overview", "Dose dependent.");
    await editField("Physical effects note", "Mild body load.");
    await editField("Cognitive effects note", "Associative.");
    await editField("Visual note", "Visuals lead.");
    await editField("Hallucinatory States note", "Above moderate doses.");
    await editField("General note", "A general physical note, revised.");

    expect(commit.mock.calls.map(([path]) => path)).toEqual([
      "subjective_effects.notes.overview",
      "subjective_effects.notes.physical",
      "subjective_effects.notes.cognitive",
      "subjective_effects.sensory.visual.note",
      // The subcategory key travels percent-encoded; the space would otherwise
      // be indistinguishable from path syntax.
      "subjective_effects.sensory.visual.subcategories.Hallucinatory%20States.note",
      "subjective_effects.physical.General.note",
    ]);
  });

  it("encodes a progressive-stage key that contains a dot", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildProseArticle()} />, commit);

    await editField("1. Taking Off note", "The first half hour.");

    // `1. Taking Off` verbatim would split into two segments and address
    // nothing. `%2E` keeps it one.
    expect(commit).toHaveBeenCalledWith(
      "subjective_effects.progressive_stages.1%2E%20Taking%20Off.note",
      "The first half hour.",
      "The first thirty minutes.",
    );
  });

  it("seeds the overview editor from the stored note, not the fallback sentence", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <SubjectiveEffectsSection article={buildSparseArticle()} />,
      commit,
    );

    // The paragraph shows a generic sentence when the note is empty. Seeding
    // the editor from it would let a reviewer save boilerplate as though
    // somebody had written it about this substance.
    const overview = container.querySelector(
      '[data-editable-path="subjective_effects.notes.overview"]',
    );
    expect(overview).toHaveTextContent("Add an overview note");
    expect(overview?.textContent).not.toContain("Effects vary widely");

    await user.click(
      screen.getByRole("button", { name: "Edit Subjective effects overview" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Edit Subjective effects overview" }),
    ).toHaveValue("");
  });

  it("prompts for the notes a rendered group is missing", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<SubjectiveEffectsSection article={buildSparseArticle()} />, commit);

    await editField("Physical effects note", "Sedating.");
    await editField("Bodily Control note", "Coordination degrades first.");
    await editField("1. Taking Off note", "Onset.");

    expect(commit.mock.calls.map(([path, , expected]) => [path, expected])).toEqual([
      ["subjective_effects.notes.physical", ""],
      ["subjective_effects.physical.Bodily%20Control.note", ""],
      ["subjective_effects.progressive_stages.1%2E%20Taking%20Off.note", ""],
    ]);
  });

  it("leaves the effect chips alone", () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <SubjectiveEffectsSection article={buildProseArticle()} />,
      commit,
    );

    // Subcategories are flattened and badge subtitles are regex-derived from
    // the description, so a chip has no single field to write back to.
    for (const path of editablePaths(container)) {
      expect(path).toMatch(/\.(note|overview|physical|cognitive)$/);
    }
    expect(
      screen.queryByRole("button", { name: /^Edit .*(Nausea|hallucination)/ }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pharmacology
// ---------------------------------------------------------------------------

describe("pharmacology inline editing", () => {
  it("edits pharmacodynamics as one block and pharmacokinetics one to one", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<PharmacologySection article={buildProseArticle()} />, commit);

    await user.click(screen.getByRole("button", { name: "Edit Pharmacodynamics" }));
    // Both paragraphs at once: they are one field split on the blank line, so a
    // per-paragraph editor would save one over the other.
    expect(
      screen.getByRole("textbox", { name: "Edit Pharmacodynamics" }),
    ).toHaveValue(
      "A partial agonist at 5-HT2A.\n\nAffinity at 5-HT1A is weaker but not negligible.",
    );
    await user.keyboard("{Escape}");

    await editField("Pharmacokinetics", "Dephosphorylated to psilocin.");

    expect(commit).toHaveBeenCalledExactlyOnceWith(
      "pharmacology.pharmacokinetics",
      "Dephosphorylated to psilocin.",
      "Dephosphorylated to psilocin in the gut.",
    );
  });

  it("never offers borrowed summary prose as a pharmacodynamics edit", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    const { container } = editingSurface(
      <PharmacologySection article={buildSparseArticle()} />,
      commit,
    );

    // The paragraph on screen is `pharmacology.summary`. Only the prompt is
    // editable, so saving cannot copy one field's prose into another.
    const editable = container.querySelector(
      '[data-editable-path="pharmacology.pharmacodynamics"]',
    );
    expect(editable).toHaveTextContent("Add pharmacodynamics");
    expect(
      within(container).getByText(/Positive allosteric modulation/),
    ).not.toHaveAttribute("data-editable-path");

    await editField("Pharmacodynamics", "Positive allosteric modulator at GABA-A.");
    expect(commit).toHaveBeenCalledWith(
      "pharmacology.pharmacodynamics",
      "Positive allosteric modulator at GABA-A.",
      "",
    );
  });

  it("prompts for pharmacokinetics when the text on screen is legacy metabolism", async () => {
    const commit = vi.fn(async (_path: string, value: string, _expected?: string) => value);
    editingSurface(<PharmacologySection article={buildSparseArticle()} />, commit);

    await editField("Pharmacokinetics", "Hepatic metabolism, renal excretion.");

    expect(commit).toHaveBeenCalledWith(
      "pharmacology.pharmacokinetics",
      "Hepatic metabolism, renal excretion.",
      "",
    );
  });
});
