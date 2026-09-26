"use client";

/**
 * Presets: the authoring and enablement surface.
 *
 * An editor workspace, like My reports: the presets on the left as link rows
 * (sticky on desktop), each saying its tone and where it renders without a
 * click, because "what does a reader see right now?" is the question this
 * tool exists to answer; the open preset in a docked pane on the right with
 * its save dock at the bottom. One preset opens at a time; editing two at
 * once is not a real workflow and would double the unsaved-state surface. On
 * a phone the pane stacks under the list, opening a preset scrolls it in, and
 * the pane carries Back to list.
 *
 * The site-wide glyph size sits under the list, apart from the pane, because
 * it is the one control here that changes every banner rather than the one
 * being edited.
 */

import { useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  SAFETY_BANNER_ICON_SIZE_MAX,
  SAFETY_BANNER_ICON_SIZE_MIN,
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  EditorField,
  EditorPanel,
  EditorStatusPill,
  Notice,
  type EditorActionStatusState,
  type NoticeMessage,
} from "@/features/dev/components";
import { ArticlePreviewFrame } from "@/features/dev/components/ArticlePreviewFrame";
import { cn } from "@/lib/utils";
import { LINK_LIST_CLASS } from "../home/homeParts";
import { presetStateLabel, STATE_PILL_TONE, TONE_LABEL } from "./bannerLabels";
import type { CapSuppression } from "./bannerCoverage";
import type { EnablementChange } from "./enablement";
import type { DrawerPreview } from "./PresetDrawer";
import { PresetPane } from "./PresetPane";

/**
 * The site-wide glyph size, wired as one object so the prop bundle reads as a
 * single global setting rather than seven loose fields that could be mistaken
 * for preset state. `text` is raw field input and `size` is the clamped value
 * every preview renders at; they disagree only while a number is half typed.
 */
export type BannerIconSizeControl = {
  size: number;
  text: string;
  dirty: boolean;
  saveState: EditorActionStatusState | "idle";
  /** The stored size could not be read; the field and previews fall back to the default. */
  loadError?: string | null;
  retrying?: boolean;
  onRetryLoad?: () => void;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onReset: () => void;
};

export type PresetsViewProps = {
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  /** Where the two-banner cap hides each preset; omitted in isolation. */
  capped?: CapSuppression;
  /** Global, not per preset: the same size renders on every banner on the site. */
  iconSizeControl: BannerIconSizeControl;
  iconSizeNotice: NoticeMessage | null;
  onDismissIconSizeNotice: () => void;
  /** The open draft, or null when no preset is open. */
  draft: WarningBannerPreset | null;
  /** The stored preset the open draft started from; null for a new preset. */
  saved: WarningBannerPreset | null;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  /** The result of the last preset write: in the save dock while a preset is open, above the list otherwise. */
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  saveKeyLabel: string;
  listRef: RefObject<HTMLElement | null>;
  paneRef: RefObject<HTMLElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onOpen: (preset: WarningBannerPreset) => void;
  onCreate: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onBackToList: () => void;
  /** Asks the controller to confirm and write one enablement change. */
  onRequestEnablement: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onRequestDelete: (preset: WarningBannerPreset) => void;
  onInspectCoverage: (slug: string) => void;
};

export function PresetsView({
  presets,
  targets,
  capped,
  iconSizeControl,
  iconSizeNotice,
  onDismissIconSizeNotice,
  draft,
  saved,
  isDirty,
  saveState,
  iconValid,
  notice,
  onDismissNotice,
  saveKeyLabel,
  listRef,
  paneRef,
  titleRef,
  onIconValidityChange,
  onDraftChange,
  onOpen,
  onCreate,
  onSave,
  onDiscard,
  onClose,
  onBackToList,
  onRequestEnablement,
  onRequestDelete,
  onInspectCoverage,
}: PresetsViewProps) {
  const openKey = draft && saved ? saved.key : null;
  // A phone opens the preview at phone width, where the banner is readable;
  // the frame's own switch still offers the other width.
  const [narrowScreen] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches,
  );
  const isNew = draft !== null && saved === null;

  // The draft in the article's real banner stack: every stored preset stays
  // in play, so the order and the two-banner cap are the ones readers get.
  const renderPreview = ({ draft: previewDraft, slug, slugOptions, onSlugChange }: DrawerPreview) => (
    <ArticlePreviewFrame
      label="Banner preview"
      slug={slug}
      slugOptions={slugOptions}
      onSlugChange={onSlugChange}
      draft={{ banner: { preset: previewDraft, presets } }}
      overrides={{ warningBannerIconSize: iconSizeControl.size }}
      defaultWidth={narrowScreen ? "phone" : "desktop"}
    />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] lg:items-start xl:gap-10">
      <div ref={listRef as RefObject<HTMLDivElement | null>} className="scroll-mt-24 space-y-8 lg:sticky lg:top-24">
        <section aria-labelledby="banner-presets-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="banner-presets-heading" className="type-meta-label theme-text-muted">
              Presets
              <span className="sr-only">{`, ${presets.length}`}</span>
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={onCreate}>
              <Icon icon="lucide:plus" size={15} />
              New preset
            </Button>
          </div>

          {!draft && notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}

          {presets.length === 0 && !isNew ? (
            <p className="theme-text-muted max-w-[60ch] text-sm">
              No presets yet. A preset holds the words a reader sees; where it shows is a separate,
              later decision, and a new preset starts switched off.
            </p>
          ) : (
            <ul aria-label="Banner presets" className={LINK_LIST_CLASS}>
              {isNew && draft ? (
                <li>
                  <PresetRow
                    title={draft.key.trim() || "New preset"}
                    headline={draft.headline}
                    meta={<span className="theme-text-muted">Not published yet</span>}
                    isOpen
                    isDirty
                    onOpen={() => titleRef.current?.focus()}
                  />
                </li>
              ) : null}
              {presets.map((preset) => {
                const isOpen = preset.key === openKey;
                const hidden = capped?.byKey.get(preset.key) ?? 0;
                return (
                  <li key={preset.key} data-preset={preset.key}>
                    <PresetRow
                      title={preset.key}
                      headline={preset.headline}
                      meta={
                        <>
                          <span className="theme-text-muted">{TONE_LABEL[preset.tone]}</span>
                          <span aria-hidden className="theme-text-faint">·</span>
                          <EditorStatusPill inline tone={STATE_PILL_TONE[warningBannerPresetState(preset)]}>
                            {presetStateLabel(preset)}
                          </EditorStatusPill>
                          {hidden > 0 ? (
                            <span className="text-dose-warning">{`Hidden on ${hidden} by the cap`}</span>
                          ) : null}
                        </>
                      }
                      isOpen={isOpen}
                      isDirty={isOpen && isDirty}
                      onOpen={() => (isOpen ? titleRef.current?.focus() : onOpen(preset))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <IconSizeSection control={iconSizeControl} notice={iconSizeNotice} onDismissNotice={onDismissIconSizeNotice} />
      </div>

      <section
        ref={paneRef}
        aria-label={draft ? `Editor: ${saved?.key ?? "new preset"}` : "Editor"}
        className={cn("scroll-mt-24", !draft && "hidden lg:block")}
      >
        {draft ? (
          <PresetPane
            key={saved?.key ?? "new"}
            draft={draft}
            saved={saved}
            isDirty={isDirty}
            saveState={saveState}
            iconValid={iconValid}
            iconSizeControl={iconSizeControl}
            targets={targets}
            notice={notice}
            saveKeyLabel={saveKeyLabel}
            titleRef={titleRef}
            renderPreview={renderPreview}
            onDismissNotice={onDismissNotice}
            onIconValidityChange={onIconValidityChange}
            onDraftChange={onDraftChange}
            onSave={onSave}
            onDiscard={onDiscard}
            onClose={onClose}
            onBackToList={onBackToList}
            onRequestEnablement={onRequestEnablement}
            onRequestDelete={onRequestDelete}
            onInspectCoverage={onInspectCoverage}
          />
        ) : (
          <IdlePane empty={presets.length === 0} />
        )}
      </section>
    </div>
  );
}

/** What the pane says on desktop before a preset is open. Hidden on phones, where the list is the whole view. */
function IdlePane({ empty }: { empty: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:pencil-line" size={18} className="theme-icon-accent shrink-0" />
        {empty ? "Start with New preset" : "Pick a preset to edit"}
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its banner opens here inside a real article, with its words and the substances it shows on.
        You confirm each publish, and readers see it as soon as it lands.
      </p>
    </EditorPanel>
  );
}

function PresetRow({
  title,
  headline,
  meta,
  isOpen,
  isDirty,
  onOpen,
}: {
  title: string;
  headline: string;
  meta: ReactNode;
  isOpen: boolean;
  isDirty: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={isOpen ? "true" : undefined}
      onClick={onOpen}
      className={cn(
        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none",
        isOpen && "theme-dev-link-lead",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="theme-text-primary block truncate font-mono font-medium">{title}</span>
        <span className="theme-text-faint mt-0.5 line-clamp-2 break-words text-xs">
          <span className="sr-only">, </span>
          {headline.trim() || "No headline yet"}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="sr-only">, </span>
          {meta}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {isOpen ? (
          <>
            <span className="sr-only">, </span>
            {isDirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
            <span className="text-dose-accent-strong font-medium">{isDirty ? "Editing, unsaved" : "Editing"}</span>
          </>
        ) : (
          <>
            <span className="sr-only">, </span>
            <span className="theme-text-muted [@media(pointer:fine)]:sr-only">Edit</span>
            <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
          </>
        )}
      </span>
    </button>
  );
}

/**
 * The only global setting in the tool, labelled with its blast radius rather
 * than its unit: an editor adjusting the size of the banner in front of them
 * is in fact adjusting every banner on the site. It never lives in the pane
 * for exactly that reason, and it asks before it saves.
 */
function IconSizeSection({
  control,
  notice,
  onDismissNotice,
}: {
  control: BannerIconSizeControl;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
}) {
  /**
   * The field holds raw text so typing `50` is not clamped to `24` at the first
   * digit, which means the number on screen and the size the previews render at
   * can legitimately disagree for a keystroke. This line says which one the
   * server will believe, because the clamp never rejects a save.
   */
  const typedSize = control.text.trim();
  const parsedSize = Number.parseInt(typedSize, 10);
  const sizeHint = !Number.isFinite(parsedSize)
    ? `Blank reads as the default ${SAFETY_BANNER_ICON_SIZE_DEFAULT}px.`
    : parsedSize < SAFETY_BANNER_ICON_SIZE_MIN || parsedSize > SAFETY_BANNER_ICON_SIZE_MAX
      ? `Sizes run ${SAFETY_BANNER_ICON_SIZE_MIN} to ${SAFETY_BANNER_ICON_SIZE_MAX}px; ${parsedSize} saves as ${control.size}px.`
      : null;
  const busy = control.saveState === "saving";

  return (
    <section aria-labelledby="banner-every-heading" className="theme-portal-rule space-y-3 border-t pt-5">
      <h3 id="banner-every-heading" className="type-meta-label theme-text-muted">
        Every banner
      </h3>
      {control.loadError ? (
        <Notice
          tone="warning"
          title="Could not load the stored icon size"
          message={`Previews use the default ${SAFETY_BANNER_ICON_SIZE_DEFAULT}px until it loads. ${control.loadError}`}
          actions={
            control.onRetryLoad ? (
              <Button type="button" variant="outline" size="sm" disabled={control.retrying} aria-busy={control.retrying || undefined} onClick={control.onRetryLoad}>
                {control.retrying ? "Trying again" : "Try again"}
              </Button>
            ) : undefined
          }
          className="text-sm"
        />
      ) : null}
      <EditorField
        label="Icon size · applies to every banner"
        description={`One glyph size for every safety banner on the site, ${SAFETY_BANNER_ICON_SIZE_MIN} to ${SAFETY_BANNER_ICON_SIZE_MAX}px. The previews here use it too.`}
        counter={`${control.size}px`}
        error={sizeHint}
      >
        {(controlProps) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              {...controlProps}
              type="number"
              inputMode="numeric"
              inputSize="sm"
              variant={sizeHint ? "error" : "default"}
              className="w-[5.5rem] tabular-nums"
              min={SAFETY_BANNER_ICON_SIZE_MIN}
              max={SAFETY_BANNER_ICON_SIZE_MAX}
              step={1}
              value={control.text}
              onChange={(event) => control.onTextChange(event.target.value)}
            />
            {/* A glyph at the size it saves as, so the number reads as a size. */}
            <span
              aria-hidden
              title={`${control.size}px`}
              className="theme-portal-rule inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control border p-1"
            >
              <Icon icon="lucide:triangle-alert" size={control.size} className="theme-text-secondary" />
            </span>
            {/* `Save size` and `Reset`, never `Publish preset` and `Discard
                edits`: the two writes are independent and the words are the
                only thing keeping them apart on screen. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!control.dirty || busy}
              aria-busy={busy || undefined}
              onClick={control.onSave}
            >
              {busy ? "Saving" : "Save size"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!control.dirty || busy} onClick={control.onReset}>
              Reset
            </Button>
          </div>
        )}
      </EditorField>
      {control.dirty && !busy ? (
        <p aria-live="polite" className="theme-text-secondary flex items-center gap-2 text-xs">
          <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
          Unsaved size
        </p>
      ) : null}
      {/* Its own notice, apart from the preset notice, so a size save and a
          preset save never overwrite each other's outcome on screen. */}
      {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
    </section>
  );
}

