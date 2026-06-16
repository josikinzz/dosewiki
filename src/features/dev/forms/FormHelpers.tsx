import { useState, type ReactNode, type PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";
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
 * @deprecated Use FormSectionCard instead for section separation
 */
export const FormSectionDivider = () => (
  <div className="relative my-14 h-px w-full">
    {/* Glow effect layer */}
    <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent blur-sm" />
    {/* Solid line layer */}
    <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/80 to-transparent" />
  </div>
);

/**
 * Card wrapper for form sections. Provides consistent styling for each major section.
 */
export const FormSectionCard = ({ children }: PropsWithChildren) => (
  <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#020617_40%,var(--theme-panel-base))] p-6">
    {children}
  </div>
);

/**
 * Collapsible card wrapper for form sections.
 * Used for sections that are less frequently edited or secondary data.
 */
export interface CollapsibleFormSectionCardProps extends PropsWithChildren {
  title: string;
  icon?: ReactNode;
  description?: string;
  defaultExpanded?: boolean;
}

export function CollapsibleFormSectionCard({
  title,
  icon,
  description,
  defaultExpanded = false,
  children,
}: CollapsibleFormSectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#020617_40%,var(--theme-panel-base))] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-[color-mix(in_srgb,#fff_2%,var(--theme-control-base))] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-fuchsia-300">{icon}</span>}
          <span className="text-lg font-semibold text-fuchsia-200">{title}</span>
        </div>
        {isExpanded ? (
          <Icon icon="lucide:chevron-down" size={20} className="text-white/40" />
        ) : (
          <Icon icon="lucide:chevron-right" size={20} className="text-white/40" />
        )}
      </button>
      {isExpanded && (
        <div className="p-6 space-y-6 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          {description && (
            <p className="text-sm text-white/60 -mt-2 mb-4">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible subsection within a form section.
 * Used to hide optional or secondary fields within an expanded section.
 */
export interface CollapsibleSubsectionProps extends PropsWithChildren {
  title: string;
  icon?: ReactNode;
  description?: string;
  defaultExpanded?: boolean;
}

export function CollapsibleSubsection({
  title,
  icon,
  description,
  defaultExpanded = false,
  children,
}: CollapsibleSubsectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-[color-mix(in_srgb,#fff_2%,var(--theme-control-base))] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-fuchsia-300">{icon}</span>}
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {isExpanded ? (
          <Icon icon="lucide:chevron-down" size={16} className="text-white/40" />
        ) : (
          <Icon icon="lucide:chevron-right" size={16} className="text-white/40" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          {description && (
            <p className="text-[11px] text-white/45 -mt-2">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Visual grouping container for related fields within a form section.
 * Provides subtle background separation without collapsible behavior.
 */
export interface FieldGroupProps extends PropsWithChildren {
  label?: string;
}

export function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div className="rounded-lg bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))] p-4 space-y-4">
      {label && (
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 -mb-1">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

export const SectionHeader = ({ title, description, icon }: SectionHeaderProps) => (
  <div className="space-y-1 mb-6">
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-fuchsia-300">{icon}</span>}
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
