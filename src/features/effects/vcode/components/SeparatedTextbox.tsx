import { PropsWithChildren } from "react";

interface SeparatedTextboxProps {
  leftHeader?: string;
  rightHeader?: string;
}

/**
 * Style variation comparison boxes.
 * Used to show contrasting effect variations (e.g., "Intricate vs Simple")
 *
 * Adapts EffectIndex's separated-textbox to DoseWiki's visual style.
 * Centered pair layout for readability.
 */
export function SeparatedTextbox({
  leftHeader,
  rightHeader,
  children,
}: PropsWithChildren<SeparatedTextboxProps>) {
  return (
    <div className="theme-card-surface my-4 rounded-xl border p-4">
      {(leftHeader || rightHeader) && (
        <div className="theme-horizontal-divider-block mb-3 pb-3">
          <div className="flex items-center justify-center gap-3">
            {leftHeader && (
              <span className="theme-accent-heading text-sm font-medium">
                {leftHeader}
              </span>
            )}
            {leftHeader && rightHeader && (
              <span className="theme-text-faint text-xs font-medium uppercase tracking-wider">vs</span>
            )}
            {rightHeader && (
              <span className="theme-accent-emphasis text-sm font-medium">
                {rightHeader}
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
