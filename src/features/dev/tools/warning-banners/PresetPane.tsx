"use client";

/**
 * The open preset in the Presets workspace: a docked pane with one header
 * (the preset's key, its tone and where it renders, Close), the drawer's three
 * sections (preview, words, where it shows), a quiet Delete at the end, and a
 * sticky save dock that holds the result of the last write, why Publish is
 * blocked when it is, and the actions. It follows My reports' editing pane, so
 * the outcome of a publish shows where the Publish button is.
 */

import { useId, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  EditorPanel,
  EditorStatusPill,
  Notice,
  type EditorActionStatusState,
  type NoticeMessage,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { presetStateLabel, STATE_PILL_TONE, TONE_LABEL } from "./bannerLabels";
import { PresetDrawer, type DrawerPreview } from "./PresetDrawer";
import type { EnablementChange } from "./enablement";
import { presetDraftIssues, publishBlocker } from "./presetDrafts";
import type { BannerIconSizeControl } from "./PresetsView";

export type PresetPaneProps = {
  draft: WarningBannerPreset;
  /** The stored preset the draft started from; null for a new preset. */
  saved: WarningBannerPreset | null;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  iconSizeControl: BannerIconSizeControl;
  targets: WarningBannerTarget[];
  notice: NoticeMessage | null;
  /** The save key as this platform writes it ("⌘S", "Ctrl S"); shown on fine pointers only. */
  saveKeyLabel: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  renderPreview: (preview: DrawerPreview) => ReactNode;
  onDismissNotice: () => void;
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onBackToList: () => void;
  onRequestEnablement: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onRequestDelete: (preset: WarningBannerPreset) => void;
  onInspectCoverage: (slug: string) => void;
};

export function PresetPane({
  draft,
  saved,
  isDirty,
  saveState,
  iconValid,
  iconSizeControl,
  targets,
  notice,
  saveKeyLabel,
  titleRef,
  renderPreview,
  onDismissNotice,
  onIconValidityChange,
  onDraftChange,
  onSave,
  onDiscard,
  onClose,
  onBackToList,
  onRequestEnablement,
  onRequestDelete,
  onInspectCoverage,
}: PresetPaneProps) {
  const headingId = useId();
  const blockerId = useId();
  const isNew = saved === null;
  const saving = saveState === "saving";
  const blocker = publishBlocker(presetDraftIssues(draft), iconValid, isNew);
  // The header describes the stored preset, which is what readers see now;
  // the draft's own state is in the preview's description.
  const shown = saved ?? draft;
  const state = warningBannerPresetState(shown);

  return (
    <EditorPanel className="overflow-visible" role="region" aria-labelledby={headingId} data-testid="banner-preset-editor">
      <header className="theme-portal-rule relative space-y-2.5 border-b px-4 py-3.5 sm:px-5">
        {/* One Close for both layouts, pinned to the corner; the rows it shares keep clear of it. */}
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close editor"
          title="Close editor"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="pr-12 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
        </div>
        <h3
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className={cn(
            "theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none lg:pr-12",
            !isNew && "font-mono",
          )}
        >
          <span className="sr-only">Editing </span>
          {isNew ? "New preset" : saved.key}
        </h3>
        {isNew ? (
          <p className="theme-text-muted text-sm">
            Nothing publishes until you publish it, and it starts switched off so a half-written
            banner cannot reach a reader.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
            <span className="theme-text-secondary">{TONE_LABEL[shown.tone]}</span>
            <span aria-hidden className="theme-text-faint">·</span>
            <EditorStatusPill inline tone={STATE_PILL_TONE[state]}>{presetStateLabel(shown)}</EditorStatusPill>
          </p>
        )}
      </header>

      <div className="px-4 py-5 sm:px-5">
        <PresetDrawer
          draft={draft}
          isNew={isNew}
          isDirty={isDirty}
          saveState={saveState}
          iconValid={iconValid}
          iconSize={iconSizeControl.size}
          targets={targets}
          onIconValidityChange={onIconValidityChange}
          onDraftChange={onDraftChange}
          onSave={onSave}
          onDiscard={onDiscard}
          onRequestEnablement={onRequestEnablement}
          onInspectCoverage={onInspectCoverage}
          renderPreview={renderPreview}
        />

        {saved ? (
          <div className="theme-portal-rule mt-9 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4">
            <p className="theme-text-muted max-w-[60ch] text-sm">
              Deleting removes the words and stops this banner everywhere it renders. To stop it
              showing but keep the words, untick Enabled and publish instead.
            </p>
            <Button
              type="button"
              variant="ghostDestructive"
              size="sm"
              disabled={saving}
              onClick={() => onRequestDelete(saved)}
            >
              <Icon icon="lucide:trash-2" size={15} />
              Delete preset
            </Button>
          </div>
        ) : null}
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
        {isDirty && blocker ? (
          <p id={blockerId} role="status" className="text-dose-danger text-sm">
            {blocker}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={saving || !isDirty || blocker !== null}
            aria-busy={saving || undefined}
            aria-describedby={isDirty && blocker ? blockerId : undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={onSave}
          >
            {saving ? "Publishing" : "Publish preset"}
            {/* The wrapper hides the cap on touch screens; the kbd class sets its own display. */}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving || !isDirty} onClick={onDiscard}>
            {isNew ? "Discard new preset" : "Discard edits"}
          </Button>
          <SaveState dirty={isDirty} saveState={saveState} />
        </div>
      </footer>
    </EditorPanel>
  );
}

/** One quiet line beside the actions: what Publish would do right now. */
function SaveState({ dirty, saveState }: { dirty: boolean; saveState: EditorActionStatusState | "idle" }) {
  let content: ReactNode;
  if (saveState === "saving") {
    content = "Publishing";
  } else if (dirty) {
    content = (
      <>
        <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
        Unsaved changes
      </>
    );
  } else {
    content = saveState === "saved" ? "Saved" : "No changes yet";
  }
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
      {content}
    </p>
  );
}
