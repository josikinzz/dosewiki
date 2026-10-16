"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import {
  EditorCheckbox,
  EditorField,
  Notice,
  TagToken,
  type NoticeMessage,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";

type DirectoryOption = {
  key: string;
  displayName: string;
  aliases: readonly string[];
};

type HeadingLevel = "h3" | "h4" | "h5";

type ContributorDangerZoneProps = {
  profileKey: string;
  displayName: string;
  directory: readonly DirectoryOption[];
  knownAuthorNames: readonly string[];
  creditedReports?: number;
  onCompleted: (message: string, where?: "list" | "zone") => void;
  onProfileRemoved: (nextKey?: string) => void;
  resultNotice?: NoticeMessage | null;
  onDismissResult?: () => void;
  canRun?: boolean;
  headingLevel?: HeadingLevel;
};

const SUB_HEADING: Record<HeadingLevel, "h4" | "h5" | "h6"> = { h3: "h4", h4: "h5", h5: "h6" };

export function ContributorDangerZone({
  profileKey,
  displayName,
  directory,
  knownAuthorNames,
  creditedReports,
  onCompleted,
  onProfileRemoved,
  resultNotice = null,
  onDismissResult,
  canRun = true,
  headingLevel = "h3",
}: ContributorDangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [pending, setPending] = useState<"merge" | "delete" | "retarget" | null>(null);

  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeConfirm, setMergeConfirm] = useState("");
  const [discardSourceContent, setDiscardSourceContent] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [retargetAuthor, setRetargetAuthor] = useState("");
  const [retargetConfirm, setRetargetConfirm] = useState("");

  const regionId = useId();
  const Heading = headingLevel;
  const SubHeading = SUB_HEADING[headingLevel];

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
  const matches = (typed: string) => typed.trim().toLowerCase() === profileKey.toLowerCase();

  const run = useCallback(
    async (action: "merge" | "delete" | "retarget", body: Record<string, unknown>) => {
      setPending(action);
      setNotice(null);
      onDismissResult?.();

      try {
        const response = await fetch("/api/dev/contributor-profile/danger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        });
        let payload: { error?: string; reportsUpdated?: number; mergedInto?: string } = {};
        try {
          payload = (await response.json()) as typeof payload;
        } catch {
        }

        if (!response.ok) {
          const message = payload.error ?? "That operation could not be completed.";
          throw new Error(
            /frozen|writes are paused/i.test(message)
              ? "Writes are paused, so nothing changed. Try again once writes resume."
              : message,
          );
        }

        return payload;
      } finally {
        setPending(null);
      }
    },
    [onDismissResult],
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
      const updated = payload.reportsUpdated ?? 0;
      onCompleted(
        `Merged ${displayName} (${profileKey}) into ${mergeDestination?.displayName ?? payload.mergedInto ?? mergeTarget}. ` +
          `${updated} ${updated === 1 ? "report was" : "reports were"} re-credited.`,
        "list",
      );
      onProfileRemoved(payload.mergedInto ?? mergeTarget);
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Merge failed",
        message: error instanceof Error ? error.message : "The merge could not be completed.",
      });
    }
  }, [discardSourceContent, displayName, mergeConfirm, mergeDestination, mergeTarget, onCompleted, onProfileRemoved, profileKey, run]);

  const handleDelete = useCallback(async () => {
    try {
      await run("delete", { key: profileKey, confirmKey: deleteConfirm });
      setDeleteConfirm("");
      onCompleted(`Deleted ${displayName} (${profileKey}).`, "list");
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
      const updated = payload.reportsUpdated ?? 0;
      onCompleted(
        `Re-credited ${updated} ${updated === 1 ? "report" : "reports"} written as “${retargetAuthor.trim()}” to ${displayName}, and added the byline as an alias.`,
        "zone",
      );
    } catch (error) {
      setNotice({
        tone: "danger",
        title: "Retarget failed",
        message: error instanceof Error ? error.message : "The bylines could not be retargeted.",
      });
    }
  }, [displayName, onCompleted, profileKey, retargetAuthor, retargetConfirm, run]);

  const confirmField = (id: string, value: string, onChange: (next: string) => void, disabled = false, waitingFor?: string) => (
    <EditorField
      id={id}
      label={`Confirm by typing ${profileKey}`}
      description={waitingFor ?? `Type ${profileKey} exactly to enable this. There is no undo.`}
      error={value.trim() && !matches(value) ? `That does not match ${profileKey}.` : undefined}
    >
      {(control) => (
        <Input
          {...control}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          className="max-w-xs font-mono text-[16px] md:text-sm"
        />
      )}
    </EditorField>
  );

  return (
    <section aria-labelledby={`${regionId}-heading`} className="theme-portal-rule space-y-3 border-t pt-5">
      <Heading id={`${regionId}-heading`} className="text-base font-semibold">
        {canRun ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "theme-focus-ring group flex w-full items-center gap-2 rounded-control py-1 text-left",
              TOUCH_HALO,
            )}
          >
            <Icon icon="lucide:triangle-alert" size={16} className="theme-danger-text-strong shrink-0" />
            <span className="theme-text-primary min-w-0 flex-1">
              Danger zone
              <span className="theme-text-muted block text-sm font-normal">
                Merge, retarget bylines or delete. None of these can be undone here.
              </span>
            </span>
            <ExpandIndicator isExpanded={open} className="theme-text-muted" />
          </button>
        ) : (
          <span className="flex items-start gap-2">
            <Icon icon="lucide:lock" size={15} className="theme-text-faint mt-1 shrink-0" />
            <span className="theme-text-primary min-w-0">
              Danger zone
              <span className="theme-text-muted block text-sm font-normal">
                Merging, retargeting bylines and deleting a profile are admin only.
              </span>
            </span>
          </span>
        )}
      </Heading>

      {canRun ? (
        <div id={regionId} hidden={!open} className="theme-danger-surface space-y-0 divide-y divide-[color:var(--editor-panel-border)] rounded-card border">
          {notice || resultNotice ? (
            <div className="space-y-2 p-4">
              {notice ? <Notice {...notice} dismiss={() => setNotice(null)} className="text-sm" /> : null}
              {resultNotice ? <Notice {...resultNotice} dismiss={onDismissResult} className="text-sm" /> : null}
            </div>
          ) : null}

          <Operation
            heading={<SubHeading className="theme-text-primary text-sm font-semibold">Merge into another profile</SubHeading>}
            description="Folds this profile into the destination: its display name, aliases and key survive as aliases there, its reports are re-credited, and this profile is deleted."
          >
            <EditorField id="contributor-merge-target" label="Destination profile">
              {(control) => (
                <SearchablePicker
                  id={control.id}
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
              )}
            </EditorField>

            {mergeDestination ? (
              <div
                data-testid="contributor-merge-destination"
                className="theme-text-primary space-y-1.5 rounded-control border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)] px-3 py-2.5 text-sm"
              >
                <p>
                  <span className="theme-text-muted">{`${displayName} merges into `}</span>
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

            <EditorCheckbox
              id="contributor-merge-discard"
              tone="danger"
              label="Discard this profile's bio, picture and links"
              checked={discardSourceContent}
              onChange={(event) => setDiscardSourceContent(event.target.checked)}
            />

            {confirmField(
              "contributor-merge-confirm",
              mergeConfirm,
              setMergeConfirm,
              !mergeDestination,
              mergeDestination ? undefined : "Choose a destination first.",
            )}

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending !== null || !mergeTarget || !matches(mergeConfirm)}
              aria-busy={pending === "merge" || undefined}
              onClick={() => void handleMerge()}
            >
              <Icon icon="lucide:merge" size={15} />
              {pending === "merge" ? "Merging" : "Merge and delete this profile"}
            </Button>
          </Operation>

          <Operation
            heading={<SubHeading className="theme-text-primary text-sm font-semibold">Retarget bylines</SubHeading>}
            description="Points every report written under a byline at this profile, and records that byline as an alias. Use it when a report credits a name this profile owns."
          >
            <EditorField id="contributor-retarget-author" label="Byline to retarget" description={knownAuthorNames.length > 0 ? `Bylines on this profile's reports: ${knownAuthorNames.join(", ")}.` : undefined}>
              {(control) => (
                <Input
                  {...control}
                  value={retargetAuthor}
                  onChange={(event) => setRetargetAuthor(event.target.value)}
                  placeholder="Author name as written on the report"
                  list="contributor-known-authors"
                  autoComplete="off"
                  className="text-[16px] md:text-sm"
                />
              )}
            </EditorField>
            <datalist id="contributor-known-authors">
              {knownAuthorNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {confirmField("contributor-retarget-confirm", retargetConfirm, setRetargetConfirm)}

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending !== null || !retargetAuthor.trim() || !matches(retargetConfirm)}
              aria-busy={pending === "retarget" || undefined}
              onClick={() => void handleRetarget()}
            >
              <Icon icon="lucide:user-round-cog" size={15} />
              {pending === "retarget" ? "Retargeting" : "Retarget these bylines"}
            </Button>
          </Operation>

          <Operation
            heading={<SubHeading className="theme-text-primary text-sm font-semibold">Delete this profile</SubHeading>}
            description="Destroys the bio, picture and links outright. Refused while any report still credits this key: retarget or merge first, or the report would link to a page that is gone."
          >
            {creditedReports ? (
              <p className="flex items-start gap-2 text-sm text-dose-warning">
                <Icon icon="lucide:triangle-alert" size={14} className="mt-0.5 shrink-0" />
                <span>{`${creditedReports} ${creditedReports === 1 ? "trip report credits" : "trip reports credit"} this profile now, so a delete will be refused.`}</span>
              </p>
            ) : null}
            {confirmField("contributor-delete-confirm", deleteConfirm, setDeleteConfirm)}

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending !== null || !matches(deleteConfirm)}
              aria-busy={pending === "delete" || undefined}
              onClick={() => void handleDelete()}
            >
              <Icon icon="lucide:trash-2" size={15} />
              {pending === "delete" ? "Deleting" : "Delete profile"}
            </Button>
          </Operation>
        </div>
      ) : null}
    </section>
  );
}

function Operation({ heading, description, children }: { heading: ReactNode; description: string; children: ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        {heading}
        <p className="theme-text-muted max-w-[65ch] text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}
