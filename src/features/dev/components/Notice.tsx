"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon, type IconName } from "@/components/common/Icon";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";

export type NoticeTone =
  | "neutral"
  | "info"
  | "loading"
  | "success"
  | "warning"
  | "danger";

export type NoticePlacement = "inline" | "page";

export interface NoticeMessage {
  tone?: NoticeTone;
  title?: ReactNode;
  message: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
}

export interface NoticeProps {
  tone?: NoticeTone;
  placement?: NoticePlacement;
  dismiss?: () => void;
  autoClearMs?: number | null;
  title?: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const NOTICE_AUTO_CLEAR_MS = 6000;

const pageVariantByTone = {
  neutral: "default",
  info: "default",
  loading: "default",
  success: "success",
  warning: "warning",
  danger: "destructive",
} as const;

const pillToneByTone: Record<NoticeTone, EditorStatusPillTone> = {
  neutral: "neutral",
  info: "info",
  loading: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const iconByTone: Record<NoticeTone, IconName> = {
  neutral: "lucide:info",
  info: "lucide:info",
  loading: "lucide:loader-circle",
  success: "lucide:badge-check",
  warning: "lucide:triangle-alert",
  danger: "lucide:circle-alert",
};

const inlineIconByTone: Record<NoticeTone, IconName> = {
  ...iconByTone,
  success: "lucide:check",
  danger: "lucide:triangle-alert",
};

export function noticeLiveRole(tone: NoticeTone) {
  return tone === "danger"
    ? ({ role: "alert" } as const)
    : ({ role: "status", "aria-live": "polite" } as const);
}

function useSuccessAutoClear(
  tone: NoticeTone,
  dismiss: (() => void) | undefined,
  delay: number | null,
  messageKey: unknown,
) {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const enabled = tone === "success" && dismiss !== undefined && delay !== null && delay > 0;

  useEffect(() => {
    if (!enabled || delay === null) {
      return;
    }
    const timer = window.setTimeout(() => dismissRef.current?.(), delay);
    return () => window.clearTimeout(timer);
  }, [delay, enabled, messageKey]);
}

export function Notice({
  tone = "neutral",
  placement = "page",
  dismiss,
  autoClearMs,
  title,
  message,
  children,
  icon,
  actions,
  className,
  headingLevel,
}: NoticeProps) {
  const body = message ?? children;
  const delay = autoClearMs === undefined ? (actions ? null : NOTICE_AUTO_CLEAR_MS) : autoClearMs;
  useSuccessAutoClear(tone, dismiss, delay, typeof body === "string" ? body : null);
  const loading = tone === "loading";

  if (placement === "inline") {
    const pill = (
      <EditorStatusPill
        tone={pillToneByTone[tone]}
        icon={icon ?? inlineIconByTone[tone]}
        loading={loading}
        {...noticeLiveRole(tone)}
        className={cn("max-w-full whitespace-normal text-left", actions ? undefined : className)}
      >
        {title ? <span className="font-semibold">{title}</span> : null}
        <span className="min-w-0">{body}</span>
        {dismiss ? (
          <button
            type="button"
            onClick={dismiss}
            className={cn("theme-focus-ring-tight -mr-0.5 ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100", TOUCH_HALO)}
          >
            <Icon icon="lucide:x" size={12} />
            <span className="sr-only">Dismiss notice</span>
          </button>
        ) : null}
      </EditorStatusPill>
    );
    return actions ? (
      <span className={cn("inline-flex max-w-full flex-wrap items-center gap-2", className)}>
        {pill}
        {actions}
      </span>
    ) : pill;
  }

  const glyph = icon ?? iconByTone[tone];

  return (
    <Alert
      variant={pageVariantByTone[tone]}
      className={cn("pr-4", className)}
      {...noticeLiveRole(tone)}
      aria-busy={loading || undefined}
    >
      <Icon icon={glyph} size={16} className={loading ? "animate-spin" : undefined} />
      <div className="min-w-0">
        {title ? (
          <AlertTitle role={headingLevel ? "heading" : undefined} aria-level={headingLevel}>
            {title}
          </AlertTitle>
        ) : null}
        <AlertDescription>{body}</AlertDescription>
      </div>
      {actions || dismiss ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-7">
          {actions}
          {dismiss ? (
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={dismiss}
              className={cn("theme-focus-ring-tight theme-text-muted inline-flex items-center text-xs font-medium underline-offset-2 hover:underline", TOUCH_HALO)}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </Alert>
  );
}
