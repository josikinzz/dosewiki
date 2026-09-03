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
export type DevCommitDestination = "convex" | "proposal";

/** The returned proposal the draft rebases; the card names it above the save controls. */
export type DevCommitRebase = {
  proposalId: string;
  reason: string | null;
  onDiscard: () => void;
};

/** Short id shown in the banner: the tail of a Convex id is what differs between rows. */
const PROPOSAL_ID_DISPLAY_LENGTH = 6;

const DESTINATION_COPY: Record<
  DevCommitDestination,
  { title: string; description: string; idle: string }
> = {
  convex: {
    title: "Save to Convex",
    description: "Save changes to Convex. Requires login to save.",
    idle: "Changes are saved to Convex and appear live instantly.",
  },
  proposal: {
    title: "Submit for review",
    description: "Submit changes for admin review. Requires login to submit.",
    idle: "Proposals wait in the review queue until an admin applies them.",
  },
};

type DevCommitCardProps = {
  notice: DevCommitNotice | null;
  /** Defaults to a direct Convex save; editors without approval rights propose instead. */
  destination?: DevCommitDestination;
  footerSlot?: ReactNode;
  /** The save controls (server health, save button). */
  actionSlot?: ReactNode;
  /**
   * Panel description. Override per tab so the copy names what is actually
   * being saved (e.g. "Save index layout changes to Convex. Requires login
   * to save."). Defaults to copy for the destination.
   */
  description?: ReactNode;
  /** Set while the draft was seeded from a returned proposal; the next save supersedes it. */
  rebase?: DevCommitRebase | null;
};

export function DevCommitCard({
  notice,
  destination = "convex",
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
          <span className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.35em]">Convex</span>
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
