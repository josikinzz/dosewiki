import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

type EditorNoticeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface EditorNoticeMessage {
  tone?: EditorNoticeTone;
  title?: ReactNode;
  message: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  live?: boolean;
}

export interface EditorNoticeProps {
  notice: EditorNoticeMessage;
  className?: string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

const noticeVariantByTone = {
  neutral: "default",
  info: "default",
  success: "success",
  warning: "warning",
  danger: "destructive",
} as const;

const noticeIconByTone: Record<EditorNoticeTone, IconName> = {
  neutral: "lucide:info",
  info: "lucide:info",
  success: "lucide:badge-check",
  warning: "lucide:triangle-alert",
  danger: "lucide:circle-alert",
};

export function EditorNotice({ notice, className, headingLevel }: EditorNoticeProps) {
  const tone = notice.tone ?? "neutral";
  const live = notice.live ?? tone === "danger";

  return (
    <Alert
      variant={noticeVariantByTone[tone]}
      className={cn("pr-4", className)}
      role={live ? "alert" : "note"}
      aria-live={live ? "polite" : undefined}
    >
      <Icon icon={notice.icon ?? noticeIconByTone[tone]} size={16} />
      <div className={cn("min-w-0", notice.actions ? "pr-24" : undefined)}>
        {notice.title ? <AlertTitle role={headingLevel ? "heading" : undefined} aria-level={headingLevel}>{notice.title}</AlertTitle> : null}
        <AlertDescription>{notice.message}</AlertDescription>
      </div>
      {notice.actions ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-7">{notice.actions}</div>
      ) : null}
    </Alert>
  );
}
