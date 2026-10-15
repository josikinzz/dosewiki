"use client";

import { useId, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorField,
  EditorPanel,
  Notice,
  SaveLine,
  type NoticeMessage,
  type SaveLineCopy,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";

import { RelativeDay } from "../home/homeParts";
import { PlaylistOwnership } from "./PlaylistOwnership";
import { PlaylistWorks } from "./PlaylistWorks";
import { playlistKeyOf, saveBlocker, type OwnedPlaylist, type PlaylistDraft } from "./playlistsModel";
import type { WorkCards } from "./useWorkCards";

export const PLAYLIST_SAVE_COPY: SaveLineCopy = {
  label: "Saving publishes nothing.",
  detail: "A saved playlist waits here until an admin applies it to a gallery in Replication Studio. Galleries that already copied it keep their copy.",
  icon: "lucide:archive",
  tone: "info",
};

export type PaneMode = "new" | "edit" | "view";

export function PlaylistPane({
  mode,
  draft,
  saved,
  dirty,
  saving,
  busy,
  isAdmin,
  notice,
  onDismissNotice,
  onChange,
  onSave,
  onDiscard,
  onClose,
  onBackToList,
  onRemove,
  onCopy,
  onAssign,
  titleRef,
  searchRef,
  workCards,
  memberOptions,
  rosterError,
  onRetryRoster,
  ownerName,
  saveKeyLabel,
}: {
  mode: PaneMode;
  draft: PlaylistDraft;
  saved: OwnedPlaylist | null;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  isAdmin: boolean;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  onChange: (draft: PlaylistDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onBackToList: () => void;
  onRemove: () => void;
  onCopy: () => void;
  onAssign: (ownerEmail: string | null) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  workCards: WorkCards;
  memberOptions: readonly SearchablePickerOption[];
  rosterError: string | null;
  onRetryRoster: () => void;
  ownerName: (email: string) => string;
  saveKeyLabel: string;
}) {
  const headingId = useId();
  const readOnly = mode === "view";
  const isNew = mode === "new";
  const blocker = readOnly ? null : saveBlocker(draft);
  const heading = isNew ? "New playlist" : saved?.title || draft.key;

  return (
    <EditorPanel className="overflow-visible" data-testid="playlist-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label={readOnly ? "Close playlist" : "Close editor"}
          title={readOnly ? "Close playlist" : "Close editor"}
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="pr-12 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
        </div>
        <h3
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none lg:pr-12"
        >
          <span className="sr-only">{readOnly ? "Viewing " : "Editing "}</span>
          {heading}
        </h3>
        <p className="theme-text-faint flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {isNew ? (
            <span>Not saved yet</span>
          ) : (
            <>
              <span className="break-all font-mono">{draft.key}</span>
              {saved ? (
                <>
                  <span aria-hidden>·</span>
                  <RelativeDay iso={saved.updated_at} prefix="Updated" />
                </>
              ) : null}
              {isAdmin && saved ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{saved.owner_email ? `Owned by ${ownerName(saved.owner_email)}` : "Unowned, admins only"}</span>
                </>
              ) : null}
            </>
          )}
        </p>
        {readOnly ? (
          <div className="flex flex-col items-start gap-2 pt-1 sm:flex-row sm:items-center sm:gap-3">
            <p className="theme-text-muted flex min-w-0 flex-1 items-start gap-2 text-sm">
              <Icon icon="lucide:lock" size={14} className="theme-text-faint mt-0.5 shrink-0" />
              <span>
                Read only. {saved?.owner_email ? "Another member owns this playlist" : "No one owns this playlist yet"}, so only{" "}
                {saved?.owner_email ? "they or an admin" : "an admin"} can change it.
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onCopy}>
              <Icon icon="lucide:copy-plus" size={14} />
              Copy into a new playlist
            </Button>
          </div>
        ) : null}
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-5 [&_:is(input,button)]:scroll-mb-40 [&_:is(input,button)]:scroll-mt-28">
        {readOnly ? null : (
          <EditorField
            label="Name"
            required
            description={
              isNew ? (
                draft.key ? (
                  <>Its key, <code className="font-mono">{draft.key}</code>, comes from the name and stays fixed after the first save.</>
                ) : (
                  "The key comes from the name and stays fixed after the first save."
                )
              ) : (
                <>A rename keeps the key <code className="font-mono">{draft.key}</code>, so links and galleries still find it.</>
              )
            }
          >
            {(control) => (
              <Input
                {...control}
                value={draft.title}
                placeholder="Classic psychedelic opener"
                maxLength={120}
                disabled={busy}
                className="text-[16px] font-semibold md:text-sm"
                onChange={(event) => {
                  const title = event.target.value;
                  onChange({ ...draft, title, key: isNew ? playlistKeyOf(title) : draft.key });
                }}
              />
            )}
          </EditorField>
        )}

        {isNew && isAdmin ? (
          <EditorField
            label="Owner"
            description="The member who may edit this playlist; saved with it. Leave it unset to keep the playlist admin-only."
          >
            {(control) => (
              <SearchablePicker
                id={control.id}
                ariaLabel="Owner"
                options={memberOptions}
                value={draft.ownerEmail || null}
                placeholder="Choose a member"
                emptyText={rosterError ? "The member list could not load." : "No member matches."}
                disabled={busy}
                onChange={(email) => onChange({ ...draft, ownerEmail: email ?? "" })}
              />
            )}
          </EditorField>
        ) : null}

        <PlaylistWorks
          slugs={draft.slugs}
          workCards={workCards}
          readOnly={readOnly}
          busy={busy}
          searchRef={searchRef}
          onChange={(slugs) => onChange({ ...draft, slugs })}
        />

        {isAdmin && saved && !isNew ? (
          <PlaylistOwnership
            key={`${saved.key}:${saved.owner_email ?? ""}`}
            playlist={saved}
            busy={busy}
            memberOptions={memberOptions}
            rosterError={rosterError}
            onRetryRoster={onRetryRoster}
            ownerName={ownerName}
            onAssign={onAssign}
          />
        ) : null}

        {mode === "edit" ? (
          <section aria-label="Remove" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--editor-panel-border)] pt-5">
            <Button type="button" variant="ghostDestructive" size="sm" className="-ml-2" disabled={busy} onClick={onRemove}>
              <Icon icon="lucide:trash-2" size={14} />
              Remove this playlist
            </Button>
            <p className="theme-text-faint min-w-0 flex-1 text-xs">
              There is no restore. Galleries it was applied to keep their copy.
            </p>
          </section>
        ) : null}
      </div>

      {readOnly ? null : (
        <footer
          aria-label="Save"
          className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
        >
          {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
          {blocker && (dirty || isNew) ? (
            <p className="theme-text-muted flex items-center gap-2 text-xs">
              <Icon icon="lucide:info" size={13} className="theme-text-faint shrink-0" />
              {blocker}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={busy || !dirty || blocker !== null}
              aria-busy={saving || undefined}
              aria-keyshortcuts="Meta+S Control+S"
              onClick={onSave}
            >
              {saving ? (isNew ? "Creating" : "Saving") : isNew ? "Create playlist" : "Save playlist"}
              <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
              </span>
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy || !dirty} onClick={onDiscard}>
              Discard edits
            </Button>
            <SaveState dirty={dirty} saving={saving} isNew={isNew} />
            <span className="min-w-0 sm:ml-auto">
              <SaveLine model="instant" copy={PLAYLIST_SAVE_COPY} />
            </span>
          </div>
        </footer>
      )}
    </EditorPanel>
  );
}

function SaveState({ dirty, saving, isNew }: { dirty: boolean; saving: boolean; isNew: boolean }) {
  let content: ReactNode;
  if (saving) {
    content = isNew ? "Creating the playlist" : "Saving your changes";
  } else if (dirty) {
    content = (
      <>
        <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
        Unsaved changes
      </>
    );
  } else {
    content = isNew ? "Name it and add works" : "No changes yet";
  }
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
      {content}
    </p>
  );
}
