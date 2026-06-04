import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/common/AppImage";
import {
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
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
}: AboutFounderSelectionSectionProps) {
  return (
    <EditorPanel>
      <EditorPanelHeader
        icon="lucide:user-round"
        title="Founders list"
        description="Toggle which contributor bios display under the About section. Selections update instantly on the public page once committed."
      />
      <EditorPanelBody className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-2">
        {sortedProfiles.map((profile) => {
          const isSelected = currentFounderSet.has(profile.key);
          const initials = initialsByKey.get(profile.key) ?? profile.key.slice(0, 2).toUpperCase();

          return (
            <label
              key={profile.key}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                isSelected
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-[color:var(--editor-panel-border)] theme-article-subsection-card hover:border-[color:var(--editor-panel-border-strong)]"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => onToggleFounderKey(profile.key)}
              />
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[color:var(--editor-panel-border)] theme-article-subsection-card-nested text-sm font-semibold theme-text-secondary">
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
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold theme-text-primary">{profile.displayName}</p>
                <p className="text-xs uppercase tracking-[0.3em] theme-text-faint">@{profile.key.toLowerCase()}</p>
              </div>
            </label>
          );
        })}
      </div>
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
      {(addedFounders.length > 0 || removedFounders.length > 0) && (
        <div className="rounded-2xl border border-[color:var(--editor-panel-border)] theme-article-subsection-card p-4 text-xs theme-text-muted">
          {addedFounders.length > 0 && (
            <p>
              <span className="font-semibold text-emerald-300">Added:</span> {formatFounderList(addedFounders)}
            </p>
          )}
          {removedFounders.length > 0 && (
            <p className="mt-2">
              <span className="font-semibold text-rose-300">Removed:</span> {formatFounderList(removedFounders)}
            </p>
          )}
        </div>
      )}
      </EditorPanelBody>
    </EditorPanel>
  );
}
