import type { ReactNode } from "react";
import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { EditorSection } from "./EditorSection";
import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";
import { isConvexEnabled } from "@/lib/convex";

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
  hasEditorSession: boolean;
  passwordKey: string | null;
  hasInvalidJsonDraft: boolean;
  isSaving: boolean;
  isCommitDisabled: boolean;
  onCommit: () => void;
  footerSlot?: ReactNode;
  /** Optional slot for action buttons to the left of the commit button */
  actionSlot?: ReactNode;
  /**
   * Panel description. Override per tab so the copy names what is actually
   * being saved (e.g. "Save index layout changes to Convex. Requires login
   * to save."). Defaults to neutral "Save changes…" copy.
   */
  description?: ReactNode;
};

export function DevCommitCard({
  notice,
  hasEditorSession,
  passwordKey,
  hasInvalidJsonDraft,
  isSaving,
  isCommitDisabled,
  onCommit,
  footerSlot,
  actionSlot,
  description,
}: DevCommitCardProps) {
  const convexEnabled = isConvexEnabled();

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

  // When Convex is enabled, show Convex save block (requires login)
  if (convexEnabled) {
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

  // Fallback: GitHub archive block when Convex is not enabled. The commit
  // preflight warnings below only apply to this archive path.
  const githubMessage =
    noticeContent ??
    (hasInvalidJsonDraft ? (
      <p className="text-xs text-[color:var(--theme-danger-text)]">
        Fix JSON syntax before committing.
      </p>
    ) : passwordKey ? (
      <p className="theme-text-muted text-xs">Ready to commit as {passwordKey}.</p>
    ) : !hasEditorSession ? (
      <p className="text-xs text-[color:var(--theme-danger-text)]">
        Sign in before committing changes.
      </p>
    ) : (
      <p className="theme-text-faint text-xs">
        GitHub archives are not the live Convex save path.
      </p>
    ));

  return (
    <EditorSection
      icon="lucide:shield-check"
      title={
        <span className="flex flex-col gap-0.5">
          <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">GitHub</span>
          Archive to GitHub
        </span>
      }
      description={
        <>
          Export the current editor data to GitHub-backed files for archive workflows.
          <span className="mt-1 block text-xs text-[color:var(--theme-danger-text)]">
            This is not the canonical live runtime save path. Live editor writes go through Convex.
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">{githubMessage}</div>
        <div className="flex flex-wrap gap-2">
          {actionSlot}
          <Button variant="default" size="pill" className="rounded-full" onClick={onCommit} disabled={isCommitDisabled}>
            <Icon icon="lucide:shield-check" size={16} />
            {isSaving ? "Archiving…" : "Archive changes"}
          </Button>
        </div>
      </div>
      {footerSlot ? <div className="theme-text-faint text-xs">{footerSlot}</div> : null}
    </EditorSection>
  );
}
