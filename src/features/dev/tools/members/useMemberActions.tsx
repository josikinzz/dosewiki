"use client";

/**
 * The three things an admin does to an account (change permissions, ban,
 * issue a password reset), with their confirms and outcome notices. Saves are
 * immediate and there is no undo, so Ban and a permission change go through
 * the shared confirm dialog first; the account then shows what is happening
 * until the roster reloads. The reset link is shown once; only its hash is
 * stored, so closing the notice is the end of it.
 */

import { useCallback, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Notice, useConfirm, type NoticeMessage } from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { approvedGlossaryLocales, getRoleDisplayName, type ManagedRole } from "@/lib/auth/roles";
import {
  banMember,
  describePermissions,
  formatLocaleNames,
  issueMemberReset,
  setMemberRole,
  unbanMember,
  type MemberRow,
} from "./membersModel";

type ResetLink = { email: string; label: string; href: string; copied: boolean; confirmingDismiss: boolean };

/** A result, and the account it is about, so it lands in that account's pane. */
type MemberNotice = NoticeMessage & { email: string | null };

/** A refused write under the freeze reads as the freeze, not as the route's own words. */
const FROZEN_MEMBER_WRITE = "Writes are paused, so that was not saved.";

export type MemberPendingKind = "role" | "ban" | "unban" | "reset";

/** The one action in flight; its account shows the label until the roster reloads. */
export type MemberPendingAction = { email: string; kind: MemberPendingKind };

export const MEMBER_PENDING_LABEL: Record<MemberPendingKind, string> = {
  role: "Changing role",
  ban: "Banning",
  unban: "Unbanning",
  reset: "Issuing reset link",
};

export function useMemberActions(reload: () => Promise<void>) {
  const [pending, setPending] = useState<MemberPendingAction | null>(null);
  const [notice, setMemberNotice] = useState<MemberNotice | null>(null);
  const { frozen } = useWriteFreeze();
  /** Callers that set a notice without naming an account see it on every account. */
  const setNotice = useCallback((next: NoticeMessage | null) => setMemberNotice(next ? { ...next, email: null } : null), []);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);
  const { confirm, dialog } = useConfirm();

  /** Runs one action, reloads the roster, and reports the outcome. */
  const run = useCallback(
    async (email: string, kind: MemberPendingKind, action: () => Promise<void>, success: string, refresh = true) => {
      setPending({ email, kind });
      setMemberNotice(null);
      try {
        await action();
        if (refresh) await reload();
        if (success) setMemberNotice({ email, tone: "success", message: success });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The change did not go through.";
        setMemberNotice({ email, tone: "danger", message: frozen || /frozen|writes are paused/i.test(message) ? FROZEN_MEMBER_WRITE : message });
      } finally {
        setPending(null);
      }
    },
    [frozen, reload],
  );

  const changeRole = (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => {
    const label = row.username ?? row.email;
    confirm({
      title: `Change permissions for ${label}?`,
      description: `${label} goes from ${describePermissions(row.role, approvedGlossaryLocales(row))} to ${getRoleDisplayName(role)}. Approved glossary languages: ${formatLocaleNames(glossaryLocales)}. These permissions replace the current grant on their next request.`,
      confirmLabel: "Save permissions",
      onConfirm: () => void run(row.email, "role", () => setMemberRole(row.email, role, glossaryLocales), `Permissions saved for ${label}.`),
    });
  };

  const toggleBan = (row: MemberRow) => {
    const label = row.username ?? row.email;
    if (row.bannedAt) {
      confirm({
        title: `Unban ${label}?`,
        description: `${label} can sign in again at once, with the ${getRoleDisplayName(row.role)} permissions they held when banned.`,
        confirmLabel: "Unban",
        onConfirm: () => void run(row.email, "unban", () => unbanMember(row.email), `${label} can sign in again.`),
      });
      return;
    }
    confirm({
      title: `Ban ${label}?`,
      description: `${label} is refused on their next request and cannot sign in until an admin unbans them. Their account and edits stay.`,
      confirmLabel: "Ban",
      destructive: true,
      onConfirm: () => void run(row.email, "ban", () => banMember(row.email), `${label} is banned.`),
    });
  };

  const issueReset = (row: MemberRow) =>
    confirm({
      title: `Issue a password reset link for ${row.username ?? row.email}?`,
      description: `You get a one-time link to send ${row.username ?? row.email}; it works once and expires in an hour. Their current password keeps working until they use it, and any earlier reset link for them stops working.`,
      confirmLabel: "Issue reset link",
      onConfirm: () => issueResetNow(row),
    });

  const issueResetNow = (row: MemberRow) =>
    void run(
      row.email,
      "reset",
      async () => {
        const path = await issueMemberReset(row.email);
        setResetLink({ email: row.email, label: row.username ?? row.email, href: new URL(path, window.location.origin).toString(), copied: false, confirmingDismiss: false });
      },
      // The link card below says it all; a second success line would repeat it.
      "",
      false,
    );

  const copyResetLink = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.href);
      setResetLink({ ...resetLink, copied: true });
    } catch {
      setMemberNotice({ email: resetLink.email, tone: "danger", message: "Copy failed. Select the link and copy it by hand." });
    }
  };

  /** The results about `email` (and any not tied to an account): where the write was made. */
  const noticesFor = (email: string | null | undefined): ReactNode => {
    const showNotice = notice && (notice.email === null || email === undefined || notice.email === email);
    const showReset = resetLink && (email === undefined || resetLink.email === email);
    if (!showNotice && !showReset) return null;
    return (
      <>
        {showNotice ? <Notice tone={notice.tone} title={notice.title} message={notice.message} icon={notice.icon} actions={notice.actions} dismiss={() => setMemberNotice(null)} /> : null}
        {showReset ? (
          <Notice
            tone="info" icon="lucide:key-round" title={`Reset link for ${resetLink.label}`} message={(
                <span className="block space-y-1">
                  <span className="block">Send it to them privately. It works once and expires in an hour, and it is not shown again.</span>
                  <span className="block break-all font-mono text-xs" data-testid="reset-link">
                    {resetLink.href}
                  </span>
                </span>
              )} actions={resetLink.confirmingDismiss ? (
                <>
                  <span className="theme-text-secondary text-sm">Close without copying? The link cannot be shown again.</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setResetLink(null)}>
                    Close it
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setResetLink({ ...resetLink, confirmingDismiss: false })}>
                    Keep it
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="accent" size="sm" onClick={() => void copyResetLink()}>
                    <Icon icon={resetLink.copied ? "lucide:check" : "lucide:copy"} size={14} />
                    {resetLink.copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => (resetLink.copied ? setResetLink(null) : setResetLink({ ...resetLink, confirmingDismiss: true }))}
                  >
                    Dismiss
                  </Button>
                </>
              )}
          />
        ) : null}
      </>
    );
  };
  const notices: ReactNode = noticesFor(undefined);

  return { pending, changeRole, toggleBan, issueReset, notices, noticesFor, setNotice, confirm, dialog };
}
