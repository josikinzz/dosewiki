"use client";

import { useId, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorField, type SearchablePickerOption } from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";

import type { OwnedPlaylist } from "./playlistsModel";

export type PlaylistOwnershipProps = {
  playlist: OwnedPlaylist;
  busy: boolean;
  memberOptions: readonly SearchablePickerOption[];
  rosterError: string | null;
  onRetryRoster: () => void;
  ownerName: (email: string) => string;
  onAssign: (ownerEmail: string | null) => void;
};

export function PlaylistOwnership({
  playlist,
  busy,
  memberOptions,
  rosterError,
  onRetryRoster,
  ownerName,
  onAssign,
}: PlaylistOwnershipProps) {
  const headingId = useId();
  const [email, setEmail] = useState(playlist.owner_email ?? "");
  const next = email.trim().toLowerCase();
  const options = playlist.owner_email && !memberOptions.some((option) => option.value === playlist.owner_email)
    ? [{ value: playlist.owner_email, label: playlist.owner_email }, ...memberOptions]
    : memberOptions;
  const changed = next !== (playlist.owner_email ?? "");
  const unowning = next.length === 0 && playlist.owner_email !== null;

  return (
    <section aria-label="Ownership" aria-describedby={headingId} className="space-y-3 border-t border-[color:var(--editor-panel-border)] pt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="theme-text-primary text-base font-semibold">Owner</h4>
        <p id={headingId} className="theme-text-muted text-sm">
          Changes on its own confirm, not with Save.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <EditorField
          className="min-w-0 flex-1"
          label="Owner"
          description={
            playlist.owner_email
              ? `${ownerName(playlist.owner_email)} can edit and remove it now. Clear the choice to make it admin-only.`
              : "Unowned: only admins can edit it until someone is assigned."
          }
        >
          {(control) => (
            <SearchablePicker
              id={control.id}
              ariaLabel="Owner"
              options={options}
              value={email || null}
              placeholder="Choose a member"
              emptyText={rosterError ? "The member list could not load." : "No member matches."}
              disabled={busy}
              onChange={(value) => setEmail(value ?? "")}
            />
          )}
        </EditorField>
        <Button
          type="button"
          variant={unowning ? "ghostDestructive" : "outline"}
          size="sm"
          className="sm:mt-7"
          disabled={busy || !changed}
          onClick={() => onAssign(next.length > 0 ? next : null)}
        >
          {unowning ? "Make unowned" : "Assign owner"}
        </Button>
      </div>
      {rosterError ? (
        <p role="status" className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm text-dose-warning">
          <Icon icon="lucide:triangle-alert" size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">Could not load the member list: {rosterError}</span>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetryRoster}>
            Try again
          </Button>
        </p>
      ) : null}
    </section>
  );
}
