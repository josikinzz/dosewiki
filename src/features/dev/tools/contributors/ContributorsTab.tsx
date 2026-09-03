"use client";

import { StateCard } from "@/components/common/StateCard";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
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
    resolvedKey,
    selectProfile,
    detail,
    detailError,
    isDetailLoading,
    notice,
  } = controller;

  if (isDirectoryLoading && directory.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:users"
          tone="accent"
          loading
          align="center"
          title="Loading contributors"
          description="Pulling the contributor directory into the editor."
        />
      </div>
    );
  }

  const editorPane = (
    <div className="space-y-6">
      {notice ? <EditorNotice notice={notice} /> : null}
      {detailError ? (
        <StateCard
          icon="lucide:triangle-alert"
          tone="danger"
          align="center"
          title="Could not load that contributor"
          description={detailError}
        />
      ) : null}
      {isDetailLoading && !detail ? (
        <StateCard
          icon="lucide:user-round"
          tone="accent"
          loading
          align="center"
          title="Loading profile"
          description="Fetching the stored profile, replications, and reports."
        />
      ) : null}
      <ContributorProfileEditor controller={controller} />
      {canEdit && !detail && !isDetailLoading && !detailError ? (
        <p className="theme-text-faint text-sm">Select a contributor to edit their profile.</p>
      ) : null}
    </div>
  );

  return (
    <div className="mt-6 space-y-8 md:mt-8">
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
                onChange={(value) => setScope(value as ContributorScope)}
                options={SCOPE_OPTIONS}
              />
              <EditorStatusPill tone="neutral">
                {`${directory.length} profile${directory.length === 1 ? "" : "s"}`}
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

              <div role="group" aria-label="Contributors" className="space-y-2">
                {visibleProfiles.map((profile) => (
                  <EditorListItem
                    key={profile.key}
                    active={profile.key === resolvedKey}
                    title={profile.displayName}
                    subtitle={
                      profile.aliases.length > 0
                        ? `${profile.key} · ${profile.aliases.slice(0, 3).join(", ")}`
                        : profile.key
                    }
                    onSelect={() => selectProfile(profile.key)}
                  />
                ))}
                {visibleProfiles.length === 0 ? (
                  <p className="theme-text-faint text-sm">
                    {scope === "me"
                      ? "No stored profile yet. Saving below creates it."
                      : "No contributor matches that search."}
                  </p>
                ) : null}
              </div>
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
