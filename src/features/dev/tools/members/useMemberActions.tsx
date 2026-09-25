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
import { EditorNotice, useConfirm, type EditorNoticeMessage } from "@/features/dev/components";
import { getRoleDisplayName, type ManagedRole } from "@/lib/auth/roles";
import {
  banMember,
  formatLocaleNames,
  issueMemberReset,
  setMemberRole,
  unbanMember,
  type MemberRow,
} from "./membersModel";

type ResetLink = { email: string; href: string; copied: boolean };

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
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);
  const { confirm, dialog } = useConfirm();

  /** Runs one action, reloads the roster, and reports the outcome. */
  const run = useCallback(
    async (email: string, kind: MemberPendingKind, action: () => Promise<void>, success: string, refresh = true) => {
      setPending({ email, kind });
      setNotice(null);
      try {
        await action();
        if (refresh) await reload();
        setNotice({ tone: "success", message: success });
      } catch (error) {
        setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The change did not go through." });
      } finally {
        setPending(null);
      }
    },
    [reload],
  );

  const changeRole = (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => {
    const label = row.username ?? row.email;
    confirm({
      title: `Change permissions for ${label}?`,
      description: `${label}: ${getRoleDisplayName(role)}. Approved glossary languages: ${formatLocaleNames(glossaryLocales)}. These permissions replace the current grant on their next request.`,
      confirmLabel: "Save permissions",
      onConfirm: () => void run(row.email, "role", () => setMemberRole(row.email, role, glossaryLocales), `Permissions saved for ${label}.`),
    });
  };

  const toggleBan = (row: MemberRow) => {
    const label = row.username ?? row.email;
    if (row.bannedAt) {
      void run(row.email, "unban", () => unbanMember(row.email), `${label} can sign in again.`);
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
    void run(
      row.email,
      "reset",
      async () => {
        const path = await issueMemberReset(row.email);
        setResetLink({ email: row.email, href: new URL(path, window.location.origin).toString(), copied: false });
      },
      `Reset link issued for ${row.username ?? row.email}. It works once and expires in an hour.`,
      false,
    );

  const copyResetLink = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.href);
      setResetLink({ ...resetLink, copied: true });
    } catch {
      setNotice({ tone: "danger", message: "Copy failed. Select the link and copy it by hand." });
    }
  };

  const notices: ReactNode = (
    <>
      {notice ? <EditorNotice notice={notice} /> : null}
      {resetLink ? (
        <EditorNotice
          notice={{
            tone: "info",
            icon: "lucide:key-round",
            title: `Reset link for ${resetLink.email}`,
            message: (
              <span className="block break-all font-mono text-xs" data-testid="reset-link">
                {resetLink.href}
              </span>
            ),
            actions: (
              <>
                <Button type="button" variant="accent" size="sm" onClick={() => void copyResetLink()}>
                  <Icon icon={resetLink.copied ? "lucide:check" : "lucide:copy"} size={14} />
                  {resetLink.copied ? "Copied" : "Copy link"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setResetLink(null)}>
                  Dismiss
                </Button>
              </>
            ),
          }}
        />
      ) : null}
    </>
  );

  return { pending, changeRole, toggleBan, issueReset, notices, setNotice, confirm, dialog };
}
