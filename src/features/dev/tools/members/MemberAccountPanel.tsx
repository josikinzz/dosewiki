"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorStatusPill, useUnsavedWork, type EditorStatusPillTone } from "@/features/dev/components";
import { approvedGlossaryLocales, getRoleDisplayName, isManagedRole, roleMeetsFloor, type AppRole, type ManagedRole } from "@/lib/auth/roles";
import { MemberPermissionFields } from "./MemberPermissionFields";
import { formatLocaleNames, formatSeen, memberRowLock, type MemberRow } from "./membersModel";
import { MEMBER_PENDING_LABEL, type MemberPendingKind } from "./useMemberActions";

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

type MemberAccountPanelProps = {
  row: MemberRow;
  /** The signed-in admin's email; their own account takes no actions. */
  self: string;
  /** The action in flight on this account, if any. */
  pending: MemberPendingKind | null;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

/**
 * One account: what it is (role, languages, status, last sign-in, inviter)
 * and the three things an admin does to it. Every write goes through the
 * caller's confirm; this panel only stages the permission change. Admin
 * accounts and the admin's own account show no controls, and say why in
 * text: admins are seeded and rotated from a workstation
 * (`scripts/auth/seed-admin-accounts.mjs`), and Postgres refuses both anyway.
 */
export function MemberAccountPanel({ row, self, pending, ...actions }: MemberAccountPanelProps) {
  const lock = memberRowLock(row, self);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
        <dt className="theme-text-faint text-xs">Sign-in</dt>
        <dd className="theme-text-primary min-w-0 truncate font-mono">{row.email}</dd>
        <dt className="theme-text-faint text-xs">Role</dt>
        <dd>
          {pending === "role" ? (
            <PendingPill kind="role" />
          ) : (
            <EditorStatusPill tone={ROLE_PILL_TONE[row.role]}>{getRoleDisplayName(row.role)}</EditorStatusPill>
          )}
          {roleMeetsFloor(row.role, "translator") && row.role !== "admin" ? (
            <span className="theme-text-faint mt-1 block text-xs">{formatLocaleNames(approvedGlossaryLocales(row), "No approved languages")}</span>
          ) : null}
        </dd>
        <dt className="theme-text-faint text-xs">Status</dt>
        <dd>
          {pending === "ban" || pending === "unban" ? (
            <PendingPill kind={pending} />
          ) : row.bannedAt ? (
            <EditorStatusPill tone="danger" icon="lucide:ban">Banned</EditorStatusPill>
          ) : (
            <EditorStatusPill tone="success">Active</EditorStatusPill>
          )}
        </dd>
        <dt className="theme-text-faint text-xs">Last sign-in</dt>
        <dd className="theme-text-secondary">{formatSeen(row.lastSeenAt)}</dd>
        <dt className="theme-text-faint text-xs">Invited by</dt>
        <dd className="theme-text-secondary min-w-0 truncate">{row.invitedBy ?? "Seeded"}</dd>
      </dl>
      {lock ? (
        <p className="theme-text-faint text-xs">{lock === "admin" ? ADMIN_LOCK_REASON : SELF_LOCK_REASON}</p>
      ) : pending === "reset" ? (
        <PendingPill kind="reset" />
      ) : (
        <MemberAccountControls
          // A reload with new stored values restarts the staged change.
          key={`${row.email}:${row.role}:${(row.glossaryLocales ?? []).join(",")}:${row.bannedAt ?? ""}`}
          row={row}
          busy={pending !== null}
          {...actions}
        />
      )}
    </div>
  );
}

/** A live pill that replaces the account's state while an action is in flight. */
function PendingPill({ kind }: { kind: MemberPendingKind }) {
  return (
    <EditorStatusPill tone="info" loading live>
      {MEMBER_PENDING_LABEL[kind]}
    </EditorStatusPill>
  );
}

function MemberAccountControls({
  row,
  busy,
  onChangeRole,
  onToggleBan,
  onIssueReset,
}: Omit<MemberAccountPanelProps, "self" | "pending"> & { busy: boolean }) {
  const label = row.username ?? row.email;
  const [role, setRole] = useState<ManagedRole>(isManagedRole(row.role) ? row.role : "contributor");
  const [glossaryLocales, setGlossaryLocales] = useState<string[]>(approvedGlossaryLocales(row));
  const changed = role !== row.role || glossaryLocales.join(",") !== approvedGlossaryLocales(row).join(",");
  const missingLanguages = roleMeetsFloor(role, "translator") && glossaryLocales.length === 0;
  // Permissions apply on the member's next request, so the shell never saves
  // them: it asks before a rail click, Leave or a reload drops the staged
  // change, and only discards.
  useUnsavedWork({
    id: "people:permissions",
    tab: "people",
    label: `People: permissions for ${label}`,
    dirty: changed,
    publishesLive: true,
    discard: () => {
      setRole(isManagedRole(row.role) ? row.role : "contributor");
      setGlossaryLocales(approvedGlossaryLocales(row));
    },
  });
  return (
    <>
      <section className="space-y-3" aria-label="Permissions">
        <MemberPermissionFields
          label={`Permissions for ${label}`}
          role={role}
          glossaryLocales={glossaryLocales}
          disabled={busy}
          onChange={(nextRole, nextLocales) => { setRole(nextRole); setGlossaryLocales(nextLocales); }}
        />
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={!changed || missingLanguages || busy}
          onClick={() => onChangeRole(row, role, glossaryLocales)}
        >
          Save permissions
        </Button>
      </section>

      <section className="space-y-3 theme-divider-border border-t pt-4" aria-label="Sign-in">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onIssueReset(row)}>
            <Icon icon="lucide:key-round" size={14} />
            Reset password
          </Button>
          <Button
            type="button"
            variant={row.bannedAt ? "outline" : "destructive"}
            size="sm"
            disabled={busy}
            onClick={() => onToggleBan(row)}
          >
            <Icon icon={row.bannedAt ? "lucide:user-check" : "lucide:ban"} size={14} />
            {row.bannedAt ? "Unban" : "Ban"}
          </Button>
        </div>
        <p className="theme-text-faint text-xs">
          A reset link works once and expires in an hour. A ban refuses sign-in until an admin unbans; the account and its edits stay.
        </p>
      </section>
    </>
  );
}
