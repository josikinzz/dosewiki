import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

const helperTextClass = "text-[11px] text-white/45";

type SectionHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
};

type CharacterCountProps = {
  value: string;
};

type ListPreviewProps = {
  items: string[];
  emptyLabel: string;
};

/**
 * Glowing pink divider line for form sections.
 */
export const FormSectionDivider = () => (
  <div className="relative my-14 h-px w-full">
    {/* Glow effect layer */}
    <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent blur-sm" />
    {/* Solid line layer */}
    <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/80 to-transparent" />
  </div>
);

export const SectionHeader = ({ title, description, icon }: SectionHeaderProps) => (
  <div className="space-y-1">
    <FormSectionDivider />
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-fuchsia-400">{icon}</span>}
      <h2 className="text-lg font-semibold text-fuchsia-200">{title}</h2>
    </div>
    {description && <p className="mt-1 text-sm text-white/60">{description}</p>}
  </div>
);

export const CharacterCount = ({ value }: CharacterCountProps) => (
  <p className="text-[11px] text-right text-white/40">{(value ?? "").length} characters</p>
);

export const ListPreview = ({ items, emptyLabel }: ListPreviewProps) => {
  if (!items || items.length === 0) {
    return <p className={helperTextClass}>{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {items.map((item, index) => (
        <Badge
          key={`${item}-${index}`}
          variant="secondary"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
};

export { helperTextClass };
