"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EditorField, EditorFieldRow, EditorSection, type SearchablePickerOption } from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";

import type { OwnedPlaylist } from "./playlistsModel";

export type PlaylistOwnershipProps = {
  playlist: OwnedPlaylist;
  busy: boolean;
  /** The members an admin may hand the playlist to. */
  memberOptions: readonly SearchablePickerOption[];
  /** `null` leaves the playlist unowned. The tab confirms before writing. */
  onAssign: (ownerEmail: string | null) => void;
};

/**
 * Admin only: who may edit an existing playlist. Ownership is not part of the
 * draft above it; the button here writes at once through the owner route, so
 * the section sits apart with its own control and its own confirmation. Mount
 * it keyed on the stored owner so a completed change resets the field.
 */
export function PlaylistOwnership({ playlist, busy, memberOptions, onAssign }: PlaylistOwnershipProps) {
  const [email, setEmail] = useState(playlist.owner_email ?? "");
  const next = email.trim().toLowerCase();
  // The stored owner stays choosable even if the roster read has not come back.
  const options = playlist.owner_email && !memberOptions.some((option) => option.value === playlist.owner_email)
    ? [{ value: playlist.owner_email, label: playlist.owner_email }, ...memberOptions]
    : memberOptions;
  const changed = next !== (playlist.owner_email ?? "");

  return (
    <EditorSection
      icon="lucide:user-check"
      title="Ownership"
      aria-label="Ownership"
      description="Who may edit this playlist. Assigning takes effect at once; it is not part of the draft above and does not wait for Save changes."
    >
      <EditorFieldRow layout="actionTrailing">
        <EditorField
          label="Owner"
          description={
            playlist.owner_email
              ? `Currently ${playlist.owner_email}. Clear the selection to make it admin-only.`
              : "Currently unowned: only admins can edit it."
          }
        >
          {(control) => (
            <SearchablePicker
              id={control.id}
              ariaLabel="Owner"
              options={options}
              value={email || null}
              placeholder="Choose a member"
              emptyText="No member matches."
              disabled={busy}
              onChange={(value) => setEmail(value ?? "")}
            />
          )}
        </EditorField>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || !changed}
          onClick={() => onAssign(next.length > 0 ? next : null)}
        >
          {next.length === 0 && playlist.owner_email ? "Make unowned" : "Assign owner"}
        </Button>
      </EditorFieldRow>
    </EditorSection>
  );
}
