import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/common/AppImage";
import {
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import type { NormalizedUserProfile } from "@/data/userProfiles";

type AboutFounderSelectionSectionProps = {
  sortedProfiles: NormalizedUserProfile[];
  currentFounderSet: ReadonlySet<string>;
  initialsByKey: ReadonlyMap<string, string>;
  onToggleFounderKey: (key: string) => void;
  onResetFounderKeys: () => void;
  isFounderSelectionDirty: boolean;
  addedFounders: string[];
  removedFounders: string[];
  formatFounderList: (keys: string[]) => string;
  isLoadingProfiles?: boolean;
};

export function AboutFounderSelectionSection({
  sortedProfiles,
  currentFounderSet,
  initialsByKey,
  onToggleFounderKey,
  onResetFounderKeys,
  isFounderSelectionDirty,
  addedFounders,
  removedFounders,
  formatFounderList,
  isLoadingProfiles = false,
}: AboutFounderSelectionSectionProps) {
  const hasProfiles = sortedProfiles.length > 0;
  const showLoadingState = isLoadingProfiles && !hasProfiles;

  return (
    <EditorSection
      icon="lucide:user-round"
      title="Founders list"
      description="Toggle which contributor bios display under the About section. Selections update instantly on the public page once committed."
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
        <div className="grid gap-x-6 sm:grid-cols-2">
          {sortedProfiles.map((profile) => {
            const isSelected = currentFounderSet.has(profile.key);
            const initials = initialsByKey.get(profile.key) ?? profile.key.slice(0, 2).toUpperCase();

            return (
              <label
                key={profile.key}
                className={`theme-gradient-divider-after relative flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 transition after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-px focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--theme-accent-strong)] ${
                  isSelected
                    ? "bg-[color:var(--theme-article-route-active-bg)] after:opacity-0"
                    : "hover:bg-[var(--editor-field-bg)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => onToggleFounderKey(profile.key)}
                />
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--editor-panel-border)] theme-article-subsection-card-nested text-sm font-semibold theme-text-secondary">
                  {profile.avatarUrl ? (
                    <AppImage
                      src={profile.avatarUrl}
                      alt=""
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold theme-text-primary">{profile.displayName}</p>
                  <p className="text-xs uppercase tracking-[0.3em] theme-text-faint">@{profile.key.toLowerCase()}</p>
                </div>
                {isSelected ? (
                  <Icon icon="lucide:check" className="theme-icon-accent shrink-0 h-4 w-4" size={16} />
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
      {hasProfiles ? (
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
