import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { cn } from "@/lib/utils";

import { AboutPaneSection, ChangedMark } from "./AboutPaneSection";

type AboutFounderSelectionSectionProps = {
  availableProfiles: NormalizedUserProfile[];
  /** The founders as they currently stand, in display order. */
  selectedFounders: NormalizedUserProfile[];
  onToggleFounderKey: (key: string) => void;
  onResetFounderKeys: () => void;
  isFounderSelectionDirty: boolean;
  addedFounders: string[];
  removedFounders: string[];
  formatFounderList: (keys: string[]) => string;
  isLoadingProfiles?: boolean;
};

/**
 * The founders shown on the public About page: the chosen profiles, each
 * drawn with the avatar readers see and its own Remove, and one type-ahead
 * picker to add another. The contributor directory runs to thousands of
 * profiles, so nothing here lists it; the picker searches it.
 */
export function AboutFounderSelectionSection({
  availableProfiles,
  selectedFounders,
  onToggleFounderKey,
  onResetFounderKeys,
  isFounderSelectionDirty,
  addedFounders,
  removedFounders,
  formatFounderList,
  isLoadingProfiles = false,
}: AboutFounderSelectionSectionProps) {
  const hasProfiles = availableProfiles.length > 0;
  const showLoadingState = isLoadingProfiles && !hasProfiles;

  const candidateOptions = useMemo(() => {
    const selected = new Set(selectedFounders.map((profile) => profile.key));
    return availableProfiles
      .filter((profile) => !selected.has(profile.key))
      .map((profile) => ({ value: profile.key, label: profile.displayName, hint: `@${profile.key.toLowerCase()}` }));
  }, [availableProfiles, selectedFounders]);

  return (
    <AboutPaneSection
      title="Founders"
      note="The contributor profiles listed under Founders & Contributors on the About page, in name order."
      aside={
        <>
          <ChangedMark changed={isFounderSelectionDirty} />
          {isFounderSelectionDirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={onResetFounderKeys}>
              <Icon icon="lucide:rotate-ccw" size={14} />
              Reset founders
            </Button>
          ) : null}
        </>
      }
    >
      {showLoadingState ? (
        <p role="status" className="theme-text-faint text-sm">Loading contributor profiles</p>
      ) : null}
      {!showLoadingState && !hasProfiles ? (
        <p className="theme-text-faint text-sm">
          No contributor profiles yet. A profile made in Contributors can be listed here as a founder.
        </p>
      ) : null}
      {hasProfiles ? (
        <>
          {selectedFounders.length > 0 ? (
            <ul aria-label="Founders" className="grid gap-2 sm:grid-cols-2">
              {selectedFounders.map((profile) => (
                <li
                  key={profile.key}
                  className="flex items-center gap-3 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] py-2 pl-2.5 pr-1"
                >
                  <ContributorAvatar imageUrl={profile.avatarUrl ?? undefined} name={profile.displayName} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="theme-text-primary truncate text-sm font-medium">{profile.displayName}</p>
                    <p className="theme-text-faint truncate font-mono text-xs">@{profile.key.toLowerCase()}</p>
                  </div>
                  <Button
                    type="button"
                    variant="iconGhost"
                    size="icon"
                    className={cn("shrink-0", TOUCH_ICON)}
                    aria-label={`Remove ${profile.displayName}`}
                    title={`Remove ${profile.displayName}`}
                    onClick={() => onToggleFounderKey(profile.key)}
                  >
                    <Icon icon="lucide:x" size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-text-faint text-sm">No founders are listed. Add one below.</p>
          )}

          <EditorField label="Add founder" description="Search by name or profile key.">
            {(control) => (
              <SearchablePicker
                id={control.id}
                options={candidateOptions}
                value={null}
                onChange={(key) => {
                  if (key) onToggleFounderKey(key);
                }}
                placeholder="Find a contributor"
                emptyText="No contributor matches that."
                ariaLabel="Add founder"
              />
            )}
          </EditorField>
        </>
      ) : null}
      {addedFounders.length > 0 || removedFounders.length > 0 ? (
        <div className="space-y-1 text-xs">
          {addedFounders.length > 0 ? (
            <p className="theme-text-muted">
              <span className="font-semibold theme-success-text-strong">Added:</span> {formatFounderList(addedFounders)}
            </p>
          ) : null}
          {removedFounders.length > 0 ? (
            <p className="theme-text-muted">
              <span className="font-semibold theme-danger-text">Removed:</span> {formatFounderList(removedFounders)}
            </p>
          ) : null}
        </div>
      ) : null}
    </AboutPaneSection>
  );
}
