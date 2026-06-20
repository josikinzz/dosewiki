import type { ReactNode } from "react";
import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
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
}: DevCommitCardProps) {
  const convexEnabled = isConvexEnabled();

  const message = (() => {
    if (notice) {
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
    }
    if (hasInvalidJsonDraft) {
      return (
        <p className="text-xs text-[color:var(--theme-danger-text)]">
          Fix JSON syntax before committing.
        </p>
      );
    }
    if (passwordKey) {
      return <p className="theme-text-muted text-xs">Ready to commit as {passwordKey}.</p>;
    }
    if (!hasEditorSession) {
      return (
        <p className="text-xs text-[color:var(--theme-danger-text)]">
          Sign in before committing changes.
        </p>
      );
    }
    return (
      <p className="theme-text-faint text-xs">
        GitHub archives are not the live Convex save path.
      </p>
    );
  })();

  // When Convex is enabled, show Convex save card (requires login)
  if (convexEnabled) {
    return (
      <SectionCard className="theme-public-card space-y-4">
        <div className="space-y-1">
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">Convex</p>
          <div className="flex items-center gap-2">
            <Icon icon="lucide:shield-check" size={20} className="theme-icon-accent" />
            <h2 className="theme-accent-heading text-lg font-semibold">Save to Convex</h2>
          </div>
          <p className="theme-text-secondary text-sm">
            Save article changes to Convex. Requires login to save.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
          <div className="min-h-[1.25rem]">
            {notice ? (
              message
            ) : (
              <p className="theme-text-faint text-xs">Changes are saved to Convex and appear live instantly.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {actionSlot}
          </div>
        </div>
        {footerSlot ? <div className="theme-text-faint text-xs">{footerSlot}</div> : null}
      </SectionCard>
    );
  }

  // Fallback: GitHub archive card when Convex is not enabled
  return (
    <SectionCard className="theme-public-card space-y-4">
      <div className="space-y-1">
        <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">GitHub</p>
        <div className="flex items-center gap-2">
          <Icon icon="lucide:shield-check" size={20} className="theme-icon-accent" />
          <h2 className="theme-accent-heading text-lg font-semibold">Archive to GitHub</h2>
        </div>
        <p className="theme-text-secondary text-sm">Export the current editor data to GitHub-backed files for archive workflows.</p>
        <p className="text-xs text-[color:var(--theme-danger-text)]">This is not the canonical live runtime save path. Live editor writes go through Convex.</p>
      </div>
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">{message}</div>
        <div className="flex flex-wrap gap-2">
          {actionSlot}
          <Button variant="default" size="pill" className="rounded-full" onClick={onCommit} disabled={isCommitDisabled}>
            <Icon icon="lucide:shield-check" size={16} />
            {isSaving ? "Archiving…" : "Archive changes"}
          </Button>
        </div>
      </div>
      {footerSlot ? <div className="theme-text-faint text-xs">{footerSlot}</div> : null}
    </SectionCard>
  );
}
