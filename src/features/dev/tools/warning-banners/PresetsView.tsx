"use client";

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

export type BannerIconSizeControl = {
  size: number;
  text: string;
  dirty: boolean;
  saveState: EditorActionStatusState | "idle";
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
  capped?: CapSuppression;
  iconSizeControl: BannerIconSizeControl;
  iconSizeNotice: NoticeMessage | null;
  onDismissIconSizeNotice: () => void;
  draft: WarningBannerPreset | null;
  saved: WarningBannerPreset | null;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
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
  const [narrowScreen] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches,
  );
  const isNew = draft !== null && saved === null;

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

function IconSizeSection({
  control,
  notice,
  onDismissNotice,
}: {
  control: BannerIconSizeControl;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
}) {
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
            <span
              aria-hidden
              title={`${control.size}px`}
              className="theme-portal-rule inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control border p-1"
            >
              <Icon icon="lucide:triangle-alert" size={control.size} className="theme-text-secondary" />
            </span>
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
      {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
    </section>
  );
}

