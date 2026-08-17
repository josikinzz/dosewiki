"use client";

import { StateCard } from "@/components/common/StateCard";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";

import { ContributorProfileEditor } from "./ContributorProfileEditor";
import { useContributorsController } from "./useContributorsController";

export type ContributorsTabProps = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
};

/**
 * Contributors — the editor-side view of the people the site credits.
 *
 * Reads the contributor directory the shell already subscribes to for the rail,
 * then delegates profile loading and persistence to its feature controller.
 */
export function ContributorsTab({ profiles, isDirectoryLoading }: ContributorsTabProps) {
  const controller = useContributorsController(profiles);
  const {
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

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:users"
        title="Contributors"
        description="Every contributor profile the site credits: identity, bio, links, aliases, and the order their work appears in on their public page."
        actions={
          <EditorStatusPill tone="neutral">
            {`${directory.length} profile${directory.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-3">
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

            <div className="space-y-2">
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
                <p className="theme-text-faint text-sm">No contributor matches that search.</p>
              ) : null}
            </div>
          </div>

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
            {!detail && !isDetailLoading && !detailError ? (
              <p className="theme-text-faint text-sm">Select a contributor to edit their profile.</p>
            ) : null}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
