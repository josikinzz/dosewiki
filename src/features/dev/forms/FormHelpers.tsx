import { type PropsWithChildren, type ReactNode } from "react";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";

type SectionHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
};

type CharacterCountProps = {
  value: string;
};

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

export interface FieldGroupProps extends PropsWithChildren {
  label?: string;
}

export function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div className="space-y-4">
      {label ? (
        <div className="flex items-center gap-3">
          <p className="type-meta-label theme-text-faint whitespace-nowrap">
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
