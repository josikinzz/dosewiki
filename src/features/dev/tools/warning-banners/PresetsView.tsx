"use client";

/**
 * Presets — the authoring and enablement surface (design brief §3, view 1).
 *
 * Table-led on purpose: `Status` and `Enabled on` are readable for every preset
 * without a click, because "what does a reader see right now?" is the question
 * this tool exists to answer, and the prose is the least urgent thing on it. One
 * row at a time expands into a drawer; editing two presets at once is not a real
 * workflow and would double the unsaved-state surface.
 *
 * The drawer is one column, three sections — preview, words, where it shows.
 * The two-column version put a second, narrower preview in a sidebar where the
 * banner never got its real width, and split the assignment controls into a
 * matcher input, a suggestion list and three commit buttons that were all the
 * same act. `searchWarningBannerTargets` collapsed that into one field: an
 * editor after one drug and an editor after a whole class were never doing
 * different things.
 */

import { Fragment } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  SAFETY_BANNER_ICON_SIZE_MAX,
  SAFETY_BANNER_ICON_SIZE_MIN,
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerPresetState,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  EditorActionStatus,
  EditorField,
  EditorStatusPill,
  EditorToolbar,
  type EditorActionStatusState,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { PresetDrawer } from "./PresetDrawer";

/**
 * System A — enablement state. Grey for `off` because off is the correct
 * default and colouring it red would train an editor that the safe state looks
 * broken; green appears here and nowhere else in the tool (design brief §5).
 * Severity colour never reaches a table row, which is why the `Tone` column is
 * plain text: a rose chip must only ever mean "this is about a severe risk".
 */
const STATE_PILL_TONE: Record<WarningBannerPresetState, EditorStatusPillTone> = {
  live: "success",
  dormant: "caution",
  off: "neutral",
};

const STATE_LABEL: Record<WarningBannerPresetState, string> = {
  live: "live",
  dormant: "renders nowhere",
  off: "off",
};

const HEADER_CELL_CLASS =
  "theme-text-faint px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]";

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
  onTextChange: (text: string) => void;
  onSave: () => void;
  onReset: () => void;
};

export type PresetsViewProps = {
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  /** Global, not per preset: the same size renders on every banner on the site. */
  iconSizeControl: BannerIconSizeControl;
  /** Key of the expanded row, or `null` when no stored preset is open. */
  openKey: string | null;
  draft: WarningBannerPreset | null;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onOpen: (preset: WarningBannerPreset | null) => void;
  onCreate: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onCommitEnabledSlugs: (
    preset: WarningBannerPreset,
    nextSlugs: string[],
    summary: string,
  ) => void;
  onRequestDelete: (preset: WarningBannerPreset) => void;
  onInspectCoverage: (slug: string) => void;
};

export function PresetsView({
  presets,
  targets,
  iconSizeControl,
  openKey,
  draft,
  isNew,
  isDirty,
  saveState,
  iconValid,
  onIconValidityChange,
  onDraftChange,
  onOpen,
  onCreate,
  onSave,
  onDiscard,
  onCommitEnabledSlugs,
  onRequestDelete,
  onInspectCoverage,
}: PresetsViewProps) {
  const drawerProps = {
    isDirty,
    saveState,
    iconValid,
    iconSize: iconSizeControl.size,
    targets,
    onIconValidityChange,
    onDraftChange,
    onSave,
    onDiscard,
    onCommitEnabledSlugs,
    onRequestDelete,
    onInspectCoverage,
  };

  /**
   * The field holds raw text so typing `50` is not clamped to `24` at the first
   * digit, which means the number on screen and the size the previews render at
   * can legitimately disagree for a keystroke. This line says which one the
   * server will believe, because the clamp never rejects a save.
   */
  const typedSize = iconSizeControl.text.trim();
  const parsedSize = Number.parseInt(typedSize, 10);
  const sizeHint = !Number.isFinite(parsedSize)
    ? `Blank reads as the default ${SAFETY_BANNER_ICON_SIZE_DEFAULT}px.`
    : parsedSize < SAFETY_BANNER_ICON_SIZE_MIN || parsedSize > SAFETY_BANNER_ICON_SIZE_MAX
      ? `Sizes run ${SAFETY_BANNER_ICON_SIZE_MIN}–${SAFETY_BANNER_ICON_SIZE_MAX}px; ${parsedSize} saves as ${iconSizeControl.size}px.`
      : null;

  return (
    <div className="space-y-5">
      <EditorToolbar variant="split">
        {/* The only global setting in a view where every other control edits one
            preset, so it is labelled with its blast radius rather than its unit:
            an editor adjusting the size of the banner in front of them is in
            fact adjusting every banner on the site. It lives out here and never
            in `PresetDrawer` for exactly that reason. */}
        <EditorField
          label="Icon size · applies to every banner"
          description="One glyph size for every safety banner on the site. Saving updates every article that shows one."
          counter={`${iconSizeControl.size}px`}
          error={sizeHint}
          className="min-w-[17rem] flex-1 space-y-1.5"
        >
          {(controlProps) => (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                {...controlProps}
                type="number"
                inputSize="sm"
                variant={sizeHint ? "error" : "default"}
                className="w-[5.5rem] tabular-nums"
                min={SAFETY_BANNER_ICON_SIZE_MIN}
                max={SAFETY_BANNER_ICON_SIZE_MAX}
                step={1}
                value={iconSizeControl.text}
                onChange={(event) => iconSizeControl.onTextChange(event.target.value)}
              />
              {/* `Save size` and `Reset`, never `Save preset` and `Discard
                  changes`: the two writes are independent and the words are the
                  only thing keeping them apart on screen. */}
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={!iconSizeControl.dirty || iconSizeControl.saveState === "saving"}
                onClick={iconSizeControl.onSave}
              >
                <Icon icon="lucide:save" size={15} />
                Save size
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!iconSizeControl.dirty || iconSizeControl.saveState === "saving"}
                onClick={iconSizeControl.onReset}
              >
                <Icon icon="lucide:rotate-ccw" size={15} />
                Reset
              </Button>
              {iconSizeControl.saveState === "idle" ? (
                iconSizeControl.dirty ? (
                  <EditorStatusPill tone="warning">Unsaved size</EditorStatusPill>
                ) : null
              ) : (
                <EditorActionStatus status={iconSizeControl.saveState} />
              )}
            </div>
          )}
        </EditorField>

        <div className="flex flex-wrap items-center gap-3">
          <p className="theme-text-faint max-w-[26rem] text-sm">
            {presets.length === 0
              ? "A preset holds the words a reader sees. Enabling it is a separate, later decision."
              : "Open a row to edit its words and choose where it shows."}
          </p>
          <Button type="button" variant="accent" size="sm" onClick={onCreate}>
            <Icon icon="lucide:plus" size={15} />
            New preset
          </Button>
        </div>
      </EditorToolbar>

      {isNew && draft ? <PresetDrawer {...drawerProps} draft={draft} isNew /> : null}

      {presets.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-dose-border">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-dose-border">
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Preset
                </th>
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Tone
                </th>
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Status
                </th>
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Enabled on
                </th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset) => {
                const state = warningBannerPresetState(preset);
                const open = preset.key === openKey;
                return (
                  <Fragment key={preset.key}>
                    <tr className="border-b border-dose-border last:border-0">
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => onOpen(open ? null : preset)}
                          className="theme-focus-ring-tight flex min-w-0 items-center gap-2 text-left"
                        >
                          <Icon
                            icon={open ? "lucide:chevron-down" : "lucide:chevron-right"}
                            size={14}
                            className="theme-text-faint shrink-0"
                          />
                          {/* `key` is the name now. One banner used to carry
                              three of them — key, label, headline — and nobody
                              could say which the table was showing. */}
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate font-mono text-sm font-medium",
                                open ? "theme-accent-heading" : "theme-text-primary",
                              )}
                            >
                              {preset.key}
                            </span>
                            <span className="theme-text-faint block truncate text-xs">
                              {preset.headline || "No headline yet"}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="theme-text-secondary px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em]">
                        {preset.tone}
                      </td>
                      <td className="px-3 py-2.5">
                        <EditorStatusPill tone={STATE_PILL_TONE[state]}>
                          {state === "live"
                            ? `live · ${preset.enabledSlugs.length}`
                            : STATE_LABEL[state]}
                        </EditorStatusPill>
                      </td>
                      <td className="theme-text-secondary px-3 py-2.5 text-sm tabular-nums">
                        {preset.enabledSlugs.length}
                      </td>
                    </tr>
                    {open && draft ? (
                      <tr className="border-b border-dose-border last:border-0">
                        <td colSpan={4} className="p-3">
                          <PresetDrawer {...drawerProps} draft={draft} isNew={false} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
