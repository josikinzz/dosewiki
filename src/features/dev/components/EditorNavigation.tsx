import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export interface EditorNavOption {
  value: string;
  label: ReactNode;
  icon?: IconName;
  badge?: ReactNode;
  disabled?: boolean;
  controls?: string;
}

export interface EditorNavTabsProps {
  label: string;
  options: EditorNavOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function EditorNavTabs({
  label,
  options,
  value,
  onChange,
  className,
}: EditorNavTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={option.controls}
            disabled={option.disabled}
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "rounded-lg",
              selected
                ? "theme-text-primary border-[color:var(--editor-panel-border-strong)] bg-[var(--editor-panel-bg)]"
                : "theme-text-muted",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <Icon icon={option.icon} size={15} /> : null}
            <span>{option.label}</span>
            {option.badge ? <Badge variant="secondary">{option.badge}</Badge> : null}
          </Button>
        );
      })}
    </div>
  );
}

export interface EditorSegmentedControlProps {
  label: string;
  options: EditorNavOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function EditorSegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: EditorSegmentedControlProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <Icon icon={option.icon} size={15} /> : null}
            <span>{option.label}</span>
            {option.badge ? <Badge variant="secondary">{option.badge}</Badge> : null}
          </Button>
        );
      })}
    </div>
  );
}
