"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorField, EditorFieldRow, EditorSection } from "@/features/dev/components";

import type { OwnedPlaylist } from "./playlistsModel";

export type PlaylistOwnershipProps = {
  playlist: OwnedPlaylist;
  busy: boolean;
  /** `null` leaves the playlist unowned. The tab confirms before writing. */
  onAssign: (ownerEmail: string | null) => void;
};

/**
 * Admin only: who may edit an existing playlist. Ownership is not part of the
 * draft above it; the button here writes at once through the owner route, so
 * the section sits apart with its own control and its own confirmation. Mount
 * it keyed on the stored owner so a completed change resets the field.
 */
export function PlaylistOwnership({ playlist, busy, onAssign }: PlaylistOwnershipProps) {
  const [email, setEmail] = useState(playlist.owner_email ?? "");
  const next = email.trim().toLowerCase();
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
              ? `Currently ${playlist.owner_email}. Clear the field to make it admin-only.`
              : "Currently unowned: only admins can edit it."
          }
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              value={email}
              placeholder="member@example.com"
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
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
