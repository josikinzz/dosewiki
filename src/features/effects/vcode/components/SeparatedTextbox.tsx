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
    <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4 my-4">
      {(leftHeader || rightHeader) && (
        <div className="mb-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-center gap-3">
            {leftHeader && (
              <span className="text-sm font-medium text-fuchsia-300">
                {leftHeader}
              </span>
            )}
            {leftHeader && rightHeader && (
              <span className="text-xs font-medium text-white/30 uppercase tracking-wider">vs</span>
            )}
            {rightHeader && (
              <span className="text-sm font-medium text-violet-300">
                {rightHeader}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="effect-vcode-card-body type-supporting-copy text-white/80">
        {children}
      </div>
    </div>
  );
}
