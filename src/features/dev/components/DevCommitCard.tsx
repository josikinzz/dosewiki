import type { ReactNode } from "react";
import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { isConvexEnabled } from "@/lib/convex";

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

  const noticeToneClass =
    notice?.type === "error"
      ? "text-rose-300"
      : notice?.type === "pending"
        ? "text-cyan-200"
        : "text-emerald-300";

  const noticeIcon =
    notice?.type === "error"
      ? "lucide:triangle-alert"
      : notice?.type === "pending"
        ? "lucide:loader-circle"
        : "lucide:badge-check";
  
  const message = (() => {
    if (notice) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 ${noticeToneClass}`}>
            <Icon
              icon={noticeIcon}
              size={16}
              className={notice?.type === "pending" ? "animate-spin" : undefined}
            />
            <span>{notice.message}</span>
          </span>
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
      return <p className="text-xs text-rose-300">Fix JSON syntax before committing.</p>;
    }
    if (passwordKey) {
      return <p className="text-xs text-white/55">Ready to commit as {passwordKey}.</p>;
    }
    if (!hasEditorSession) {
      return <p className="text-xs text-rose-300">Sign in before committing changes.</p>;
    }
    return <p className="text-xs text-white/45">GitHub archives are not the live Convex save path.</p>;
  })();

  // When Convex is enabled, show Convex save card (requires login)
  if (convexEnabled) {
    return (
      <SectionCard className="space-y-4 bg-[color-mix(in_srgb,#fff_4%,var(--theme-panel-base))]">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Convex</p>
          <div className="flex items-center gap-2">
            <Icon icon="lucide:shield-check" size={20} className="text-cyan-300" />
            <h2 className="text-lg font-semibold text-cyan-200">Save to Convex</h2>
          </div>
          <p className="text-sm text-white/65">
            Save article changes to Convex. Requires login to save.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
          <div className="min-h-[1.25rem]">
            {notice ? (
              message
            ) : (
              <p className="text-xs text-white/45">Changes are saved to Convex and appear live instantly.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {actionSlot}
          </div>
        </div>
        {footerSlot ? <div className="text-xs text-white/45">{footerSlot}</div> : null}
      </SectionCard>
    );
  }

  // Fallback: GitHub archive card when Convex is not enabled
  return (
    <SectionCard className="space-y-4 bg-[color-mix(in_srgb,#fff_4%,var(--theme-panel-base))]">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">GitHub</p>
        <div className="flex items-center gap-2">
          <Icon icon="lucide:shield-check" size={20} className="text-fuchsia-200" />
          <h2 className="text-lg font-semibold text-fuchsia-200">Archive to GitHub</h2>
        </div>
        <p className="text-sm text-white/65">Export the current editor data to GitHub-backed files for archive workflows.</p>
        <p className="text-xs text-rose-300">This is not the canonical live runtime save path. Live editor writes go through Convex.</p>
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
      {footerSlot ? <div className="text-xs text-white/45">{footerSlot}</div> : null}
    </SectionCard>
  );
}
