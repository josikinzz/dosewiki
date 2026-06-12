import { PropsWithChildren } from "react";

interface HeaderedTextboxProps {
  label?: string;
  header?: string;
  labelBackground?: string;
  headerBackground?: string;
}

/**
 * Intensity level boxes for effect descriptions.
 * Used to describe different intensity levels (Mild, Distinct, Strong, etc.)
 *
 * Adapts EffectIndex's headered-textbox to DoseWiki's visual style.
 * Uses neutral card surface with color-coded accent dot + label.
 */
export function HeaderedTextbox({
  label,
  header,
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

  return (
    <div className="theme-effect-neutral-panel my-5 rounded-xl border p-5 sm:p-6">
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
    </div>
  );
}
