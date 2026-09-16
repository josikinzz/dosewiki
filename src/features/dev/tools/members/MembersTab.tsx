"use client";

/**
 * Members: `/dev/members`. The account roster with the three things an admin
 * does to an account (change role, ban, issue a password reset) plus the
 * invite codes panel that creates accounts in the first place.
 *
 * Saves are immediate and there is no undo, so Ban and a role change go
 * through the shared confirm dialog first; the row then shows what is
 * happening until the roster reloads. Admin rows and the admin's own row show
 * no actions: admins are seeded and rotated from a workstation
 * (`scripts/auth/seed-admin-accounts.mjs`), and Postgres refuses both targets
 * anyway. The reset link is shown once; only its hash is stored, so closing
 * the notice is the end of it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
  LoadErrorState,
  useConfirm,
  type EditorNoticeMessage,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { approvedGlossaryLocales, getRoleDisplayName, isManagedRole, roleMeetsFloor, type AppRole, type ManagedRole } from "@/lib/auth/roles";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import InviteCodesPanel from "./InviteCodesPanel";
import { RoleGuide } from "./RoleGuide";
import { MemberPermissionFields } from "./MemberPermissionFields";
import {
  banMember,
  fetchRoster,
  formatSeen,
  issueMemberReset,
  memberRowLock,
  setMemberRole,
  sortRoster,
  unbanMember,
  type MemberRoster,
  type MemberRow,
} from "./membersModel";

const ROLE_PILL_TONE: Record<AppRole, EditorStatusPillTone> = {
  admin: "info",
  editor: "success",
  editor_translator: "success",
  translator: "success",
  contributor: "neutral",
  viewer: "caution",
};


const SELF_LOCK_REASON = "This is your own account.";
const ADMIN_LOCK_REASON = "Admin accounts are managed from the seed script.";

type ResetLink = { email: string; href: string; copied: boolean };

type PendingKind = "role" | "ban" | "unban" | "reset";

/** The one action in flight; its row shows the label until the roster reloads. */
type PendingAction = { email: string; kind: PendingKind };

const PENDING_LABEL: Record<PendingKind, string> = {
  role: "Changing role",
  ban: "Banning",
  unban: "Unbanning",
  reset: "Issuing reset link",
};

export function MembersTab() {
  const [roster, setRoster] = useState<MemberRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRoster(await fetchRoster());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load members.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one action, reloads the roster, and reports the outcome. */
  const run = useCallback(
    async (
      email: string,
      kind: PendingKind,
      action: () => Promise<void>,
      success: string,
      refresh = true,
    ) => {
      setPending({ email, kind });
      setNotice(null);
      try {
        await action();
        if (refresh) await load();
        setNotice({ tone: "success", message: success });
      } catch (error) {
        setNotice({
          tone: "danger",
          message:
            error instanceof Error
              ? error.message
              : "The change did not go through.",
        });
      } finally {
        setPending(null);
      }
    },
    [load],
  );

  const changeRole = (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => {
    const label = row.username ?? row.email;
    const next = getRoleDisplayName(role);
    confirm({
      title: `Change permissions for ${label}?`,
      description: `${label}: ${next}. Approved glossary languages: ${glossaryLocales.join(", ") || "none"}. These permissions replace the current grant on their next request.`,
      confirmLabel: "Save permissions",
      onConfirm: () => {
        void run(
          row.email,
          "role",
          () => setMemberRole(row.email, role, glossaryLocales),
          `Permissions saved for ${label}.`,
        );
      },
    });
  };

  const toggleBan = (row: MemberRow) => {
    const label = row.username ?? row.email;
    if (row.bannedAt) {
      void run(
        row.email,
        "unban",
        () => unbanMember(row.email),
        `${label} can sign in again.`,
      );
      return;
    }
    confirm({
      title: `Ban ${label}?`,
      description: `${label} is refused on their next request and cannot sign in until an admin unbans them. Their account and edits stay.`,
      confirmLabel: "Ban",
      destructive: true,
      onConfirm: () => {
        void run(
          row.email,
          "ban",
          () => banMember(row.email),
          `${label} is banned.`,
        );
      },
    });
  };

  const issueReset = (row: MemberRow) =>
    run(
      row.email,
      "reset",
      async () => {
        const path = await issueMemberReset(row.email);
        setResetLink({
          email: row.email,
          href: new URL(path, window.location.origin).toString(),
          copied: false,
        });
      },
      `Reset link issued for ${row.username ?? row.email}. It works once and expires in an hour.`,
      false,
    );

  const copyResetLink = async () => {
    if (!resetLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(resetLink.href);
      setResetLink({ ...resetLink, copied: true });
    } catch {
      setNotice({
        tone: "danger",
        message: "Copy failed. Select the link and copy it by hand.",
      });
    }
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:users"
        title="Members"
        description="Every account that can sign in. Roles take effect on the member's next request."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={roster === null && !loadError}
          >
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
                <span
                  className="block break-all font-mono text-xs"
                  data-testid="reset-link"
                >
                  {resetLink.href}
                </span>
              ),
              actions: (
                <>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() => void copyResetLink()}
                  >
                    <Icon
                      icon={resetLink.copied ? "lucide:check" : "lucide:copy"}
                      size={14}
                    />
                    {resetLink.copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetLink(null)}
                  >
                    Dismiss
                  </Button>
                </>
              ),
            }}
          />
        ) : null}

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void load()} />
        ) : roster === null ? (
          <StateCard loading compact title="Loading members" />
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
            pending={pending}
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
        <RoleGuide
          roles={[
            ROLE_DESCRIPTIONS.admin,
            ROLE_DESCRIPTIONS.editor,
            ROLE_DESCRIPTIONS.translator,
            ROLE_DESCRIPTIONS.editor_translator,
            ROLE_DESCRIPTIONS.contributor,
          ]}
        />
      </EditorSection>

      <EditorSection
        icon="lucide:ticket"
        title="Invite codes"
        description="The only way an account is created. Each code grants one role; the plaintext is shown once."
      >
        <InviteCodesPanel />
      </EditorSection>

      {dialog}
    </div>
  );
}

type RosterTableProps = {
  roster: MemberRoster;
  pending: PendingAction | null;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

/** A live pill that replaces the row's state while an action is in flight. */
function PendingPill({ kind }: { kind: PendingKind }) {
  return (
    <EditorStatusPill tone="info" loading live>
      {PENDING_LABEL[kind]}
    </EditorStatusPill>
  );
}

function RosterTable({
  roster,
  pending,
  onChangeRole,
  onToggleBan,
  onIssueReset,
}: RosterTableProps) {
  const sortedMembers = useMemo(() => sortRoster(roster.members), [roster.members]);
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
        {sortedMembers.map((row) => {
          const lock = memberRowLock(row, roster.self);
          const inFlight = pending?.email === row.email ? pending.kind : null;
          const label = row.username ?? row.email;
          return (
            <EditorTableRow key={row.email} data-member={row.email}>
              <EditorTableCell wide>
                <span className="block truncate font-mono text-sm font-medium theme-text-primary">
                  {label}
                </span>
                <span className="theme-text-faint block truncate text-xs">
                  {row.name ? `${row.name} · ${row.email}` : row.email}
                </span>
              </EditorTableCell>
              <EditorTableCell label="Role">
                {inFlight === "role" ? (
                  <PendingPill kind="role" />
                ) : (
                  <EditorStatusPill tone={ROLE_PILL_TONE[row.role]}>
                    {getRoleDisplayName(row.role)}
                  </EditorStatusPill>
                )}
                {roleMeetsFloor(row.role, "translator") && row.role !== "admin" && <span className="theme-text-faint mt-1 block text-xs">{approvedGlossaryLocales(row).join(", ") || "No approved languages"}</span>}
              </EditorTableCell>
              <EditorTableCell
                label="Last sign-in"
                className="theme-text-secondary text-sm"
              >
                {formatSeen(row.lastSeenAt)}
              </EditorTableCell>
              <EditorTableCell label="Status">
                {inFlight === "ban" || inFlight === "unban" ? (
                  <PendingPill kind={inFlight} />
                ) : row.bannedAt ? (
                  <EditorStatusPill tone="danger" icon="lucide:ban">
                    Banned
                  </EditorStatusPill>
                ) : (
                  <EditorStatusPill tone="success">Active</EditorStatusPill>
                )}
              </EditorTableCell>
              <EditorTableCell
                label="Invited by"
                className="theme-text-secondary text-sm"
              >
                {row.invitedBy ?? "Seeded"}
              </EditorTableCell>
              <EditorTableCell wide>
                {lock === "admin" ? (
                  <span className="theme-text-faint text-xs">
                    {ADMIN_LOCK_REASON}
                  </span>
                ) : (
                  <RowActions
                    key={`${row.email}:${row.role}:${(row.glossaryLocales ?? []).join(",")}`}
                    row={row}
                    disabled={inFlight !== null || lock === "self"}
                    reason={lock === "self" ? SELF_LOCK_REASON : undefined}
                    issuingReset={inFlight === "reset"}
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
  issuingReset: boolean;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

function RowActions({
  row,
  disabled,
  reason,
  issuingReset,
  onChangeRole,
  onToggleBan,
  onIssueReset,
}: RowActionsProps) {
  const label = row.username ?? row.email;
  const [role, setRole] = useState<ManagedRole>(isManagedRole(row.role) ? row.role : "contributor");
  const [glossaryLocales, setGlossaryLocales] = useState<string[]>(approvedGlossaryLocales(row));
  const changed = role !== row.role || glossaryLocales.join(",") !== approvedGlossaryLocales(row).join(",");
  const missingLanguages = roleMeetsFloor(role, "translator") && glossaryLocales.length === 0;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={`Actions for ${label}`}
      role="group"
    >
      <div className="w-full space-y-3">
        <MemberPermissionFields label={`Permissions for ${label}`} role={role} glossaryLocales={glossaryLocales} disabled={disabled} onChange={(nextRole, nextLocales) => { setRole(nextRole); setGlossaryLocales(nextLocales); }} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || !changed || missingLanguages} title={reason} onClick={() => onChangeRole(row, role, glossaryLocales)}>Save permissions</Button>
      </div>
      <Button
        type="button"
        variant={row.bannedAt ? "outline" : "destructive"}
        size="sm"
        disabled={disabled}
        title={reason}
        onClick={() => onToggleBan(row)}
      >
        <Icon
          icon={row.bannedAt ? "lucide:user-check" : "lucide:ban"}
          size={14}
        />
        {row.bannedAt ? "Unban" : "Ban"}
      </Button>
      {issuingReset ? (
        <PendingPill kind="reset" />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title={reason}
          onClick={() => onIssueReset(row)}
        >
          <Icon icon="lucide:key-round" size={14} />
          Reset password
        </Button>
      )}
    </div>
  );
}
