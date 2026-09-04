"use client";

/**
 * Members: `/dev/members`. The account roster with the three things an admin
 * does to an account (change role, ban, issue a password reset) plus the
 * invite codes panel that creates accounts in the first place.
 *
 * Admin rows and the admin's own row show no actions: admins are seeded and
 * rotated from a workstation (`scripts/auth/seed-admin-accounts.mjs`), and
 * Convex refuses both targets anyway. The reset link is shown once; only its
 * hash is stored, so closing the notice is the end of it.
 */

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  EditorNotice,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
  type EditorNoticeMessage,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { getRoleDisplayName, type AppRole } from "@/lib/auth/roles";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import InviteCodesPanel from "./InviteCodesPanel";
import { RoleGuide } from "./RoleGuide";
import {
  banMember,
  fetchRoster,
  formatSeen,
  issueMemberReset,
  memberRowLock,
  setMemberRole,
  sortRoster,
  unbanMember,
  type ManagedRole,
  type MemberRoster,
  type MemberRow,
} from "./membersModel";

const ROLE_PILL_TONE: Record<AppRole, EditorStatusPillTone> = {
  admin: "info",
  editor: "success",
  contributor: "neutral",
  viewer: "caution",
};

const ROLE_OPTIONS = [
  { value: "editor", label: "Editor" },
  { value: "contributor", label: "Contributor" },
];

const SELF_LOCK_REASON = "This is your own account.";
const ADMIN_LOCK_REASON = "Admin accounts are managed from the seed script.";

type ResetLink = { email: string; href: string; copied: boolean };

export function MembersTab() {
  const [roster, setRoster] = useState<MemberRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRoster(await fetchRoster());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load members.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one action, reloads the roster, and reports the outcome. */
  const run = useCallback(
    async (email: string, action: () => Promise<void>, success: string) => {
      setPendingEmail(email);
      setNotice(null);
      try {
        await action();
        await load();
        setNotice({ tone: "success", message: success });
      } catch (error) {
        setNotice({
          tone: "danger",
          message: error instanceof Error ? error.message : "The change did not go through.",
        });
      } finally {
        setPendingEmail(null);
      }
    },
    [load],
  );

  const changeRole = (row: MemberRow, role: ManagedRole) =>
    run(row.email, () => setMemberRole(row.email, role), `${row.username ?? row.email} is now ${getRoleDisplayName(role).toLowerCase()}.`);

  const toggleBan = (row: MemberRow) =>
    row.bannedAt
      ? run(row.email, () => unbanMember(row.email), `${row.username ?? row.email} can sign in again.`)
      : run(row.email, () => banMember(row.email), `${row.username ?? row.email} is banned.`);

  const issueReset = (row: MemberRow) =>
    run(
      row.email,
      async () => {
        const path = await issueMemberReset(row.email);
        setResetLink({ email: row.email, href: new URL(path, window.location.origin).toString(), copied: false });
      },
      `Reset link issued for ${row.username ?? row.email}. It works once and expires in an hour.`,
    );

  const copyResetLink = async () => {
    if (!resetLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(resetLink.href);
      setResetLink({ ...resetLink, copied: true });
    } catch {
      setNotice({ tone: "danger", message: "Copy failed. Select the link and copy it by hand." });
    }
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:users"
        title="Members"
        description="Every account that can sign in. Roles take effect on the member's next request."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={roster === null && !loadError}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Refresh
          </Button>
        }
      >
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

        {loadError ? (
          <StateCard
            tone="danger"
            icon="lucide:circle-alert"
            title="Members did not load"
            description={loadError}
            compact
            actions={
              <Button type="button" variant="accent" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : roster === null ? (
          <StateCard tone="accent" loading title="Loading members" description="Fetching the roster." compact />
        ) : roster.members.length === 0 ? (
          <StateCard
            tone="neutral"
            icon="lucide:users"
            title="No members yet"
            description="Seed an admin from the workstation, then mint invite codes below."
            compact
          />
        ) : (
          <RosterTable
            roster={roster}
            pendingEmail={pendingEmail}
            onChangeRole={changeRole}
            onToggleBan={toggleBan}
            onIssueReset={issueReset}
          />
        )}
      </EditorSection>

      <EditorSection
        icon="lucide:shield-check"
        title="What each role can do"
        description="The same words an invitee reads on the invite page. Enforced server-side, not just hidden in the UI."
      >
        <RoleGuide roles={[ROLE_DESCRIPTIONS.admin, ROLE_DESCRIPTIONS.editor, ROLE_DESCRIPTIONS.contributor]} />
      </EditorSection>

      <EditorSection
        icon="lucide:ticket"
        title="Invite codes"
        description="A code creates one account at the role it names. Share the plaintext once; only its hash is kept."
      >
        <InviteCodesPanel />
      </EditorSection>
    </div>
  );
}

type RosterTableProps = {
  roster: MemberRoster;
  pendingEmail: string | null;
  onChangeRole: (row: MemberRow, role: ManagedRole) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

function RosterTable({ roster, pendingEmail, onChangeRole, onToggleBan, onIssueReset }: RosterTableProps) {
  return (
    <EditorTable className="md:min-w-[56rem]">
      <EditorTableHead>
        <EditorTableHeading>Member</EditorTableHeading>
        <EditorTableHeading>Role</EditorTableHeading>
        <EditorTableHeading>Last sign-in</EditorTableHeading>
        <EditorTableHeading>Status</EditorTableHeading>
        <EditorTableHeading>Invited by</EditorTableHeading>
        <EditorTableHeading>Actions</EditorTableHeading>
      </EditorTableHead>
      <EditorTableBody>
        {sortRoster(roster.members).map((row) => {
          const lock = memberRowLock(row, roster.self);
          const pending = pendingEmail === row.email;
          const label = row.username ?? row.email;
          return (
            <EditorTableRow key={row.email} data-member={row.email}>
              <EditorTableCell wide>
                <span className="block truncate font-mono text-sm font-medium theme-text-primary">{label}</span>
                <span className="theme-text-faint block truncate text-xs">
                  {row.name ? `${row.name} · ${row.email}` : row.email}
                </span>
              </EditorTableCell>
              <EditorTableCell label="Role">
                <EditorStatusPill tone={ROLE_PILL_TONE[row.role]}>{getRoleDisplayName(row.role)}</EditorStatusPill>
              </EditorTableCell>
              <EditorTableCell label="Last sign-in" className="theme-text-secondary text-sm">
                {formatSeen(row.lastSeenAt)}
              </EditorTableCell>
              <EditorTableCell label="Status">
                {row.bannedAt ? (
                  <EditorStatusPill tone="danger" icon="lucide:ban">Banned</EditorStatusPill>
                ) : (
                  <EditorStatusPill tone="success">Active</EditorStatusPill>
                )}
              </EditorTableCell>
              <EditorTableCell label="Invited by" className="theme-text-secondary text-sm">
                {row.invitedBy ?? "Seeded"}
              </EditorTableCell>
              <EditorTableCell wide>
                {lock === "admin" ? (
                  <span className="theme-text-faint text-xs">{ADMIN_LOCK_REASON}</span>
                ) : (
                  <RowActions
                    row={row}
                    disabled={pending || lock === "self"}
                    reason={lock === "self" ? SELF_LOCK_REASON : undefined}
                    onChangeRole={onChangeRole}
                    onToggleBan={onToggleBan}
                    onIssueReset={onIssueReset}
                  />
                )}
              </EditorTableCell>
            </EditorTableRow>
          );
        })}
      </EditorTableBody>
    </EditorTable>
  );
}

type RowActionsProps = {
  row: MemberRow;
  disabled: boolean;
  reason?: string;
  onChangeRole: (row: MemberRow, role: ManagedRole) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

function RowActions({ row, disabled, reason, onChangeRole, onToggleBan, onIssueReset }: RowActionsProps) {
  const label = row.username ?? row.email;
  // A legacy `viewer` row has no option of its own; the select shows the
  // placeholder until an admin picks a real role.
  const selectValue = row.role === "editor" || row.role === "contributor" ? row.role : "";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`Actions for ${label}`} role="group">
      <div className="w-full md:w-40">
        <EditorSelect
          aria-label={`Role for ${label}`}
          selectSize="sm"
          value={selectValue}
          placeholder={selectValue ? undefined : "Choose a role"}
          options={ROLE_OPTIONS}
          disabled={disabled}
          title={reason}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "editor" || next === "contributor") {
              onChangeRole(row, next);
            }
          }}
        />
      </div>
      <Button
        type="button"
        variant={row.bannedAt ? "outline" : "destructive"}
        size="sm"
        disabled={disabled}
        title={reason}
        onClick={() => onToggleBan(row)}
      >
        <Icon icon={row.bannedAt ? "lucide:user-check" : "lucide:ban"} size={14} />
        {row.bannedAt ? "Unban" : "Ban"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} title={reason} onClick={() => onIssueReset(row)}>
        <Icon icon="lucide:key-round" size={14} />
        Reset password
      </Button>
    </div>
  );
}
