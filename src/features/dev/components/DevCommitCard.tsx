import type { ReactNode } from "react";
import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { isConvexEnabled } from "@/lib/convex";

export type DevCommitNotice = {
  type: "success" | "error";
  message: string;
};

type DevCommitCardProps = {
  notice: DevCommitNotice | null;
  trimmedAdminPassword: string;
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
  trimmedAdminPassword,
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
      return (
        <p className={notice.type === "error" ? "text-rose-300" : "text-emerald-300"}>
          {notice.message}
        </p>
      );
    }
    if (hasInvalidJsonDraft) {
      return <p className="text-xs text-rose-300">Fix JSON syntax before committing.</p>;
    }
    if (trimmedAdminPassword.length === 0) {
      return <p className="text-xs text-rose-300">Save your username and password above before committing.</p>;
    }
    if (passwordKey) {
      return <p className="text-xs text-white/55">Ready to commit as {passwordKey}.</p>;
    }
    return <p className="text-xs text-white/45">Commits trigger a fresh Vercel deployment.</p>;
  })();

  // When Convex is enabled, show Convex save card (requires login)
  if (convexEnabled) {
    return (
      <SectionCard className="space-y-4 bg-white/[0.04]">
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
              <p className={notice.type === "error" ? "text-rose-300" : "text-emerald-300"}>
                {notice.message}
              </p>
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

  // Fallback: GitHub commit card when Convex is not enabled
  return (
    <SectionCard className="space-y-4 bg-white/[0.04]">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">GitHub</p>
        <div className="flex items-center gap-2">
          <Icon icon="lucide:shield-check" size={20} className="text-fuchsia-200" />
          <h2 className="text-lg font-semibold text-fuchsia-200">Commit to GitHub</h2>
        </div>
        <p className="text-sm text-white/65">Use your saved username and password to push the current dataset live.</p>
        <p className="text-xs text-rose-300">After each commit, wait ~1 minute for the build, then refresh before committing again to keep the changelog stable.</p>
      </div>
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">{message}</div>
        <div className="flex flex-wrap gap-2">
          {actionSlot}
          <Button variant="default" size="pill" className="rounded-full" onClick={onCommit} disabled={isCommitDisabled}>
            <Icon icon="lucide:shield-check" size={16} />
            {isSaving ? "Saving…" : "Commit changes"}
          </Button>
        </div>
      </div>
      {footerSlot ? <div className="text-xs text-white/45">{footerSlot}</div> : null}
    </SectionCard>
  );
}
