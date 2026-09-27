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
  /**
   * Render as a `span` rather than the Badge's `div`, for a pill inside
   * phrasing content (a row button, a sentence) where a block is invalid.
   */
  inline?: boolean;
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
  inline = false,
  className,
  children,
  ...props
}: EditorStatusPillProps) {
  const content = (
    <>
      {loading ? (
        <Icon icon="lucide:loader-2" size={13} className="shrink-0 animate-spin" />
      ) : icon ? (
        <Icon icon={icon} size={13} className="shrink-0" />
      ) : null}
      {children}
    </>
  );
  return (
    <Badge
      asChild={inline}
      variant="outline"
      data-badge-tone={statusPillBadgeTone[tone]}
      className={cn(
        // A 24px pill on one line; on a phone a long status (a save line)
        // wraps inside a taller capsule instead of spilling out of it.
        // A status pill carries a sentence ("Saved", "Each save goes live
        // right away."), so it sets sentence type. The Badge recipe's
        // `type-chip-label` sits later in the same cascade layer than
        // Tailwind's case and tracking utilities, so plain `normal-case`
        // loses to it; the important modifier is what makes these stick.
        "theme-status-badge h-auto min-h-6 max-w-full gap-1.5 border-transparent py-0.5 text-xs! font-medium! normal-case! leading-snug! tracking-normal!",
        className,
      )}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {inline ? <span>{content}</span> : content}
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
