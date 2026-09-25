"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approvedGlossaryLocales, isManagedRole, roleMeetsFloor, type ManagedRole } from "@/lib/auth/roles";
import { MemberPermissionFields } from "./MemberPermissionFields";
import type { MemberRow } from "./membersModel";

type MemberEditDrawerProps = {
  /** The member being edited; `null` closes the drawer. */
  row: MemberRow | null;
  onClose: () => void;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
};

/**
 * One member's controls, opened from the roster's Edit button so the roster
 * itself stays a read-only list. Every write still goes through the tab's
 * confirm dialog; this sheet only stages the permission change and hands the
 * action back to the tab.
 */
export function MemberEditDrawer({ row, onClose, onChangeRole, onToggleBan, onIssueReset }: MemberEditDrawerProps) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-md translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100">
        {row ? (
          <MemberEditBody
            key={`${row.email}:${row.role}:${(row.glossaryLocales ?? []).join(",")}:${row.bannedAt ?? ""}`}
            row={row}
            onChangeRole={onChangeRole}
            onToggleBan={onToggleBan}
            onIssueReset={onIssueReset}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MemberEditBody({ row, onChangeRole, onToggleBan, onIssueReset }: Omit<MemberEditDrawerProps, "row" | "onClose"> & { row: MemberRow }) {
  const label = row.username ?? row.email;
  const [role, setRole] = useState<ManagedRole>(isManagedRole(row.role) ? row.role : "contributor");
  const [glossaryLocales, setGlossaryLocales] = useState<string[]>(approvedGlossaryLocales(row));
  const changed = role !== row.role || glossaryLocales.join(",") !== approvedGlossaryLocales(row).join(",");
  const missingLanguages = roleMeetsFloor(role, "translator") && glossaryLocales.length === 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {label}</DialogTitle>
        <DialogDescription>
          {row.name ? `${row.name} · ${row.email}` : row.email}. Changes take effect on their next request.
        </DialogDescription>
      </DialogHeader>

      <section className="space-y-3" aria-label="Permissions">
        <MemberPermissionFields
          label={`Permissions for ${label}`}
          role={role}
          glossaryLocales={glossaryLocales}
          onChange={(nextRole, nextLocales) => { setRole(nextRole); setGlossaryLocales(nextLocales); }}
        />
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={!changed || missingLanguages}
          onClick={() => onChangeRole(row, role, glossaryLocales)}
        >
          Save permissions
        </Button>
      </section>

      <section className="space-y-3 border-t border-[var(--theme-border-subtle)] pt-4" aria-label="Account">
        <h3 className="theme-text-secondary text-xs font-medium">Account</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onIssueReset(row)}>
            <Icon icon="lucide:key-round" size={14} />
            Reset password
          </Button>
          <Button
            type="button"
            variant={row.bannedAt ? "outline" : "destructive"}
            size="sm"
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
