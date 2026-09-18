import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/common/AppImage";
import {
  EditorField,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import type { NormalizedUserProfile } from "@/data/userProfiles";

type AboutFounderSelectionSectionProps = {
  availableProfiles: NormalizedUserProfile[];
  /** The founders as they currently stand, in display order. */
  selectedFounders: NormalizedUserProfile[];
  initialsByKey: ReadonlyMap<string, string>;
  onToggleFounderKey: (key: string) => void;
  onResetFounderKeys: () => void;
  isFounderSelectionDirty: boolean;
  addedFounders: string[];
  removedFounders: string[];
  formatFounderList: (keys: string[]) => string;
  isLoadingProfiles?: boolean;
};

/**
 * The founders shown on the public About page: the chosen profiles as cards,
 * each with its own Remove, and one type-ahead picker to add another. The
 * contributor directory runs to thousands of profiles, so nothing here lists
 * it; the picker searches it.
 */
export function AboutFounderSelectionSection({
  availableProfiles,
  selectedFounders,
  initialsByKey,
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
      .map((profile) => ({
        value: profile.key,
        label: profile.displayName,
        hint: `@${profile.key.toLowerCase()}`,
      }));
  }, [availableProfiles, selectedFounders]);

  return (
    <EditorSection
      icon="lucide:user-round"
      title="Founders list"
      description="The contributor bios shown under the About page. Add or remove people here, then save the page."
      actions={(
        <EditorStatusPill tone={isFounderSelectionDirty ? "warning" : "success"}>
          {isFounderSelectionDirty ? "Changed" : "Clean"}
        </EditorStatusPill>
      )}
    >
      {showLoadingState ? (
        <EditorStatusPill tone="info" loading>
          Loading contributor profiles…
        </EditorStatusPill>
      ) : null}
      {!showLoadingState && !hasProfiles ? (
        <p className="theme-text-faint text-sm">
          No contributor profiles yet. Create one in the Profile tab to pin it
          here as a founder.
        </p>
      ) : null}
      {hasProfiles ? (
        <>
          {selectedFounders.length > 0 ? (
            <ul aria-label="Founders" className="grid gap-3 sm:grid-cols-2">
              {selectedFounders.map((profile) => {
                const initials =
                  initialsByKey.get(profile.key) ?? profile.key.slice(0, 2).toUpperCase();
                return (
                  <li
                    key={profile.key}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2.5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--editor-panel-border)] theme-article-subsection-card-nested text-sm font-semibold theme-text-secondary">
                      {profile.avatarUrl ? (
                        <AppImage
                          src={profile.avatarUrl}
                          alt=""
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold theme-text-primary">{profile.displayName}</p>
                      <p className="truncate text-xs uppercase tracking-[0.3em] theme-text-faint">@{profile.key.toLowerCase()}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`Remove ${profile.displayName}`}
                      onClick={() => onToggleFounderKey(profile.key)}
                    >
                      <Icon icon="lucide:x" size={16} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="theme-text-faint text-sm">No founders yet. Add one below.</p>
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

          <EditorToolbar label="Founder selection actions" variant="compact" className="text-xs">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetFounderKeys}
              disabled={!isFounderSelectionDirty}
            >
              <Icon icon="lucide:refresh-cw" className="h-3.5 w-3.5" size={14} />
              Reset selections
            </Button>
          </EditorToolbar>
        </>
      ) : null}
      {(addedFounders.length > 0 || removedFounders.length > 0) && (
        <div className="rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-4 text-xs theme-text-muted">
          {addedFounders.length > 0 && (
            <p>
              <span className="font-semibold text-[color:var(--theme-evidence-text)]">Added:</span> {formatFounderList(addedFounders)}
            </p>
          )}
          {removedFounders.length > 0 && (
            <p className="mt-2">
              <span className="font-semibold text-[color:var(--theme-danger-text)]">Removed:</span> {formatFounderList(removedFounders)}
            </p>
          )}
        </div>
      )}
    </EditorSection>
  );
}
