import { Icon } from "./Icon";

interface ExpandButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
}

export function ExpandButton({ isExpanded, onToggle, className = "", label }: ExpandButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-label={label ?? (isExpanded ? "Collapse section" : "Expand section")}
      className={`flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${className}`}
    >
      <Icon icon="lucide:ellipsis" size={14} />
      {label && <span>{label}</span>}
      <Icon
        icon="lucide:chevron-down"
        size={14}
        className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}
