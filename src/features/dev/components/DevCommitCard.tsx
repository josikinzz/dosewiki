import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EditorNotice } from "./EditorNotice";
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

/** Where the primary action sends the draft: written to production or held for review. */
export type DevCommitDestination = "production" | "proposal";

/** The returned proposal the draft rebases; the card names it above the save controls. */
export type DevCommitRebase = {
  proposalId: string;
  reason: string | null;
  onDiscard: () => void;
};

/** Short id shown in the banner: the tail of a proposal id is what differs between rows. */
const PROPOSAL_ID_DISPLAY_LENGTH = 6;

/**
 * The one place the save model is spelled out. `eyebrow` names where the
 * draft goes, `title` is the verb on the button, `description` says what the
 * editor sees next. Tabs never add a second explanation.
 */
const DESTINATION_COPY: Record<
  DevCommitDestination,
  { eyebrow: string; title: string; description: string; idle: string }
> = {
  production: {
    eyebrow: "Live site",
    title: "Commit to production",
    description: "Edits stay in your draft until you commit them. Committed changes appear on the live site right away.",
    idle: "Nothing is published until you commit.",
  },
  proposal: {
    eyebrow: "Review queue",
    title: "Submit for review",
    description: "Edits stay in your draft until you submit them. An admin reviews the proposal before anything goes live.",
    idle: "Nothing is published until an admin applies your proposal.",
  },
};

type DevCommitCardProps = {
  notice: DevCommitNotice | null;
  /** Defaults to a production commit; editors without approval rights propose instead. */
  destination?: DevCommitDestination;
  footerSlot?: ReactNode;
  /** The save controls (server health, commit button). */
  actionSlot?: ReactNode;
  /**
   * Panel description. Override per tab only to name what is being
   * committed (e.g. "Index layout edits stay in your draft until you commit
   * them."). Defaults to copy for the destination.
   */
  description?: ReactNode;
  /** Set while the draft was seeded from a returned proposal; the next save supersedes it. */
  rebase?: DevCommitRebase | null;
};

export function DevCommitCard({
  notice,
  destination = "production",
  footerSlot,
  actionSlot,
  description,
  rebase,
}: DevCommitCardProps) {
  const copy = DESTINATION_COPY[destination];
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
          <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">{copy.eyebrow}</span>
          {copy.title}
        </span>
      }
      description={description ?? copy.description}
    >
      {rebase ? (
        <EditorNotice
          className="mb-3"
          notice={{
            tone: "info",
            icon: "lucide:git-branch",
            message: (
              <span data-testid="commit-rebase-banner">
                Rebasing proposal #{rebase.proposalId.slice(-PROPOSAL_ID_DISPLAY_LENGTH)}
                {rebase.reason ? ` - ${rebase.reason}` : ""}
              </span>
            ),
            actions: (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={rebase.onDiscard}>
                Discard
              </Button>
            ),
          }}
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
