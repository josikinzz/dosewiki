import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { SubjectiveEffectsSection } from "./SubjectiveEffectsSection";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
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

describe("SubjectiveEffectsSection", () => {
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
    expect(container).toHaveTextContent("by");
    expect(container).toHaveTextContent("Josie Kins");
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

    render(
      <SubjectiveEffectsSection
        article={article}
        attributionHref="/contributors/josie"
      />,
    );

    expect(screen.getByRole("link", { name: "Josie Kins" })).toHaveAttribute(
      "href",
      "/contributors/josie",
    );
    expect(
      screen.getByLabelText("Open original subjective effects documentation by Josie Kins"),
    ).toHaveAttribute("href", sourceUrl);
  });

  it("renders the replication showcase after every subjective effects subsection", () => {
    const defaults = createEmptyArticle();
    const article = {
      ...defaults,
      title: "Showcase placement test",
      comparisons: [
        {
          drug: "Comparator",
          comparison: "Reference comparison.",
        },
      ],
      subjective_effects: {
        ...defaults.subjective_effects,
        notes: {
          ...defaults.subjective_effects.notes,
          overview: "Subjective effects overview.",
        },
        sensory: {
          ...defaults.subjective_effects.sensory,
          visual: {
            ...defaults.subjective_effects.sensory.visual,
            subcategories: {
              Geometry: {
                note: "",
                effects: effectChips("Geometry"),
              },
            },
          },
        },
        attribution: {
          author: "Test Contributor",
          text: "Test contributor attribution.",
          url: "https://example.com/source",
        },
      },
    };

    render(
      <SubjectiveEffectsSection
        article={article}
        attributionHref="/contributors/test-contributor"
        replicationShowcaseSection={
          <div data-testid="replication-showcase">Replication slideshow</div>
        }
      />,
    );

    const showcase = screen.getByTestId("replication-showcase");
    const comparison = screen.getByText("Reference comparison.");
    const attribution = screen.getByRole("link", { name: "Test Contributor" });

    expect(
      comparison.compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      attribution.compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
