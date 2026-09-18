"use client";

import { useCallback, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NestedContentCard } from "@/components/ui/surface";
import {
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  TagToken,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";

type DirectoryOption = {
  key: string;
  displayName: string;
  aliases: readonly string[];
};

type ContributorDangerZoneProps = {
  profileKey: string;
  displayName: string;
  /** Every other profile, as merge destinations. */
  directory: readonly DirectoryOption[];
  /** Bylines seen on this contributor's reports, offered as retarget sources. */
  knownAuthorNames: readonly string[];
  onCompleted: (message: string) => void;
  onProfileRemoved: () => void;
};

const DANGER_CARD_CLASS = "theme-danger-surface";

/**
 * The operations that change who a name belongs to, kept visually and
 * structurally apart from the rest of the editor.
 *
 * Merge, delete and retarget were script-only until this tab existed, and the
 * reason to expose them is the same reason to fence them: they are the only
 * repair for a duplicated or misattributed identity, and each of them is
 * irreversible from the UI. Every one is gated on typing the key of the profile
 * that is about to change, not a generic "yes", because the mistake these
 * guard against is acting on the wrong profile, and only re-typing its key
 * catches that.
 */
export function ContributorDangerZone({
  profileKey,
  displayName,
  directory,
  knownAuthorNames,
  onCompleted,
  onProfileRemoved,
}: ContributorDangerZoneProps) {
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [pending, setPending] = useState<"merge" | "delete" | "retarget" | null>(null);

  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeConfirm, setMergeConfirm] = useState("");
  const [discardSourceContent, setDiscardSourceContent] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [retargetAuthor, setRetargetAuthor] = useState("");
  const [retargetConfirm, setRetargetConfirm] = useState("");

  // Label, key and aliases all feed the picker's match, so the destination is
  // found the same three ways the directory search finds a row.
  const mergeOptions = useMemo(
    () =>
      directory
        .filter((option) => option.key !== profileKey)
        .map((option) => ({
          value: option.key,
          label: option.displayName,
          hint:
            option.aliases.length > 0 ? `${option.key} · ${option.aliases.join(", ")}` : option.key,
        })),
    [directory, profileKey],
  );
  const mergeDestination = useMemo(
    () => (mergeTarget ? (directory.find((option) => option.key === mergeTarget) ?? null) : null),
    [directory, mergeTarget],
  );

  const run = useCallback(
    async (action: "merge" | "delete" | "retarget", body: Record<string, unknown>) => {
      setPending(action);
      setNotice(null);

      try {
        const response = await fetch("/api/dev/contributor-profile/danger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        });
        const payload = (await response.json()) as {
          error?: string;
          reportsUpdated?: number;
          mergedInto?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "That operation could not be completed.");
        }

        return payload;
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const handleMerge = useCallback(async () => {
    try {
      const payload = await run("merge", {
        fromKey: profileKey,
        toKey: mergeTarget,
        confirmKey: mergeConfirm,
        discardSourceContent,
      });
      setMergeConfirm("");
      onCompleted(
        `Merged ${profileKey} into ${payload.mergedInto ?? mergeTarget}. ` +
          `${payload.reportsUpdated ?? 0} report(s) re-credited.`,
      );
      onProfileRemoved();
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Merge failed",
        message: error instanceof Error ? error.message : "The merge could not be completed.",
      });
    }
  }, [
    discardSourceContent,
    mergeConfirm,
    mergeTarget,
    onCompleted,
    onProfileRemoved,
    profileKey,
    run,
  ]);

  const handleDelete = useCallback(async () => {
    try {
      await run("delete", { key: profileKey, confirmKey: deleteConfirm });
      setDeleteConfirm("");
      onCompleted(`Deleted ${displayName} (${profileKey}).`);
      onProfileRemoved();
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Delete failed",
        message: error instanceof Error ? error.message : "The profile could not be deleted.",
      });
    }
  }, [deleteConfirm, displayName, onCompleted, onProfileRemoved, profileKey, run]);

  const handleRetarget = useCallback(async () => {
    try {
      const payload = await run("retarget", {
        authorName: retargetAuthor,
        contributorKey: profileKey,
        confirmKey: retargetConfirm,
      });
      setRetargetConfirm("");
      setRetargetAuthor("");
      onCompleted(
        `Re-credited ${payload.reportsUpdated ?? 0} report(s) written as “${retargetAuthor}” to ${profileKey}.`,
      );
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Retarget failed",
        message: error instanceof Error ? error.message : "The bylines could not be retargeted.",
      });
    }
  }, [onCompleted, profileKey, retargetAuthor, retargetConfirm, run]);

  const confirmationHint = (expected: string) => (
    <p className="theme-text-faint text-xs">
      {`Type ${expected} exactly to enable this action. There is no undo.`}
    </p>
  );

  return (
    <EditorSection
      icon="lucide:triangle-alert"
      title="Danger zone"
      description="Identity operations. These rewrite who existing work is credited to, and none of them can be undone from this tab."
      actions={<EditorStatusPill tone="danger">Irreversible</EditorStatusPill>}
    >
      {notice ? <EditorNotice notice={notice} /> : null}

      <NestedContentCard padding="sm" radius="lg" className={DANGER_CARD_CLASS}>
        <div className="space-y-3">
          <div>
            <h4 className="theme-text-primary text-sm font-semibold">Merge into another profile</h4>
            <p className="theme-text-muted text-sm">
              Folds this profile into the destination: its display name, aliases and key survive as
              aliases there, its reports are re-credited, and this row is deleted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-merge-target">Destination profile</Label>
            <SearchablePicker
              id="contributor-merge-target"
              ariaLabel="Destination profile"
              options={mergeOptions}
              value={mergeTarget || null}
              onChange={(value) => {
                setMergeTarget(value ?? "");
                setMergeConfirm("");
              }}
              placeholder="Search by name, key, or alias"
              emptyText="No other profile matches that."
            />
          </div>

          {mergeDestination ? (
            <div
              data-testid="contributor-merge-destination"
              className="theme-text-primary space-y-1.5 rounded-lg border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)] px-3 py-2.5 text-sm"
            >
              <p>
                <span className="theme-text-faint text-xs uppercase tracking-wide">
                  Merging into{" "}
                </span>
                <span className="font-semibold">{mergeDestination.displayName}</span>
                <span className="theme-text-muted">{` (${mergeDestination.key})`}</span>
              </p>
              {mergeDestination.aliases.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="theme-text-faint text-xs">Already answers to</span>
                  {mergeDestination.aliases.map((alias) => (
                    <TagToken key={alias} label={alias} variant="compact" />
                  ))}
                </div>
              ) : (
                <p className="theme-text-faint text-xs">No aliases yet.</p>
              )}
            </div>
          ) : null}

          <label className="theme-text-muted flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={discardSourceContent}
              onChange={(event) => setDiscardSourceContent(event.target.checked)}
            />
            Discard this profile&rsquo;s bio, avatar and links
          </label>

          <div className="space-y-2">
            <Label htmlFor="contributor-merge-confirm">{`Confirm by typing ${profileKey}`}</Label>
            <Input
              id="contributor-merge-confirm"
              value={mergeConfirm}
              onChange={(event) => setMergeConfirm(event.target.value)}
              placeholder={profileKey}
              autoComplete="off"
              disabled={!mergeDestination}
            />
            {mergeDestination ? (
              confirmationHint(profileKey)
            ) : (
              <p className="theme-text-faint text-xs">Choose a destination first.</p>
            )}
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={
              pending !== null ||
              !mergeTarget ||
              mergeConfirm.trim().toLowerCase() !== profileKey.toLowerCase()
            }
            onClick={() => void handleMerge()}
          >
            <Icon icon="lucide:merge" size={15} />
            Merge and delete this profile
          </Button>
        </div>
      </NestedContentCard>

      <NestedContentCard padding="sm" radius="lg" className={DANGER_CARD_CLASS}>
        <div className="space-y-3">
          <div>
            <h4 className="theme-text-primary text-sm font-semibold">Retarget bylines</h4>
            <p className="theme-text-muted text-sm">
              Points every report written under a byline at this profile, and records that byline as
              an alias. Use this when a report credits a name this profile owns.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-retarget-author">Byline to retarget</Label>
            <Input
              id="contributor-retarget-author"
              value={retargetAuthor}
              onChange={(event) => setRetargetAuthor(event.target.value)}
              placeholder="Author name as written on the report"
              list="contributor-known-authors"
              autoComplete="off"
            />
            <datalist id="contributor-known-authors">
              {knownAuthorNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-retarget-confirm">{`Confirm by typing ${profileKey}`}</Label>
            <Input
              id="contributor-retarget-confirm"
              value={retargetConfirm}
              onChange={(event) => setRetargetConfirm(event.target.value)}
              placeholder={profileKey}
              autoComplete="off"
            />
            {confirmationHint(profileKey)}
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={
              pending !== null ||
              !retargetAuthor.trim() ||
              retargetConfirm.trim().toLowerCase() !== profileKey.toLowerCase()
            }
            onClick={() => void handleRetarget()}
          >
            <Icon icon="lucide:user-round-cog" size={15} />
            Retarget these bylines
          </Button>
        </div>
      </NestedContentCard>

      <NestedContentCard padding="sm" radius="lg" className={DANGER_CARD_CLASS}>
        <div className="space-y-3">
          <div>
            <h4 className="theme-text-primary text-sm font-semibold">Delete this profile</h4>
            <p className="theme-text-muted text-sm">
              Destroys the bio, avatar and links outright. Refused while any report still credits
              this key: reassign or merge first, or the report would link to a page that is gone.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-delete-confirm">{`Confirm by typing ${profileKey}`}</Label>
            <Input
              id="contributor-delete-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={profileKey}
              autoComplete="off"
            />
            {confirmationHint(profileKey)}
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={
              pending !== null || deleteConfirm.trim().toLowerCase() !== profileKey.toLowerCase()
            }
            onClick={() => void handleDelete()}
          >
            <Icon icon="lucide:trash-2" size={15} />
            Delete profile
          </Button>
        </div>
      </NestedContentCard>
    </EditorSection>
  );
}
