"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WarningBannerPreset, WarningBannerTarget } from "@/data/substanceWarningBanners";
import {
  EditorNavTabs,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { CoverageView } from "./CoverageView";
import {
  PresetsView,
  type BannerIconSizeControl,
  type PresetsViewProps,
} from "./PresetsView";

export type WarningBannersStudioViewMode = "presets" | "coverage";

type WarningBannersStudioViewProps = {
  initialSubstanceSlug?: string;
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  targetsError: string | null;
  liveSlugs: ReadonlySet<string>;
  view: WarningBannersStudioViewMode;
  coverageSlug: string;
  openKey: string | null;
  draft: WarningBannerPreset | null;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  notice: EditorNoticeMessage | null;
  iconSizeNotice: EditorNoticeMessage | null;
  iconSizeControl: BannerIconSizeControl;
  iconValid: boolean;
  pendingDelete: WarningBannerPreset | null;
  onRetryTargets: () => void;
  onViewChange: (view: WarningBannersStudioViewMode) => void;
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onOpen: (preset: WarningBannerPreset | null) => void;
  onCreate: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onCommitEnabledSlugs: PresetsViewProps["onCommitEnabledSlugs"];
  onRequestDelete: (preset: WarningBannerPreset | null) => void;
  onInspectCoverage: (slug: string) => void;
  onCoverageSlugChange: (slug: string) => void;
  onEditCoveragePreset: (preset: WarningBannerPreset) => void;
  onConfirmDelete: () => void;
};

/**
 * Presentation for the studio. Its parent owns every query, draft and write so
 * switching between Presets and Coverage cannot fork state or save feedback.
 */
export function WarningBannersStudioView({
  initialSubstanceSlug,
  presets,
  targets,
  targetsError,
  liveSlugs,
  view,
  coverageSlug,
  openKey,
  draft,
  isNew,
  isDirty,
  saveState,
  notice,
  iconSizeNotice,
  iconSizeControl,
  iconValid,
  pendingDelete,
  onRetryTargets,
  onViewChange,
  onIconValidityChange,
  onDraftChange,
  onOpen,
  onCreate,
  onSave,
  onDiscard,
  onCommitEnabledSlugs,
  onRequestDelete,
  onInspectCoverage,
  onCoverageSlugChange,
  onEditCoveragePreset,
  onConfirmDelete,
}: WarningBannersStudioViewProps) {
  const nothingLive = liveSlugs.size === 0;

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:triangle-alert"
        title="Banner Studio"
        description="Safety banners for a drug class. A preset renders on a substance only when it is enabled and that substance is on its list — never because of how the article is classified."
        actions={
          <EditorStatusPill tone="neutral">
            {`${presets.length} preset${presets.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        {/* The rollout readout. Deliberately the largest type in the tool: no
            other /dev surface leads with the blast radius of its own data, and
            it stays at zero until an editor acts (design brief §2). */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p
            className={
              nothingLive
                ? "theme-text-primary font-display text-[22px] font-semibold tabular-nums"
                : "font-display text-[22px] font-semibold tabular-nums text-dose-success"
            }
          >
            {targets.length > 0
              ? `${liveSlugs.size} of ${targets.length} substances show a banner`
              : `${liveSlugs.size} substances show a banner`}
          </p>
          {nothingLive ? (
            <p className="theme-text-secondary text-sm">
              No preset is live. Nothing on the public site shows a banner.
            </p>
          ) : null}
        </div>

        {targetsError ? (
          <EditorNotice
            notice={{
              tone: "danger",
              title: "Couldn't load the substance list",
              message: (
                <>
                  {targetsError}
                  {" Substance search and the Coverage rail stay empty until it loads."}
                </>
              ),
              actions: (
                <Button type="button" variant="secondary" size="sm" onClick={onRetryTargets}>
                  <Icon icon="lucide:refresh-cw" size={15} />
                  Retry
                </Button>
              ),
            }}
          />
        ) : null}

        {notice ? <EditorNotice notice={notice} /> : null}
        {/* A second, separate notice. Sharing one would let a preset save and a
            size save overwrite each other's outcome on screen. */}
        {iconSizeNotice ? <EditorNotice notice={iconSizeNotice} /> : null}

        <EditorNavTabs
          label="Banner Studio views"
          value={view}
          onChange={(next) => onViewChange(next === "coverage" ? "coverage" : "presets")}
          options={[
            { value: "presets", label: "Presets", icon: "lucide:layers", badge: presets.length },
            {
              value: "coverage",
              label: "Coverage",
              icon: "lucide:list-checks",
              badge: liveSlugs.size,
            },
          ]}
        />

        {initialSubstanceSlug ? (
          <p className="theme-text-faint text-xs">
            {"Opened from "}
            <span className="font-mono">{`/dev/banners/${initialSubstanceSlug}`}</span>
            {" — Coverage started on that substance."}
          </p>
        ) : null}

        {view === "presets" ? (
          <PresetsView
            presets={presets}
            targets={targets}
            iconSizeControl={iconSizeControl}
            openKey={openKey}
            draft={draft}
            isNew={isNew}
            isDirty={isDirty}
            saveState={saveState}
            iconValid={iconValid}
            onIconValidityChange={onIconValidityChange}
            onDraftChange={onDraftChange}
            onOpen={onOpen}
            onCreate={onCreate}
            onSave={onSave}
            onDiscard={onDiscard}
            onCommitEnabledSlugs={onCommitEnabledSlugs}
            onRequestDelete={onRequestDelete}
            onInspectCoverage={onInspectCoverage}
          />
        ) : (
          <CoverageView
            presets={presets}
            targets={targets}
            iconSize={iconSizeControl.size}
            activeSlug={coverageSlug}
            onActiveSlugChange={onCoverageSlugChange}
            saveState={saveState}
            onCommitEnabledSlugs={onCommitEnabledSlugs}
            onEditPreset={onEditCoveragePreset}
          />
        )}
      </EditorSection>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && onRequestDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete preset</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.key} is enabled on ${pendingDelete.enabledSlugs.length} substance${pendingDelete.enabledSlugs.length === 1 ? "" : "s"}. Deleting destroys its headline and mechanism text, and it stops rendering everywhere.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onRequestDelete(null)}
            >
              Keep preset
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={onConfirmDelete}>
              <Icon icon="lucide:trash-2" size={15} />
              Delete preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
