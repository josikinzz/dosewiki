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

import { Fragment, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafetyBanner, SafetyBannerPoints, SafetyBannerTitle } from "@/components/ui/safety-banner";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  searchWarningBannerTargets,
  warningBannerPresetState,
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
  WARNING_BANNER_TONES,
  type WarningBannerPreset,
  type WarningBannerPresetState,
  type WarningBannerTarget,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import {
  EditorActionStatus,
  EditorCheckbox,
  EditorField,
  EditorFieldRow,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
  type EditorActionStatusState,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { BannerIconField } from "./BannerIconField";

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

/** Why the preview is dimmed. `live` needs no line — the banner is the answer. */
const DIMMED_REASON: Record<Exclude<WarningBannerPresetState, "live">, string> = {
  dormant: "Enabled, but no substances selected — dimmed because this renders nowhere.",
  off: "Switched off — dimmed because this renders nowhere.",
};

const HEADER_CELL_CLASS =
  "theme-text-faint px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]";

export type PresetsViewProps = {
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
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
    targets,
    onIconValidityChange,
    onDraftChange,
    onSave,
    onDiscard,
    onCommitEnabledSlugs,
    onRequestDelete,
    onInspectCoverage,
  };

  return (
    <div className="space-y-5">
      <EditorToolbar variant="split">
        <p className="theme-text-faint text-sm">
          {presets.length === 0
            ? "A preset holds the words a reader sees. Enabling it is a separate, later decision."
            : "Open a row to edit its words and choose where it shows."}
        </p>
        <Button type="button" variant="accent" size="sm" onClick={onCreate}>
          <Icon icon="lucide:plus" size={15} />
          New preset
        </Button>
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

type PresetDrawerProps = {
  draft: WarningBannerPreset;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  targets: WarningBannerTarget[];
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
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

function PresetDrawer({
  draft,
  isNew,
  isDirty,
  saveState,
  iconValid,
  targets,
  onIconValidityChange,
  onDraftChange,
  onSave,
  onDiscard,
  onCommitEnabledSlugs,
  onRequestDelete,
  onInspectCoverage,
}: PresetDrawerProps) {
  const [query, setQuery] = useState("");
  const [staged, setStaged] = useState<Set<string>>(new Set());

  // Staging is per preset: carrying ticks from one drawer into the next would
  // be a way to enable a class of substances on a preset nobody was looking at.
  useEffect(() => {
    setStaged(new Set());
    setQuery("");
  }, [draft.key]);

  const enabled = useMemo(() => new Set(draft.enabledSlugs), [draft.enabledSlugs]);
  const results = useMemo(() => searchWarningBannerTargets(query, targets), [query, targets]);

  const pending = results.filter((result) => !enabled.has(result.slug));
  const stagedSlugs = [...staged].filter((slug) => !enabled.has(slug));
  const state = warningBannerPresetState(draft);
  const points = draft.points.map((point) => point.trim()).filter(Boolean);

  const keyValid = WARNING_BANNER_KEY_PATTERN.test(draft.key.trim());
  const overSlugBudget = draft.enabledSlugs.length > WARNING_BANNER_LIMITS.maxEnabledSlugs;
  const canWrite = keyValid && iconValid && !overSlugBudget && saveState !== "saving";

  /**
   * Every enablement button writes the whole draft, unsaved copy edits included:
   * one POST is the only write this tool has, and the alternative — persisting
   * the new slug list while quietly discarding the headline beside it — would
   * leave the drawer showing words the server never received. `canWrite` gates
   * these buttons on the same key and icon checks as Save for that reason.
   */
  const commit = (nextSlugs: string[], summary: string) => {
    setStaged(new Set());
    onCommitEnabledSlugs(draft, nextSlugs, summary);
  };

  return (
    <div className="space-y-7">
      {/* The one preview, full width, above the fields that feed it. The
          primitive owns the 44px glyph, the dark severity chip, and the
          one-point-paragraph / many-points-list branch. */}
      <EditorSection
        headingLevel="h3"
        icon="lucide:eye"
        title="Preview"
        description={state === "live" ? undefined : DIMMED_REASON[state]}
      >
        <SafetyBanner
          variant={draft.tone}
          icon={draft.icon}
          severityLabel={draft.severityLabel}
          dimmed={state !== "live"}
        >
          <SafetyBannerTitle>{draft.headline || "Untitled headline"}</SafetyBannerTitle>
          <SafetyBannerPoints points={points} />
        </SafetyBanner>
      </EditorSection>

      <EditorSection headingLevel="h3" icon="lucide:type" title="Words">
        {isNew ? (
          <EditorField
            label="Key"
            description="Lower-case, hyphens only. The stored identity and the name in the table; it cannot be changed later."
            error={
              draft.key.trim() && !keyValid
                ? "Keys look like opioid-respiratory — lower-case letters, digits and hyphens."
                : null
            }
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={draft.key}
                inputSize="sm"
                variant={draft.key.trim() && !keyValid ? "error" : "default"}
                spellCheck={false}
                className="font-mono"
                placeholder="opioid-respiratory"
                onChange={(event) => onDraftChange({ ...draft, key: event.target.value })}
              />
            )}
          </EditorField>
        ) : null}

        <EditorField
          label="Headline"
          counter={`${draft.headline.length}/${WARNING_BANNER_LIMITS.headlineMaxLength}`}
          error={
            draft.headline.length > WARNING_BANNER_LIMITS.headlineMaxLength
              ? `The headline is ${draft.headline.length} characters; the limit is ${WARNING_BANNER_LIMITS.headlineMaxLength}.`
              : null
          }
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={draft.headline}
              inputSize="sm"
              className="text-[15px]"
              placeholder="Opioids and benzodiazepines stop breathing together"
              onChange={(event) => onDraftChange({ ...draft, headline: event.target.value })}
            />
          )}
        </EditorField>

        <EditorField
          label="Mechanism"
          description="One per line. A single line renders as a paragraph; several render as a list. Adjectives are not warnings."
          counter={`${points.length}/${WARNING_BANNER_LIMITS.maxPoints}`}
          error={
            points.length > WARNING_BANNER_LIMITS.maxPoints
              ? `That is ${points.length} lines; the limit is ${WARNING_BANNER_LIMITS.maxPoints}.`
              : null
          }
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              rows={5}
              value={draft.points.join("\n")}
              className="max-w-[76ch]"
              placeholder={
                "Both depress the brainstem respiratory drive\nThe combined effect outlasts the euphoria"
              }
              onChange={(event) =>
                onDraftChange({ ...draft, points: event.target.value.split("\n") })
              }
            />
          )}
        </EditorField>

        <EditorFieldRow layout="twoColumn">
          <EditorField
            label="Severity label"
            counter={`${draft.severityLabel.length}/${WARNING_BANNER_LIMITS.severityLabelMaxLength}`}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={draft.severityLabel}
                inputSize="sm"
                maxLength={WARNING_BANNER_LIMITS.severityLabelMaxLength}
                placeholder="Danger"
                onChange={(event) =>
                  onDraftChange({ ...draft, severityLabel: event.target.value })
                }
              />
            )}
          </EditorField>

          <EditorField label="Tone">
            {(controlProps) => (
              <EditorSelect
                {...controlProps}
                selectSize="sm"
                value={draft.tone}
                options={WARNING_BANNER_TONES.map((tone) => ({ value: tone, label: tone }))}
                onChange={(event) =>
                  onDraftChange({ ...draft, tone: event.target.value as WarningBannerTone })
                }
              />
            )}
          </EditorField>
        </EditorFieldRow>

        <BannerIconField
          value={draft.icon}
          onChange={(icon) => onDraftChange({ ...draft, icon })}
          onValidityChange={onIconValidityChange}
        />

        <EditorToolbar variant="split">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!isDirty || !canWrite}
              onClick={onSave}
            >
              <Icon icon="lucide:save" size={15} />
              Save preset
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isDirty || saveState === "saving"}
              onClick={onDiscard}
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Discard changes
            </Button>
            {!isNew ? (
              <Button
                type="button"
                variant="ghostDestructive"
                size="sm"
                disabled={saveState === "saving"}
                onClick={() => onRequestDelete(draft)}
              >
                <Icon icon="lucide:trash-2" size={15} />
                Delete preset
              </Button>
            ) : null}
          </div>
          {saveState === "idle" ? (
            <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
              {isDirty ? "Unsaved changes" : "No changes"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={saveState} />
          )}
        </EditorToolbar>

        {!iconValid ? (
          <p className="theme-text-faint text-xs">
            Saving is blocked until the icon resolves — an unknown id renders no glyph, silently.
          </p>
        ) : null}
      </EditorSection>

      <EditorSection headingLevel="h3" icon="lucide:power" title="Where it shows">
        <EditorCheckbox
          checked={draft.enabled}
          label="Enabled"
          description="Off means this preset renders nowhere, whatever is on its list."
          onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
        />

        {/* One box for both jobs. Typing a drug name finds that drug; typing a
            class finds everything carrying it, and the helper ranks names
            first, so a specific substance is one search and one click. */}
        <EditorField label="Find substances">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={query}
              inputSize="sm"
              type="search"
              placeholder="diazepam, or opioid"
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </EditorField>

        <p className="theme-text-faint text-xs">
          {"Class strings are free-form: cocaine is an "}
          <span className="font-mono">Alkaloid (tropane)</span>
          {" and DXM is a "}
          <span className="font-mono">Morphinan (substituted)</span>
          {". Read before enabling."}
        </p>

        {/* A bordered scroll well, not a card inside a card, capped so the page
            keeps one scroll context (design brief §6). */}
        <Surface
          variant="subtle"
          padding="none"
          radius="lg"
          className="max-h-[40vh] overflow-y-auto"
        >
          {results.length === 0 ? (
            <p className="theme-text-faint p-3 text-sm">
              {query.trim().length < 2
                ? "Type a substance name or a class."
                : `Nothing matches “${query.trim()}”.`}
            </p>
          ) : (
            <ul className="divide-y divide-dose-divider">
              {results.map((result) => {
                const isEnabled = enabled.has(result.slug);
                return (
                  <li key={result.slug} className="flex items-start gap-2.5 px-3 py-2">
                    <EditorCheckbox
                      className="mt-0.5"
                      checked={isEnabled || staged.has(result.slug)}
                      disabled={isEnabled}
                      aria-label={`Stage ${result.slug}`}
                      onChange={(event) =>
                        setStaged((current) => {
                          const next = new Set(current);
                          if (event.target.checked) {
                            next.add(result.slug);
                          } else {
                            next.delete(result.slug);
                          }
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="theme-text-primary block truncate text-sm">
                        {result.title}
                      </span>
                      <span className="theme-text-faint block truncate font-mono text-[11px]">
                        {/* A name match is self-evident from the title above; a
                            class match has to print the string that hit or the
                            editor cannot judge it. */}
                        {result.kind === "class"
                          ? `${result.slug} · ${result.reason}`
                          : result.slug}
                      </span>
                    </span>
                    {isEnabled ? (
                      <EditorStatusPill tone="success">enabled</EditorStatusPill>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>

        <EditorToolbar>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={stagedSlugs.length === 0 || !canWrite}
            onClick={() =>
              commit(
                [...draft.enabledSlugs, ...stagedSlugs],
                `Enabled ${draft.key} on ${stagedSlugs.length} substance${stagedSlugs.length === 1 ? "" : "s"}.`,
              )
            }
          >
            {`Enable on ${stagedSlugs.length} substance${stagedSlugs.length === 1 ? "" : "s"}`}
          </Button>
          {/* The class-wide escape hatch, and the one-click path for a single
              named drug: a search that returns exactly one row names it on the
              button, so enabling diazepam never needs a tick first (§7). */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending.length === 0 || !canWrite}
            onClick={() =>
              commit(
                [...draft.enabledSlugs, ...pending.map((result) => result.slug)],
                `Enabled ${draft.key} on ${pending.length} substance${pending.length === 1 ? "" : "s"}.`,
              )
            }
          >
            {pending.length === 1
              ? `Enable on ${pending[0].title}`
              : `Enable on all ${pending.length} results`}
          </Button>
        </EditorToolbar>

        <div className="space-y-2">
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
            {`Enabled on ${draft.enabledSlugs.length} substance${draft.enabledSlugs.length === 1 ? "" : "s"}`}
          </p>
          {draft.enabledSlugs.length === 0 ? (
            <p className="theme-text-secondary text-sm">
              {draft.enabled
                ? "Enabled, but no substances selected — this renders nowhere."
                : "No substances selected."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.enabledSlugs.map((slug) => (
                <TagToken
                  key={slug}
                  variant="compact"
                  label={<span className="font-mono">{slug}</span>}
                  removeLabel={`Disable on ${slug}`}
                  onRemove={() =>
                    commit(
                      draft.enabledSlugs.filter((entry) => entry !== slug),
                      `Disabled ${draft.key} on ${slug}.`,
                    )
                  }
                />
              ))}
            </div>
          )}
          {overSlugBudget ? (
            <p className="text-dose-warning text-xs">
              {`${draft.enabledSlugs.length} substances is over the ${WARNING_BANNER_LIMITS.maxEnabledSlugs} limit. Remove some before saving.`}
            </p>
          ) : null}
          {draft.enabledSlugs.length > 0 ? (
            <Button
              type="button"
              variant="textLink"
              size="auto"
              onClick={() => onInspectCoverage(draft.enabledSlugs[0])}
            >
              {`See what a reader sees on ${draft.enabledSlugs[0]}`}
            </Button>
          ) : null}
        </div>
      </EditorSection>
    </div>
  );
}
