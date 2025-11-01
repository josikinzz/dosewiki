import type { PropsWithChildren } from "react";

export type UiJsonToggleMode = "ui" | "json";

export interface UiJsonToggleProps {
  mode: UiJsonToggleMode;
  onUiClick: () => void;
  onJsonClick: () => void;
  className?: string;
  uiLabel?: string;
  jsonLabel?: string;
  groupLabel?: string;
}

const baseWrapperClass =
  "mx-auto flex w-fit flex-wrap justify-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-1 text-xs shadow-inner shadow-black/20 sm:flex-nowrap sm:gap-1";
const baseButtonClass = "inline-flex items-center justify-center rounded-full px-4 py-1.5 font-semibold transition";
const activeButtonClass = "bg-fuchsia-500/20 text-white";
const inactiveButtonClass = "text-white/70 hover:text-white";

export function UiJsonToggle({
  mode,
  onUiClick,
  onJsonClick,
  className,
  uiLabel = "UI view",
  jsonLabel = "JSON view",
  groupLabel = "Toggle article view",
}: UiJsonToggleProps) {
  const wrapperClassName = [baseWrapperClass, className].filter(Boolean).join(" ");

  return (
    <div role="group" aria-label={groupLabel} className={wrapperClassName}>
      <ToggleButton pressed={mode === "ui"} onClick={onUiClick}>
        {uiLabel}
      </ToggleButton>
      <ToggleButton pressed={mode === "json"} onClick={onJsonClick}>
        {jsonLabel}
      </ToggleButton>
    </div>
  );
}

interface ToggleButtonProps extends PropsWithChildren {
  pressed: boolean;
  onClick: () => void;
}

function ToggleButton({ pressed, onClick, children }: ToggleButtonProps) {
  const className = [baseButtonClass, pressed ? activeButtonClass : inactiveButtonClass]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={className}>
      {children}
    </button>
  );
}
