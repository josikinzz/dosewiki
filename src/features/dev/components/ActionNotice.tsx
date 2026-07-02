import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";

export type ActionNoticeTone = Extract<
  EditorStatusPillTone,
  "success" | "danger" | "info" | "warning"
>;

export interface ActionNoticeProps {
  tone?: ActionNoticeTone;
  /** Overrides the tone's default glyph. */
  icon?: IconName;
  /** Swaps the glyph for a spinner while an action is in flight. */
  loading?: boolean;
  /** When provided, renders a small dismiss button after the message. */
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
}

const toneIcon: Record<ActionNoticeTone, IconName> = {
  success: "lucide:check",
  danger: "lucide:triangle-alert",
  info: "lucide:info",
  warning: "lucide:triangle-alert",
};

/**
 * Compact inline feedback pill for action results. Render it *adjacent to the
 * control that triggered the action* (inside the same toolbar/action group)
 * so the outcome is visible where the user is looking — not in a page-level
 * notice slot that may be scrolled off-viewport.
 *
 * Success/info/warning announce politely; `tone="danger"` renders as an
 * assertive `role="alert"`.
 *
 * Usage:
 *   {copyStatus ? (
 *     <ActionNotice tone={copyStatus.ok ? "success" : "danger"} onDismiss={clear}>
 *       {copyStatus.message}
 *     </ActionNotice>
 *   ) : null}
 */
export function ActionNotice({
  tone = "success",
  icon,
  loading = false,
  onDismiss,
  className,
  children,
}: ActionNoticeProps) {
  const isError = tone === "danger";

  return (
    <EditorStatusPill
      tone={tone}
      icon={icon ?? toneIcon[tone]}
      loading={loading}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn("max-w-full whitespace-normal text-left", className)}
    >
      <span className="min-w-0">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="theme-focus-ring-tight -mr-0.5 ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        >
          <Icon icon="lucide:x" size={12} />
          <span className="sr-only">Dismiss notice</span>
        </button>
      ) : null}
    </EditorStatusPill>
  );
}
