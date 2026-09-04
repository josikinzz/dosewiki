"use client";

import { useCallback, useRef } from "react";

import { StateCard } from "@/components/common/StateCard";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorField,
  EditorList,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  useDirtyGuard,
  useScrollToDetail,
  type EditorNavOption,
} from "@/features/dev/components";

import { ContributorProfileEditor } from "./ContributorProfileEditor";
import { useContributorsController, type ContributorScope } from "./useContributorsController";

export type ContributorsTabProps = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
  /** Editor role. Without it the tab is the signed-in user's own record and nothing else. */
  canEdit: boolean;
  /** Admin role: the trust fields (role, membership, flags, staff note) are editable only with it. */
  canApprove: boolean;
  /** The signed-in user's own contributor key. */
  sessionProfileKey: string;
  /** The route's `?scope=` value, validated by the registry; anything else opens on all. */
  initialScope?: string;
};

const SCOPE_OPTIONS: EditorNavOption[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Just me" },
];

const SCOPE_DESCRIPTION: Record<ContributorScope, string> = {
  all: "Every contributor profile the site credits: identity, bio, links, aliases, and the order their work appears in on their public page.",
  me: "Your own contributor profile: identity, bio, links, and the order your work appears in on your public page.",
};

const DIRTY_GUARD_COPY = {
  title: "Leave this profile?",
  description:
    "This profile has changes that are not saved. Leaving drops them; the stored profile stays as it was.",
};

/** `12 profiles`, or `1 of 12 profiles` while a search or the scope narrows the rail. */
function railCount(visible: number, total: number): string {
  const noun = `profile${total === 1 ? "" : "s"}`;
  return visible === total ? `${total} ${noun}` : `${visible} of ${total} ${noun}`;
}

/**
 * Contributors: the one people editor.
 *
 * Reads the contributor directory the shell already subscribes to for the
 * rail, then delegates profile loading and persistence to its feature
 * controller. An editor browses the whole directory or narrows it to their
 * own record; a contributor without editor role only ever sees their own.
 */
export function ContributorsTab({
  profiles,
  isDirectoryLoading,
  canEdit,
  canApprove,
  sessionProfileKey,
  initialScope,
}: ContributorsTabProps) {
  const controller = useContributorsController({
    profiles,
    canEdit,
    canApprove,
    sessionProfileKey,
    initialScope,
  });
  const {
    scope,
    setScope,
    search,
    setSearch,
    directory,
    visibleProfiles,
    selectedKey,
    resolvedKey,
    selectProfile,
    detail,
    detailError,
    isDetailLoading,
    retryDetail,
    hasUnsavedChanges,
    notice,
  } = controller;

  // Below the lg split the directory stacks above the profile editor. Keyed on
  // the tapped row, not `resolvedKey`, so the first-row fallback on load and
  // on scope change does not move the page.
  const detailRef = useRef<HTMLDivElement | null>(null);
  useScrollToDetail(detailRef, selectedKey || null);

  // Picking another row or flipping the scope replaces the loaded record, and
  // with it every unsaved field and order. Both go through the guard.
  const { guard, dialog: dirtyGuardDialog } = useDirtyGuard(hasUnsavedChanges, DIRTY_GUARD_COPY);
  const guardedSelect = useCallback(
    (key: string) => {
      if (key === resolvedKey) return;
      guard(() => selectProfile(key));
    },
    [guard, resolvedKey, selectProfile],
  );
  const guardedSetScope = useCallback(
    (next: ContributorScope) => {
      if (next === scope) return;
      guard(() => setScope(next));
    },
    [guard, scope, setScope],
  );

  if (isDirectoryLoading && directory.length === 0) {
    return (
      <StateCard loading compact className="mt-10" title="Loading contributors" />
    );
  }

  const editorPane = (
    <div ref={detailRef} className="scroll-mt-6 space-y-6">
      {notice ? <EditorNotice notice={notice} /> : null}
      {detailError ? (
        <LoadErrorState message={detailError} onRetry={retryDetail} busy={isDetailLoading} />
      ) : null}
      {isDetailLoading && !detail ? (
        <StateCard loading compact title="Loading profile" />
      ) : null}
      <ContributorProfileEditor controller={controller} />
      {canEdit && !detail && !isDetailLoading && !detailError ? (
        <p className="theme-text-faint text-sm">Select a contributor to edit their profile.</p>
      ) : null}
    </div>
  );

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      {dirtyGuardDialog}
      <EditorSection
        icon="lucide:users"
        title={canEdit ? "Contributors" : "Your profile"}
        description={SCOPE_DESCRIPTION[scope]}
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <EditorSegmentedControl
                label="Scope"
                value={scope}
                onChange={(value) => guardedSetScope(value as ContributorScope)}
                options={SCOPE_OPTIONS}
              />
              <EditorStatusPill tone="neutral">
                {railCount(visibleProfiles.length, directory.length)}
              </EditorStatusPill>
            </div>
          ) : undefined
        }
      >
        {canEdit ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              {scope === "all" ? (
                <EditorField
                  label="Search"
                  description="Matches a display name, a profile key, or any stored alias."
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Name, key, or alias"
                    />
                  )}
                </EditorField>
              ) : null}

              <EditorList
                label="Contributors"
                items={visibleProfiles}
                getKey={(profile) => profile.key}
                selectedKey={resolvedKey || null}
                onSelect={guardedSelect}
                emptyText={
                  scope === "me"
                    ? "No stored profile yet. Saving below creates it."
                    : "No contributor matches that search."
                }
                renderItem={(profile, { selected }) => (
                  <EditorListItem
                    active={selected}
                    tabIndex={-1}
                    title={profile.displayName}
                    subtitle={
                      profile.aliases.length > 0
                        ? `${profile.key} · ${profile.aliases.slice(0, 3).join(", ")}`
                        : profile.key
                    }
                  />
                )}
              />
            </div>

            {editorPane}
          </div>
        ) : (
          editorPane
        )}
      </EditorSection>
    </div>
  );
}
