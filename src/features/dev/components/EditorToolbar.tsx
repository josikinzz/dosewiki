import type { HTMLAttributes, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export interface EditorToolbarProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  variant?: "wrap" | "compact" | "sticky" | "split";
}

const toolbarVariantClasses: Record<NonNullable<EditorToolbarProps["variant"]>, string> = {
  wrap: "flex flex-wrap items-center gap-3",
  compact: "flex flex-wrap items-center gap-2",
  sticky:
    "sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[color:var(--editor-toolbar-separator)] bg-[var(--editor-panel-bg)]/95 p-3 backdrop-blur",
  split: "flex flex-wrap items-center justify-between gap-3",
};

export function EditorToolbar({
  label = "Editor actions",
  variant = "wrap",
  className,
  ...props
}: EditorToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn(toolbarVariantClasses[variant], className)}
      {...props}
    />
  );
}

export interface EditorActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  align?: "start" | "end";
  separatorBefore?: boolean;
}

export function EditorActionGroup({
  label,
  align = "start",
  separatorBefore = false,
  className,
  ...props
}: EditorActionGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "end" ? "justify-end" : "justify-start",
        separatorBefore
          ? "border-t border-[color:var(--editor-toolbar-separator)] pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"
          : undefined,
        className,
      )}
      {...props}
    />
  );
}

export type EditorStatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface EditorStatusPillProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  tone?: EditorStatusPillTone;
  loading?: boolean;
  live?: boolean;
  icon?: IconName;
  children: ReactNode;
}

const statusPillToneClasses: Record<EditorStatusPillTone, string> = {
  neutral: "border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] text-[var(--editor-chip-text)]",
  info: "theme-accent-emphasis border-[color:var(--editor-panel-border-strong)] bg-[var(--editor-panel-bg-subtle)]",
  success:
    "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  warning:
    "border-amber-400/30 bg-amber-500/10 text-amber-100",
  danger:
    "border-rose-400/30 bg-rose-500/10 text-rose-100",
};

export function EditorStatusPill({
  tone = "neutral",
  loading = false,
  live = false,
  icon,
  className,
  children,
  ...props
}: EditorStatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 normal-case tracking-normal", statusPillToneClasses[tone], className)}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Icon icon="lucide:loader-2" size={13} className="animate-spin" />
      ) : icon ? (
        <Icon icon={icon} size={13} />
      ) : null}
      {children}
    </Badge>
  );
}

export type EditorActionStatusState = "dirty" | "saved" | "saving" | "error";

export interface EditorActionStatusProps
  extends Omit<EditorStatusPillProps, "children" | "tone" | "loading" | "icon"> {
  status: EditorActionStatusState;
  message?: ReactNode;
}

const actionStatusMeta: Record<
  EditorActionStatusState,
  {
    label: string;
    tone: EditorStatusPillTone;
    icon: IconName;
    loading?: boolean;
  }
> = {
  dirty: {
    label: "Unsaved changes",
    tone: "warning",
    icon: "lucide:circle-dot",
  },
  saved: {
    label: "Saved",
    tone: "success",
    icon: "lucide:check",
  },
  saving: {
    label: "Saving",
    tone: "info",
    icon: "lucide:loader-2",
    loading: true,
  },
  error: {
    label: "Save failed",
    tone: "danger",
    icon: "lucide:triangle-alert",
  },
};

export function EditorActionStatus({
  status,
  message,
  live = true,
  ...props
}: EditorActionStatusProps) {
  const meta = actionStatusMeta[status];

  return (
    <EditorStatusPill
      tone={meta.tone}
      icon={meta.icon}
      loading={meta.loading}
      live={live}
      {...props}
    >
      {message ?? meta.label}
    </EditorStatusPill>
  );
}
