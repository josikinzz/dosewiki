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
      return { text: "text-emerald-300", dot: "bg-emerald-400" };
    }

    if (normalized.includes("2") || normalized.includes("distinct") || normalized.includes("light")) {
      return { text: "text-sky-300", dot: "bg-sky-400" };
    }

    if (normalized.includes("3") || normalized.includes("strong") || normalized.includes("moderate")) {
      return { text: "text-amber-300", dot: "bg-amber-400" };
    }

    if (normalized.includes("4") || normalized.includes("heavy") || normalized.includes("intense")) {
      return { text: "text-orange-300", dot: "bg-orange-400" };
    }

    if (normalized.includes("5") || normalized.includes("overwhelming")) {
      return { text: "text-red-300", dot: "bg-red-400" };
    }

    return { text: "theme-accent-emphasis", dot: "bg-[var(--theme-accent-strong)]" };
  };

  const intensity = getIntensityClasses(label);

  return (
    <div className="theme-card-surface my-4 rounded-xl border p-4">
      {(label || header) && (
        <div className="theme-horizontal-divider-block mb-3 pb-3">
          <div className="flex items-center gap-2.5">
            {label && (
              <>
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${intensity.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${intensity.text}`}>
                  {label}
                </span>
              </>
            )}
            {header && (
              <span className="theme-text-primary text-[15px] font-semibold">
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
