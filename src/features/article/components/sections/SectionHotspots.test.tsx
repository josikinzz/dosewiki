import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { DosageDurationSection } from "./DosageDurationSection";
import { HistoryCultureSection } from "./HistoryCultureSection";
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
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

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
          overview: "Overview ".repeat(60),
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

    fireEvent.click(screen.getByRole("button", { name: "Expand subjective effects overview" }));
    expect(screen.getByRole("button", { name: "Collapse subjective effects overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Focused thinking" }));
    expect(onSelectEffect).toHaveBeenCalledWith("focused-thinking");

    fireEvent.click(screen.getByRole("button", { name: "Expand Open eye visuals" }));
    expect(screen.getByText("Visual detail becomes sharper.")).toBeInTheDocument();
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

    expect(screen.getByRole("tab", { name: /Oral/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Expand notes" })[0]);
    expect(screen.getByText("Fasted onset is more reliable.")).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "Plateau" })).toBeInTheDocument();
  });
});
