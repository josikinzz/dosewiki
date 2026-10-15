"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { EditorStatusPill, useUnsavedWork, type EditorStatusPillTone } from "@/features/dev/components";
import { approvedGlossaryLocales, getRoleDisplayName, isManagedRole, roleMeetsFloor, type AppRole, type ManagedRole } from "@/lib/auth/roles";

import { describeDay } from "../home/homeModel";
import { MemberPermissionFields } from "./MemberPermissionFields";
import { describePermissionChange, formatLocaleNames, formatSeen, memberRowLock, type MemberRow } from "./membersModel";
import { MEMBER_PENDING_LABEL, type MemberPendingKind } from "./useMemberActions";

const ROLE_PILL_TONE: Record<AppRole, EditorStatusPillTone> = {
  admin: "info",
  editor: "neutral",
  editor_translator: "neutral",
  translator: "neutral",
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
  /** Opens the role guide; the permissions block links to it when given. */
  onShowRoles?: () => void;
  /** A member's name for an address (the inviter); the address shows as it is without it. */
  nameOf?: (email: string) => string;
};

/**
 * One account: what it is (role, languages, status, last sign-in, inviter)
 * and the three things an admin does to it. Every write goes through the
 * caller's confirm; this panel only stages the permission change. Admin
 * accounts and the admin's own account show no controls, and say why in
 * text: admins are seeded and rotated from a workstation
 * (`scripts/auth/seed-admin-accounts.mjs`), and Postgres refuses both anyway.
 */
export function MemberAccountPanel({ row, self, pending, onShowRoles, nameOf, ...actions }: MemberAccountPanelProps) {
  const lock = memberRowLock(row, self);
  const translating = roleMeetsFloor(row.role, "translator") && row.role !== "admin";
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Fact label="Sign-in" wide>
          <span className="theme-text-primary block min-w-0 break-all">{row.email}</span>
        </Fact>
        <Fact label="Role">
          {pending === "role" ? (
            <PendingPill kind="role" />
          ) : (
            <EditorStatusPill tone={ROLE_PILL_TONE[row.role]}>{getRoleDisplayName(row.role)}</EditorStatusPill>
          )}
        </Fact>
        {translating ? (
          <Fact label="Languages">
            <span className="theme-text-secondary">{formatLocaleNames(approvedGlossaryLocales(row), "No approved languages")}</span>
          </Fact>
        ) : null}
        <Fact label="Status">
          {pending === "ban" || pending === "unban" ? (
            <PendingPill kind={pending} />
          ) : row.bannedAt ? (
            <EditorStatusPill tone="danger" icon="lucide:ban">Banned</EditorStatusPill>
          ) : (
            <EditorStatusPill tone="success">Active</EditorStatusPill>
          )}
        </Fact>
        <Fact label="Last sign-in">
          <Seen iso={row.lastSeenAt} />
        </Fact>
        <Fact label="Invited by">
          <span className="theme-text-secondary block min-w-0 break-words" title={row.invitedBy}>
            {row.invitedBy ? (nameOf ? nameOf(row.invitedBy) : row.invitedBy) : "Seed script"}
          </span>
        </Fact>
      </dl>
      {lock ? (
        <p className="theme-text-muted flex items-start gap-2 text-sm">
          <Icon icon="lucide:lock" size={14} className="theme-text-faint mt-0.5 shrink-0" />
          {/* Your own admin account is both; say both, yours first. */}
          {row.email === self.trim().toLowerCase()
            ? lock === "admin" ? `${SELF_LOCK_REASON} ${ADMIN_LOCK_REASON}` : SELF_LOCK_REASON
            : ADMIN_LOCK_REASON}
        </p>
      ) : pending === "reset" ? (
        <PendingPill kind="reset" />
      ) : (
        <MemberAccountControls
          // A reload with new stored values restarts the staged change.
          key={`${row.email}:${row.role}:${(row.glossaryLocales ?? []).join(",")}:${row.bannedAt ?? ""}`}
          row={row}
          busy={pending !== null}
          onShowRoles={onShowRoles}
          {...actions}
        />
      )}
    </div>
  );
}

function Fact({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "col-span-2 min-w-0 space-y-1 sm:col-span-3" : "min-w-0 space-y-1"}>
      <dt className="theme-text-faint text-xs">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** The last sign-in as relative words with the date on hover; "Never" when they have not signed in. */
function Seen({ iso }: { iso: string | undefined }) {
  const day = iso ? describeDay(iso) : null;
  if (!iso || !day) return <span className="theme-text-secondary">{formatSeen(iso)}</span>;
  return (
    <time dateTime={iso} title={day.full} className="theme-text-secondary">
      {day.relative}
    </time>
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
  onShowRoles,
}: Omit<MemberAccountPanelProps, "self" | "pending" | "nameOf"> & { busy: boolean }) {
  const label = row.username ?? row.email;
  const savedRole: ManagedRole = isManagedRole(row.role) ? row.role : "contributor";
  const [role, setRole] = useState<ManagedRole>(savedRole);
  const [glossaryLocales, setGlossaryLocales] = useState<string[]>(approvedGlossaryLocales(row));
  const changed = role !== row.role || glossaryLocales.join(",") !== approvedGlossaryLocales(row).join(",");
  const missingLanguages = roleMeetsFloor(role, "translator") && glossaryLocales.length === 0;
  const discard = () => {
    setRole(savedRole);
    setGlossaryLocales(approvedGlossaryLocales(row));
  };
  // Permissions apply on the member's next request, so the shell never saves
  // them: it asks before a rail click, Leave or a reload drops the staged
  // change, and only discards.
  useUnsavedWork({
    kind: "discard-only",
    because: "Confirm this account change from the tool.",
    id: "people:permissions",
    tab: "people",
    label: `People: permissions for ${label}`,
    dirty: changed,
    discard,
  });
  return (
    <>
      <section className="space-y-3 theme-divider-border border-t pt-4" aria-label="Permissions">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h5 className="theme-text-secondary text-sm font-semibold">Permissions</h5>
          {onShowRoles ? (
            <Button type="button" variant="link" size="auto" className="text-xs" onClick={onShowRoles}>
              What each role can do
            </Button>
          ) : null}
        </div>
        <MemberPermissionFields
          label={`Permissions for ${label}`}
          role={role}
          glossaryLocales={glossaryLocales}
          disabled={busy}
          onChange={(nextRole, nextLocales) => { setRole(nextRole); setGlossaryLocales(nextLocales); }}
        />
        <p className="theme-text-muted text-xs">
          <span className="theme-text-secondary font-medium">{`${getRoleDisplayName(role)}: `}</span>
          {ROLE_DESCRIPTIONS[role].summary}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!changed || missingLanguages || busy}
            onClick={() => onChangeRole(row, role, glossaryLocales)}
          >
            Save permissions
          </Button>
          {changed ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={discard}>
              Discard
            </Button>
          ) : null}
          <p aria-live="polite" className="theme-text-muted flex min-w-0 flex-1 items-center gap-2 text-xs">
            {changed ? (
              <>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                <span>{describePermissionChange(row, role, glossaryLocales)}</span>
              </>
            ) : (
              <span className="theme-text-faint">No changes yet</span>
            )}
          </p>
        </div>
      </section>

      <section className="space-y-3 theme-divider-border border-t pt-4" aria-label="Sign-in">
        <h5 className="theme-text-secondary text-sm font-semibold">Sign-in</h5>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onIssueReset(row)}>
            <Icon icon="lucide:key-round" size={14} />
            Reset password
          </Button>
          <Button
            type="button"
            variant={row.bannedAt ? "outline" : "ghostDestructive"}
            size="sm"
            disabled={busy}
            onClick={() => onToggleBan(row)}
          >
            <Icon icon={row.bannedAt ? "lucide:user-check" : "lucide:ban"} size={14} />
            {row.bannedAt ? "Unban" : "Ban"}
          </Button>
        </div>
        <p className="theme-text-faint max-w-[65ch] text-xs">
          A reset link works once and expires in an hour. A ban refuses sign-in until an admin unbans; the account and its edits stay.
        </p>
      </section>
    </>
  );
}
