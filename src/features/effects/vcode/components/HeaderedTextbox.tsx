import { PropsWithChildren } from "react";

import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export type HeaderedTextboxPresentation = "card" | "section";

interface HeaderedTextboxProps {
  /** Anchor id when the box is a table-of-contents destination. */
  id?: string;
  label?: string;
  header?: string;
  labelBackground?: string;
  headerBackground?: string;
  /** Narrative articles opt out of the intensity-card surface. */
  presentation?: HeaderedTextboxPresentation;
  /** Section rank in the surrounding article; card presentation is unchanged. */
  headingLevel?: 2 | 3;
}

/**
 * Intensity level boxes for effect descriptions.
 * Used to describe different intensity levels (Mild, Distinct, Strong, etc.)
 *
 * Adapts EffectIndex's headered-textbox to DoseWiki's visual style.
 * Uses neutral card surface with color-coded accent dot + label.
 */
export function HeaderedTextbox({
  id,
  label,
  header,
  presentation = "card",
  headingLevel = 3,
  children,
}: PropsWithChildren<HeaderedTextboxProps>) {
  // Map intensity levels to accent colors (dot + label text only)
  const getIntensityClasses = (level?: string): { text: string; dot: string } => {
    const normalized = level?.toLowerCase() || "";

    if (normalized.includes("1") || normalized.includes("mild") || normalized.includes("threshold")) {
      return { text: "text-[color:var(--theme-semantic-success-badge-text)]", dot: "bg-[color:var(--theme-semantic-success-badge-text)]" };
    }

    if (normalized.includes("2") || normalized.includes("distinct") || normalized.includes("light")) {
      return { text: "text-[color:var(--theme-semantic-info-badge-text)]", dot: "bg-[color:var(--theme-semantic-info-badge-text)]" };
    }

    if (normalized.includes("3") || normalized.includes("strong") || normalized.includes("moderate")) {
      return { text: "text-[color:var(--theme-semantic-caution-badge-text)]", dot: "bg-[color:var(--theme-semantic-caution-badge-text)]" };
    }

    if (normalized.includes("4") || normalized.includes("heavy") || normalized.includes("intense")) {
      return { text: "text-[color:var(--theme-semantic-unsafe-badge-text)]", dot: "bg-[color:var(--theme-semantic-unsafe-badge-text)]" };
    }

    if (normalized.includes("5") || normalized.includes("overwhelming")) {
      return { text: "text-[color:var(--theme-semantic-danger-badge-text)]", dot: "bg-[color:var(--theme-semantic-danger-badge-text)]" };
    }

    return { text: "theme-accent-emphasis", dot: "bg-[var(--theme-accent-strong)]" };
  };

  const intensity = getIntensityClasses(label);

  if (presentation === "section") {
    const Heading = headingLevel === 2 ? "h2" : "h3";
    return (
      <section id={id} className={cn("my-8", id && "scroll-mt-24")}>
        {(label || header) && (
          <Heading className="not-prose mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {label && (
              <span className="inline-flex items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${intensity.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${intensity.text}`}>
                  {label}
                </span>
              </span>
            )}
            {header && (
              <span className="theme-text-primary text-xl font-semibold">{header}</span>
            )}
          </Heading>
        )}
        <div className="type-supporting-copy theme-text-secondary space-y-5">{children}</div>
      </section>
    );
  }

  return (
    <Surface
      id={id}
      variant="effectPanel"
      padding="md"
      radius="lg"
      className={cn("my-5 sm:p-6", id ? "scroll-mt-24" : undefined)}
    >
      {(label || header) && (
        <div className="mb-3">
          <div className="flex items-baseline gap-2.5">
            {label && (
              <>
                <span className={`inline-block h-2 w-2 shrink-0 self-center rounded-full ${intensity.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${intensity.text}`}>
                  {label}
                </span>
              </>
            )}
            {header && (
              <span className="theme-text-primary text-base font-semibold">
                {header}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="effect-vcode-card-body type-supporting-copy theme-text-secondary">
        {children}
      </div>
    </Surface>
  );
}
