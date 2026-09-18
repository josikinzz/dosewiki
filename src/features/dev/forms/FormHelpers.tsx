import { type PropsWithChildren, type ReactNode } from "react";
import { get, useFormContext, useFormState, type FieldPath } from "react-hook-form";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
import type { SubstanceArticle } from "@/schema";

const helperTextClass = "theme-text-faint text-[11px]";

type SectionHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
};

type CharacterCountProps = {
  value: string;
};


/**
 * Collapsible free-floating wrapper for top-level form sections (accent
 * header + hairline via `CollapsibleEditorCard`; no card chrome).
 */
export interface CollapsibleFormSectionCardProps extends PropsWithChildren {
  title: string;
  icon?: ReactNode;
  description?: string;
  names: FieldPath<SubstanceArticle> | FieldPath<SubstanceArticle>[];
  defaultExpanded?: boolean;
}

export function CollapsibleFormSectionCard({
  title,
  icon,
  names,
  description,
  defaultExpanded = false,
  children,
}: CollapsibleFormSectionCardProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const fieldNames = Array.isArray(names) ? names : [names];
  const { errors } = useFormState({ control, name: fieldNames });
  const hasError = fieldNames.some((name) => Boolean(get(errors, name)));

  return (
    <CollapsibleEditorCard
      title={title}
      icon={icon}
      description={description}
      defaultExpanded={defaultExpanded}
      hasError={hasError}
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
  pairedIndicator?: boolean;
}

export function CollapsibleSubsection({
  title,
  icon,
  description,
  defaultExpanded = false,
  pairedIndicator = false,
  children,
}: CollapsibleSubsectionProps) {
  return (
    <CollapsibleEditorCard
      title={title}
      icon={icon}
      description={description}
      defaultExpanded={defaultExpanded}
      density="compact"
      pairedIndicator={pairedIndicator}
    >
      {children}
    </CollapsibleEditorCard>
  );
}

/**
 * Free-floating grouping for related fields within a form section.
 *
 * The parent accordion row already provides the card container, so a group of
 * fields inside it should read as free-floating — an optional micro-label and a
 * gradient hairline (the public `ArticleSection` DNA at sub-section scale),
 * never another nested card.
 */
export interface FieldGroupProps extends PropsWithChildren {
  label?: string;
}

export function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div className="space-y-4">
      {label ? (
        <div className="flex items-center gap-3">
          <p className="theme-text-faint whitespace-nowrap text-[10px] font-medium uppercase tracking-wider">
            {label}
          </p>
          <div className="theme-gradient-divider h-px flex-1" />
        </div>
      ) : null}
      {children}
    </div>
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



export { helperTextClass };
