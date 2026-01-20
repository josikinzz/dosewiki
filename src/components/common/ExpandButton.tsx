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
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80 ${className}`}
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
