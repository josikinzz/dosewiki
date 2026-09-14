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

/**
 * Status-pill tones. `caution` is the canonical amber tone; `warning` is kept
 * as a backward-compatible alias so existing call sites do not break.
 */
export type EditorStatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "caution"
  | "warning"
  | "danger";

type StatusBadgeTone =
  | "red"
  | "rose"
  | "yellow"
  | "orange"
  | "blue"
  | "green"
  | "emerald"
  | "gray"
  | "white";

export interface EditorStatusPillProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  tone?: EditorStatusPillTone;
  loading?: boolean;
  live?: boolean;
  icon?: IconName;
  children: ReactNode;
}

/**
 * Map the semantic pill tone onto a .theme-status-badge[data-badge-tone] value.
 * Both themes share the ring + glow + inset structure via the
 * --theme-semantic-*-badge-* token families, so there are no baked hexes and
 * no forbidden cyan here. info => blue per the design canon.
 */
const statusPillBadgeTone: Record<EditorStatusPillTone, StatusBadgeTone> = {
  neutral: "gray",
  info: "blue",
  success: "green",
  caution: "yellow",
  warning: "yellow",
  danger: "rose",
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
      data-badge-tone={statusPillBadgeTone[tone]}
      className={cn(
        "theme-status-badge gap-1.5 border-transparent normal-case tracking-normal",
        className,
      )}
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
