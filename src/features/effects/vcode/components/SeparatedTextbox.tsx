import { PropsWithChildren } from "react";

interface SeparatedTextboxProps {
  leftHeader?: string;
  rightHeader?: string;
}

/**
 * Style variation comparison blocks.
 * Used to show contrasting effect variations (e.g., "Intricate vs Simple")
 *
 * Typeset openly on the canvas rather than carded: a centered violet pair
 * heading over a gradient hairline, with the comparison prose below.
 */
export function SeparatedTextbox({
  leftHeader,
  rightHeader,
  children,
}: PropsWithChildren<SeparatedTextboxProps>) {
  return (
    <div className="my-10">
      {(leftHeader || rightHeader) && (
        <div className="mb-4">
          <div className="flex items-center justify-center gap-3 pb-2.5">
            {leftHeader && (
              <span className="theme-accent-heading text-base font-semibold sm:text-lg">
                {leftHeader}
              </span>
            )}
            {leftHeader && rightHeader && (
              <span className="theme-text-faint text-xs font-medium uppercase tracking-wider">vs</span>
            )}
            {rightHeader && (
              <span className="theme-accent-heading text-base font-semibold sm:text-lg">
                {rightHeader}
              </span>
            )}
          </div>
          <div className="theme-horizontal-divider h-px" />
        </div>
      )}
      <div className="effect-vcode-card-body type-supporting-copy theme-text-secondary">
        {children}
      </div>
    </div>
  );
}
