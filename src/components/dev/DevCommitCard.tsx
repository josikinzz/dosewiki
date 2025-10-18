import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { SectionCard } from "../common/SectionCard";

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
};

const commitButtonClass =
  "flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

export function DevCommitCard({
  notice,
  trimmedAdminPassword,
  passwordKey,
  hasInvalidJsonDraft,
  isSaving,
  isCommitDisabled,
  onCommit,
  footerSlot,
}: DevCommitCardProps) {
  const message = (() => {
    if (notice) {
      return (
        <p className={notice.type === "error" ? "text-rose-300" : "text-emerald-300"}>
          {notice.message}
        </p>
      );
    }
    if (hasInvalidJsonDraft) {
      return <p className="text-xs text-amber-300">Fix JSON syntax before committing.</p>;
    }
    if (trimmedAdminPassword.length === 0) {
      return <p className="text-xs text-amber-300">Save your username and password above before committing.</p>;
    }
    if (passwordKey) {
      return <p className="text-xs text-white/55">Ready to commit as {passwordKey}.</p>;
    }
    return <p className="text-xs text-white/45">Commits trigger a fresh Vercel deployment.</p>;
  })();

  return (
    <SectionCard className="space-y-4 bg-white/[0.04]">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">GitHub</p>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-fuchsia-200" />
          <h2 className="text-lg font-semibold text-fuchsia-200">Commit to GitHub</h2>
        </div>
        <p className="text-sm text-white/65">Use your saved username and password to push the current dataset live.</p>
        <p className="text-xs text-amber-300">After each commit, wait ~1 minute for the build, then refresh before committing again to keep the changelog stable.</p>
      </div>
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">{message}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={commitButtonClass} onClick={onCommit} disabled={isCommitDisabled}>
            <ShieldCheck className="h-4 w-4" />
            {isSaving ? "Saving…" : "Commit changes"}
          </button>
        </div>
      </div>
      {footerSlot ? <div className="text-xs text-white/45">{footerSlot}</div> : null}
    </SectionCard>
  );
}
