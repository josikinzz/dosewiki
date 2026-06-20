import { type ReactNode, type PropsWithChildren } from "react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";

const helperTextClass = "theme-text-faint text-[11px]";

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
 * Gradient hairline divider line for form sections.
 * @deprecated Use FormSectionCard instead for section separation
 */
export const FormSectionDivider = () => (
  <div className="relative my-14 h-px w-full">
    <div className="absolute inset-0 h-px bg-[image:var(--theme-horizontal-divider-image)]" />
  </div>
);

/**
 * Card wrapper for form sections. Provides consistent styling for each major section.
 */
export const FormSectionCard = ({ children }: PropsWithChildren) => (
  <Surface variant="public" padding="lg" radius="xl">
    {children}
  </Surface>
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
  return (
    <CollapsibleEditorCard
      title={title}
      icon={icon}
      description={description}
      defaultExpanded={defaultExpanded}
    >
      {children}
    </CollapsibleEditorCard>
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
  return (
    <CollapsibleEditorCard
      title={title}
      icon={icon}
      description={description}
      defaultExpanded={defaultExpanded}
      density="compact"
    >
      {children}
    </CollapsibleEditorCard>
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
    <Surface
      variant="subtle"
      padding="sm"
      radius="md"
      className="space-y-4"
    >
      {label && (
        <p className="theme-text-faint text-[10px] font-medium uppercase tracking-wider -mb-1">
          {label}
        </p>
      )}
      {children}
    </Surface>
  );
}

export const SectionHeader = ({ title, description, icon }: SectionHeaderProps) => (
  <div className="space-y-1 mb-6">
    <div className="flex items-center gap-2.5">
      {icon && <span className="theme-icon-accent">{icon}</span>}
      <h2 className="theme-accent-heading text-lg font-semibold">{title}</h2>
    </div>
    {description && <p className="theme-text-muted mt-1 text-sm">{description}</p>}
  </div>
);

export const CharacterCount = ({ value }: CharacterCountProps) => (
  <p className="theme-text-faint text-[11px] text-right">{(value ?? "").length} characters</p>
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
