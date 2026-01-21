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
 */
export function HeaderedTextbox({ 
  label, 
  header, 
  children,
}: PropsWithChildren<HeaderedTextboxProps>) {
  // Map intensity levels to DoseWiki-appropriate colors
  const getIntensityClasses = (level?: string): { border: string; bg: string; text: string } => {
    const normalized = level?.toLowerCase() || "";
    
    if (normalized.includes("1") || normalized.includes("mild") || normalized.includes("threshold")) {
      return {
        border: "border-emerald-400/30",
        bg: "bg-emerald-500/10",
        text: "text-emerald-300",
      };
    }
    
    if (normalized.includes("2") || normalized.includes("distinct") || normalized.includes("light")) {
      return {
        border: "border-sky-400/30",
        bg: "bg-sky-500/10",
        text: "text-sky-300",
      };
    }
    
    if (normalized.includes("3") || normalized.includes("strong") || normalized.includes("moderate")) {
      return {
        border: "border-amber-400/30",
        bg: "bg-amber-500/10",
        text: "text-amber-300",
      };
    }
    
    if (normalized.includes("4") || normalized.includes("heavy") || normalized.includes("intense")) {
      return {
        border: "border-orange-400/30",
        bg: "bg-orange-500/10",
        text: "text-orange-300",
      };
    }
    
    if (normalized.includes("5") || normalized.includes("overwhelming")) {
      return {
        border: "border-red-400/30",
        bg: "bg-red-500/10",
        text: "text-red-300",
      };
    }
    
    // Default fuchsia style
    return {
      border: "border-fuchsia-400/30",
      bg: "bg-fuchsia-500/10",
      text: "text-fuchsia-300",
    };
  };

  const intensity = getIntensityClasses(label);

  return (
    <div className={`rounded-xl ${intensity.border} ${intensity.bg} p-4 my-3`}>
      {(label || header) && (
        <div className="flex items-center gap-3 mb-2">
          {label && (
            <span className={`text-xs font-semibold uppercase tracking-wider ${intensity.text}`}>
              {label}
            </span>
          )}
          {header && (
            <span className="text-sm font-medium text-white/90">
              {header}
            </span>
          )}
        </div>
      )}
      <div className="text-sm text-white/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
