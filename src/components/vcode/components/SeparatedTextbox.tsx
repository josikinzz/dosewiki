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
 */
export function SeparatedTextbox({ 
  leftHeader, 
  rightHeader, 
  children,
}: PropsWithChildren<SeparatedTextboxProps>) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 my-3">
      {(leftHeader || rightHeader) && (
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
          {leftHeader && (
            <span className="text-sm font-medium text-fuchsia-300">
              {leftHeader}
            </span>
          )}
          {leftHeader && rightHeader && (
            <span className="text-white/40 text-xs">vs</span>
          )}
          {rightHeader && (
            <span className="text-sm font-medium text-violet-300">
              {rightHeader}
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
