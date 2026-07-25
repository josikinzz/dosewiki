import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { DosageDurationSection } from "./DosageDurationSection";
import { HistoryCultureSection } from "./HistoryCultureSection";
import { InteractionsSection } from "./InteractionsSection";
import { SubjectiveEffectsSection } from "./SubjectiveEffectsSection";

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

const SUBJECTIVE_STUB_TEXT =
  "This subjective effect section is a stub! Meaning it is very brief and potentially incomplete.";

/** Effect entries with no description, so each renders as a plain chip. */
function effectChips(...names: string[]) {
  return names.map((name) => ({ name, description: "" }));
}

function querySubjectiveStubNotice() {
  return screen.queryByRole("note", { name: "Subjective effects stub notice" });
}

describe("article section cleanup characterization", () => {
  it("expands history content and keeps keyword-based heading icon fallback intact", () => {
    const article = {
      ...createEmptyArticle(),
      title: "History Test",
      history_culture: {
        content: "",
        sections: [
          {
            heading: "Discovery in clinical settings",
            content: "1965 ".repeat(180),
            subsections: [],
          },
        ],
      },
    };

    render(<HistoryCultureSection article={article} />);

    expect(screen.getByText("Discovery in clinical settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand history and culture" })).toBeInTheDocument();
    expect(screen.getAllByText("1965").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Expand history and culture" }));

    expect(screen.getByRole("button", { name: "Collapse history and culture" })).toBeInTheDocument();
  });

  it("routes subjective effect badge interactions through selection and inline expansion", () => {
    const onSelectEffect = vi.fn();
    const article = {
      ...createEmptyArticle(),
      title: "Effects Test",
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        notes: {
          ...createEmptyArticle().subjective_effects.notes,
          overview: "Short subjective effects overview.",
        },
        cognitive: {
          General: {
            note: "",
            effects: [
              { name: "Focused thinking", description: "" },
              { name: "Open eye visuals", description: "(Common) - Visual detail becomes sharper." },
            ],
          },
        },
      },
    };

    render(<SubjectiveEffectsSection article={article} onSelectEffect={onSelectEffect} />);

    fireEvent.click(screen.getByRole("link", { name: "Focused thinking" }));
    expect(onSelectEffect).toHaveBeenCalledWith("focused-thinking");

    const effectButton = screen.getByRole("button", {
      name: "Expand Open eye visuals effect description",
    });
    expect(effectButton).toHaveAttribute("aria-controls", "effect-open-eye-visuals-description");
    fireEvent.click(effectButton);
    expect(screen.getByText("Visual detail becomes sharper.")).toBeInTheDocument();
  });

  it("uses the supporting-prose role for subjective subcategory notes", () => {
    const visualNote = "Visual geometry becomes more prominent at higher doses.";
    const cognitiveNote = "Thought patterns become more associative during the experience.";
    const defaults = createEmptyArticle();
    const article = {
      ...defaults,
      title: "Supporting prose test",
      subjective_effects: {
        ...defaults.subjective_effects,
        cognitive: {
          General: { note: cognitiveNote, effects: [] },
        },
        sensory: {
          ...defaults.subjective_effects.sensory,
          visual: {
            ...defaults.subjective_effects.sensory.visual,
            subcategories: {
              Geometry: { note: visualNote, effects: [] },
            },
          },
        },
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    for (const note of [visualNote, cognitiveNote]) {
      expect(screen.getByText(note)).toHaveClass("text-sm", "leading-relaxed");
      expect(screen.getByText(note)).not.toHaveClass("italic");
    }
  });

  it("renders the subjective effects stub banner when the stored flag is set", () => {
    const defaults = createEmptyArticle();
    // Four effects, so only the stored flag can be driving the banner here.
    const baseArticle = {
      ...defaults,
      title: "Stub Test",
      subjective_effects: {
        ...defaults.subjective_effects,
        notes: {
          ...defaults.subjective_effects.notes,
          overview: "Short subjective effects overview.",
        },
        cognitive: {
          General: {
            note: "",
            effects: effectChips("Anxiety", "Focus", "Euphoria", "Time distortion"),
          },
        },
      },
    };

    const { rerender } = render(
      <SubjectiveEffectsSection
        article={{
          ...baseArticle,
          subjective_effects: {
            ...baseArticle.subjective_effects,
            is_stub: true,
          },
        }}
      />,
    );

    expect(querySubjectiveStubNotice()).toBeInTheDocument();
    expect(screen.getByText(SUBJECTIVE_STUB_TEXT)).toBeInTheDocument();

    rerender(<SubjectiveEffectsSection article={baseArticle} />);

    expect(querySubjectiveStubNotice()).not.toBeInTheDocument();
    expect(screen.queryByText(SUBJECTIVE_STUB_TEXT)).not.toBeInTheDocument();
  });

  it("keeps a stub-only subjective effects section visible", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Stub Only Test",
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        is_stub: true,
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Subjective Effects" }),
    ).toBeInTheDocument();
    expect(screen.getByText(SUBJECTIVE_STUB_TEXT)).toBeInTheDocument();
  });

  it("leads the subjective effects section with the stub notice, above the intro prose", () => {
    const overview = "A distinctive overview paragraph for ordering.";
    const article = {
      ...createEmptyArticle(),
      title: "Stub Order Test",
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        is_stub: true,
        notes: { ...createEmptyArticle().subjective_effects.notes, overview },
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    const notice = querySubjectiveStubNotice();
    const intro = screen.getByText(overview);
    expect(notice).toBeInTheDocument();
    // The notice qualifies everything below it, so it must precede the prose.
    expect(
      notice!.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("computes the subjective effects stub banner at three or fewer effects", () => {
    const defaults = createEmptyArticle();
    const buildArticle = (names: string[]) => ({
      ...defaults,
      title: "Computed Stub Test",
      subjective_effects: {
        ...defaults.subjective_effects,
        notes: {
          ...defaults.subjective_effects.notes,
          overview: "Short subjective effects overview.",
        },
        physical: {
          General: { note: "", effects: effectChips(...names) },
        },
      },
    });

    const { rerender } = render(
      <SubjectiveEffectsSection
        article={buildArticle(["Sedation", "Nausea", "Muscle relaxation"])}
      />,
    );

    expect(querySubjectiveStubNotice()).toBeInTheDocument();

    rerender(
      <SubjectiveEffectsSection
        article={buildArticle(["Sedation", "Nausea", "Muscle relaxation", "Pupil dilation"])}
      />,
    );

    expect(querySubjectiveStubNotice()).not.toBeInTheDocument();
  });

  it("still flags a notes-heavy subjective effects section with two effects", () => {
    const defaults = createEmptyArticle();
    const article = {
      ...defaults,
      title: "Prose Heavy Test",
      subjective_effects: {
        ...defaults.subjective_effects,
        notes: {
          ...defaults.subjective_effects.notes,
          overview:
            "A long overview describing the arc of the experience in considerable detail.",
          physical: "Body load builds steadily through the come-up and eases at the peak.",
          cognitive: "Thought loops are common and often persist into the offset.",
        },
        physical: {
          General: { note: "", effects: effectChips("Sedation") },
        },
        cognitive: {
          General: { note: "", effects: effectChips("Thought loops") },
        },
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    expect(querySubjectiveStubNotice()).toBeInTheDocument();
  });

  it("counts a repeated effect name across subcategories once", () => {
    const defaults = createEmptyArticle();
    const article = {
      ...defaults,
      title: "Dedupe Test",
      subjective_effects: {
        ...defaults.subjective_effects,
        cognitive: {
          Stimulation: { note: "", effects: effectChips("Focus") },
          Sedation: { note: "", effects: effectChips("Focus") },
          General: { note: "", effects: effectChips("Anxiety", "Euphoria") },
        },
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    // Three distinct chips, not four — so the section still reads as a stub.
    expect(screen.getAllByRole("link", { name: "Focus" })).toHaveLength(1);
    expect(querySubjectiveStubNotice()).toBeInTheDocument();
  });

  it("renders the gap notice rather than a stub banner for an empty subjective effects section", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Empty Test",
    };

    render(<SubjectiveEffectsSection article={article} />);

    expect(querySubjectiveStubNotice()).not.toBeInTheDocument();
    expect(screen.queryByText(SUBJECTIVE_STUB_TEXT)).not.toBeInTheDocument();
    // The gap notice replaces the section outright, so the section's own
    // fallback overview never renders.
    expect(
      screen.queryByText("Effects vary widely by individual, dose, and context."),
    ).not.toBeInTheDocument();
  });

  it("routes archived Josie attribution author text to the archive URL", () => {
    const archiveUrl =
      "https://web.archive.org/web/20160803235227/https://psychonautwiki.org/wiki/Fentanyl";
    const article = {
      ...createEmptyArticle(),
      title: "Fentanyl",
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        notes: {
          ...createEmptyArticle().subjective_effects.notes,
          overview: "Archived subjective effects overview.",
        },
        attribution: {
          author: "Josie Kins",
          text: "Forked from Subjective Effect Documentation work by Josie Kins, August 2016.",
          url: archiveUrl,
        },
      },
    };

    const { container } = render(<SubjectiveEffectsSection article={article} />);

    expect(screen.getByRole("link", { name: "Josie Kins" })).toHaveAttribute(
      "href",
      archiveUrl,
    );
    expect(container).toHaveTextContent("Forked from Subjective Effect Documentation work");
    expect(container).toHaveTextContent("by Josie Kins");
    expect(container).toHaveTextContent("August 2016.");
    expect(
      screen.getByLabelText("Open original subjective effects documentation by Josie Kins"),
    ).toHaveAttribute("href", archiveUrl);
  });

  it("keeps non-archived Josie attribution author text on the contributor profile", () => {
    const sourceUrl =
      "https://disregardeverythingisay.com/post/60184360278/2c-b-broken-down-and-described";
    const article = {
      ...createEmptyArticle(),
      title: "2C-B",
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        notes: {
          ...createEmptyArticle().subjective_effects.notes,
          overview: "Subjective effects overview.",
        },
        attribution: {
          author: "Josie Kins",
          text: "Forked from Subjective Effect Documentation work by Josie Kins, September 2013.",
          url: sourceUrl,
        },
      },
    };

    render(<SubjectiveEffectsSection article={article} />);

    expect(screen.getByRole("link", { name: "Josie Kins" })).toHaveAttribute(
      "href",
      "/contributors/josie",
    );
    expect(
      screen.getByLabelText("Open original subjective effects documentation by Josie Kins"),
    ).toHaveAttribute("href", sourceUrl);
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
    expect(screen.getByRole("tab", { name: "Oral route" })).toHaveClass(
      "[@media(pointer:coarse)]:min-h-11",
    );

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

    const { container } = render(<DosageDurationSection article={article} />);

    expect(container.querySelector("[data-motion-exit='true']")).not.toBeInTheDocument();
    expect(screen.getByText("10-15 mg")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Insufflated route" }));

    expect(container.querySelector("[data-motion-exit='true']")).not.toBeInTheDocument();
    expect(screen.getByText("4-8 mg")).toBeInTheDocument();
    expect(screen.queryByText("10-15 mg")).not.toBeInTheDocument();
  });

  it("renders interaction severity hierarchy with non-color labels", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Interaction Test",
      interactions: {
        dangerous: ["MAOIs (Potentially life-threatening interaction.)"],
        unsafe: ["Tramadol"],
        caution: ["Cannabis"],
      },
    };

    const { container } = render(<InteractionsSection article={article} />);

    expect(screen.getByText("Highest risk")).toHaveClass("theme-interaction-severity-badge-danger");
    expect(screen.getByText("Avoid")).toHaveClass("theme-interaction-severity-badge-unsafe");
    expect(screen.getByText("Use caution")).toHaveClass("theme-interaction-severity-badge-caution");
    expect(container.querySelector(".theme-interaction-danger")).toBeInTheDocument();

    const expandButton = screen.getByRole("button", {
      name: "Expand MAOIs interaction rationale",
    });
    expect(expandButton).toHaveAttribute("aria-controls", "interaction-maois-dangerous");
    fireEvent.click(expandButton);
    expect(
      screen.getByRole("button", { name: "Collapse MAOIs interaction rationale" }),
    ).toHaveAttribute("aria-controls", "interaction-maois-dangerous");
  });
});
