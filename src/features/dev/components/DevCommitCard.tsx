import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EditorSection } from "./EditorSection";
import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";

const noticeToneMap: Record<
  DevCommitNotice["type"],
  { tone: EditorStatusPillTone; icon: "lucide:triangle-alert" | "lucide:loader-circle" | "lucide:badge-check" }
> = {
  error: { tone: "danger", icon: "lucide:triangle-alert" },
  pending: { tone: "info", icon: "lucide:loader-circle" },
  success: { tone: "success", icon: "lucide:badge-check" },
};

export type DevCommitNotice = {
  type: "success" | "error" | "pending";
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

type DevCommitCardProps = {
  notice: DevCommitNotice | null;
  footerSlot?: ReactNode;
  /** The save controls (server health, save button). */
  actionSlot?: ReactNode;
  /**
   * Panel description. Override per tab so the copy names what is actually
   * being saved (e.g. "Save index layout changes to Convex. Requires login
   * to save."). Defaults to neutral "Save changes…" copy.
   */
  description?: ReactNode;
};

export function DevCommitCard({ notice, footerSlot, actionSlot, description }: DevCommitCardProps) {
  const noticeContent = notice
    ? (() => {
        const meta = noticeToneMap[notice.type];
        return (
          <div className="flex flex-wrap items-center gap-3">
            <EditorStatusPill
              tone={meta.tone}
              icon={meta.icon}
              loading={notice.type === "pending"}
              live
            >
              {notice.message}
            </EditorStatusPill>
            {notice.actionHref ? (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={notice.actionHref} target="_blank" rel="noreferrer">
                  {notice.actionLabel ?? "Open"}
                </a>
              </Button>
            ) : null}
          </div>
        );
      })()
    : null;

  return (
    <EditorSection
      icon="lucide:shield-check"
      title={
        <span className="flex flex-col gap-0.5">
          <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">Convex</span>
          Save to Convex
        </span>
      }
      description={description ?? "Save changes to Convex. Requires login to save."}
    >
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">
          {noticeContent ?? (
            <p className="theme-text-faint text-xs">Changes are saved to Convex and appear live instantly.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {actionSlot}
        </div>
      </div>
      {footerSlot ? <div className="theme-text-faint text-xs">{footerSlot}</div> : null}
    </EditorSection>
  );
}
