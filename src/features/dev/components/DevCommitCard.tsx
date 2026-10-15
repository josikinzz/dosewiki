import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "./Notice";
import { EditorSection } from "./EditorSection";

const noticeToneByType = {
  error: "danger",
  pending: "loading",
  success: "success",
} as const;

export type DevCommitNotice = {
  type: "success" | "error" | "pending";
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export type DevCommitDestination = "production" | "proposal";

export type DevCommitRebase = {
  proposalId: string;
  reason: string | null;
  onDiscard: () => void;
};

const PROPOSAL_ID_DISPLAY_LENGTH = 6;

const DESTINATION_COPY: Record<
  DevCommitDestination,
  { title: string; description: string; idle: string }
> = {
  production: {
    title: "Commit to production",
    description:
      "Edits from Tags and Index layout collect in one draft. Commit lists every change and asks once before any of it goes live.",
    idle: "Nothing is published until you commit.",
  },
  proposal: {
    title: "Submit for review",
    description:
      "Edits from Tags and Index layout collect in one draft. Submit sends all of it to an admin, who reviews it before anything goes live.",
    idle: "Nothing is published until an admin applies your proposal.",
  },
};

type DevCommitCardProps = {
  notice: DevCommitNotice | null;
  destination?: DevCommitDestination;
  footerSlot?: ReactNode;
  actionSlot?: ReactNode;
  description?: ReactNode;
  rebase?: DevCommitRebase | null;
  onDismissNotice?: () => void;
};

export function DevCommitCard({
  notice,
  destination = "production",
  footerSlot,
  actionSlot,
  description,
  rebase,
  onDismissNotice,
}: DevCommitCardProps) {
  const copy = DESTINATION_COPY[destination];
  const noticeContent = notice ? (
    <Notice
      placement="inline"
      tone={noticeToneByType[notice.type]}
      dismiss={notice.type === "pending" ? undefined : onDismissNotice}
      autoClearMs={null}
      actions={notice.actionHref ? (
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <a href={notice.actionHref} target="_blank" rel="noreferrer">
            {notice.actionLabel ?? "Open"}
          </a>
        </Button>
      ) : undefined}
    >
      {notice.message}
    </Notice>
  ) : null;

  return (
    <EditorSection
      icon="lucide:shield-check"
      title={copy.title}
      description={description ?? copy.description}
    >
      {rebase ? (
        <Notice
          className="mb-3"
          tone="info" icon="lucide:file-pen-line" message={(
              <span data-testid="commit-rebase-banner">
                Revising returned proposal #{rebase.proposalId.slice(-PROPOSAL_ID_DISPLAY_LENGTH)}
                {rebase.reason ? `: ${rebase.reason}` : ""}
              </span>
            )} actions={(
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={rebase.onDiscard}>
                Discard
              </Button>
            )}
        />
      ) : null}
      <div className="flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">
        <div className="min-h-[1.25rem]">
          {noticeContent ?? (
            <p className="theme-text-faint text-xs">{copy.idle}</p>
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
