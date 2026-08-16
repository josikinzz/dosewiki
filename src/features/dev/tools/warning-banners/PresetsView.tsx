"use client";

/**
 * Presets — the authoring and enablement surface (design brief §3, view 1).
 *
 * Table-led on purpose: `Status` and `Enabled on` are readable for every preset
 * without a click, because "what does a reader see right now?" is the question
 * this tool exists to answer, and the prose is the least urgent thing on it. One
 * row at a time expands into a drawer; editing two presets at once is not a real
 * workflow and would double the unsaved-state surface.
 */

import { Fragment, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SafetyBanner,
  SafetyBannerLinks,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  matcherHits,
  normalizeMatchers,
  substanceClassTokens,
  warningBannerPresetState,
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
  WARNING_BANNER_LINK_SECTIONS,
  WARNING_BANNER_SECTION_LABELS,
  WARNING_BANNER_TONES,
  type WarningBannerLinkSection,
  type WarningBannerPreset,
  type WarningBannerPresetState,
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
import type { WarningBannerTarget } from "./warningBannerTargets";

/**
 * System A — enablement state. Grey for `off` because off is the correct
 * default and colouring it red would train an editor that the safe state looks
 * broken; green appears here and nowhere else in the tool (design brief §5).
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

/**
 * System B — banner severity. Confined to the tone chip and the preview: a rose
 * chip must always mean "this banner is about a severe risk" and never
 * "something is wrong with this row" (design brief §5).
 */
const TONE_BADGE_CLASS: Record<WarningBannerTone, string> = {
  danger: "theme-interaction-severity-badge-danger",
  unsafe: "theme-interaction-severity-badge-unsafe",
  caution: "theme-interaction-severity-badge-caution",
};

const HEADER_CELL_CLASS =
  "theme-text-faint px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]";

const COUNT_CELL_CLASS = "theme-text-secondary px-3 py-2.5 text-sm tabular-nums";

type Candidate = { slug: string; title: string; hits: string[] };

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
  /**
   * Class tokens are derived once for the whole corpus rather than per preset:
   * every preset's candidate count re-reads the same 577 rows, and the token
   * work is the expensive half.
   */
  const targetTokens = useMemo(
    () =>
      targets.map((target) => ({
        slug: target.slug,
        title: target.title,
        tokens: substanceClassTokens({
          psychoactiveClasses: target.psychoactiveClasses,
          chemicalClasses: target.chemicalClasses,
          indexCategories: target.indexCategories,
        }),
      })),
    [targets],
  );

  const candidateCountByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const preset of presets) {
      let total = 0;
      for (const target of targetTokens) {
        if (matcherHits(preset, target.tokens).length > 0) {
          total += 1;
        }
      }
      counts[preset.key] = total;
    }
    return counts;
  }, [presets, targetTokens]);

  return (
    <div className="space-y-5">
      <EditorToolbar variant="split">
        <p className="theme-text-faint text-sm">
          {presets.length === 0
            ? "No presets yet. A preset holds the words a reader sees; enabling it is a separate, later decision."
            : "Status and Enabled on are the columns this view exists for. Open a row to edit its words."}
        </p>
        <Button type="button" variant="accent" size="sm" onClick={onCreate}>
          <Icon icon="lucide:plus" size={15} />
          New preset
        </Button>
      </EditorToolbar>

      {isNew && draft ? (
        <PresetDrawer
          draft={draft}
          isNew
          isDirty={isDirty}
          saveState={saveState}
          iconValid={iconValid}
          targetTokens={targetTokens}
          onIconValidityChange={onIconValidityChange}
          onDraftChange={onDraftChange}
          onSave={onSave}
          onDiscard={onDiscard}
          onCommitEnabledSlugs={onCommitEnabledSlugs}
          onRequestDelete={onRequestDelete}
          onInspectCoverage={onInspectCoverage}
        />
      ) : null}

      {presets.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-dose-border">
          <table className="w-full min-w-[54rem] border-collapse text-left">
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
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Candidates
                </th>
                <th scope="col" className={HEADER_CELL_CLASS}>
                  Links
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
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate text-sm font-medium",
                                open ? "theme-accent-heading" : "theme-text-primary",
                              )}
                            >
                              {preset.label || "Untitled preset"}
                            </span>
                            <span className="theme-text-faint block truncate font-mono text-xs">
                              {preset.key}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
                            TONE_BADGE_CLASS[preset.tone],
                          )}
                        >
                          {preset.tone}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <EditorStatusPill tone={STATE_PILL_TONE[state]}>
                          {STATE_LABEL[state]}
                        </EditorStatusPill>
                      </td>
                      <td className={COUNT_CELL_CLASS}>{preset.enabledSlugs.length}</td>
                      <td className={COUNT_CELL_CLASS}>{candidateCountByKey[preset.key] ?? 0}</td>
                      <td className={COUNT_CELL_CLASS}>{preset.links.length}</td>
                    </tr>
                    {open && draft ? (
                      <tr className="border-b border-dose-border last:border-0">
                        <td colSpan={6} className="p-3">
                          <PresetDrawer
                            draft={draft}
                            isNew={false}
                            isDirty={isDirty}
                            saveState={saveState}
                            iconValid={iconValid}
                            targetTokens={targetTokens}
                            onIconValidityChange={onIconValidityChange}
                            onDraftChange={onDraftChange}
                            onSave={onSave}
                            onDiscard={onDiscard}
                            onCommitEnabledSlugs={onCommitEnabledSlugs}
                            onRequestDelete={onRequestDelete}
                            onInspectCoverage={onInspectCoverage}
                          />
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

type TargetTokens = { slug: string; title: string; tokens: string[] };

type PresetDrawerProps = {
  draft: WarningBannerPreset;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  targetTokens: TargetTokens[];
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
  targetTokens,
  onIconValidityChange,
  onDraftChange,
  onSave,
  onDiscard,
  onCommitEnabledSlugs,
  onRequestDelete,
  onInspectCoverage,
}: PresetDrawerProps) {
  const [matcherInput, setMatcherInput] = useState("");
  const [staged, setStaged] = useState<Set<string>>(new Set());

  // Staging is per preset: carrying ticks from one drawer into the next would
  // be a way to enable a class of substances on a preset nobody was looking at.
  useEffect(() => {
    setStaged(new Set());
    setMatcherInput("");
  }, [draft.key]);

  const enabled = useMemo(() => new Set(draft.enabledSlugs), [draft.enabledSlugs]);

  const candidates = useMemo(() => {
    const rows: Candidate[] = [];
    for (const target of targetTokens) {
      const hits = matcherHits(draft, target.tokens);
      if (hits.length > 0) {
        rows.push({ slug: target.slug, title: target.title, hits });
      }
    }
    return rows;
  }, [draft, targetTokens]);

  const unapplied = candidates.filter((candidate) => !enabled.has(candidate.slug));
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

  // 2-column at ~1180px, stacked below: the copy editor needs its 76ch and the
  // preview needs the banner's real width, and 1180 is where both fit (design
  // brief §6).
  return (
    <div className="grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-4">
        {isNew ? (
          <EditorField
            label="Key"
            description="Lower-case, hyphens only. This is the stored identity and cannot be changed later."
            error={
              draft.key.trim() && !keyValid
                ? "Keys look like opioid-respiratory — lower-case letters, digits and hyphens, starting with a letter or digit."
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

        <EditorFieldRow layout="twoColumn">
          <EditorField
            label="Studio name"
            description="Never rendered publicly — this is how the preset reads in the table above."
            counter={`${draft.label.length}/${WARNING_BANNER_LIMITS.labelMaxLength}`}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={draft.label}
                inputSize="sm"
                maxLength={WARNING_BANNER_LIMITS.labelMaxLength}
                placeholder="Opioid respiratory depression"
                onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
              />
            )}
          </EditorField>

          <EditorField
            label="Severity label"
            description="The gutter word. Rendered uppercase, so type it in sentence case."
            counter={`${draft.severityLabel.length}/${WARNING_BANNER_LIMITS.severityLabelMaxLength}`}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={draft.severityLabel}
                inputSize="sm"
                maxLength={WARNING_BANNER_LIMITS.severityLabelMaxLength}
                placeholder="Fatal combination"
                onChange={(event) =>
                  onDraftChange({ ...draft, severityLabel: event.target.value })
                }
              />
            )}
          </EditorField>
        </EditorFieldRow>

        <EditorField
          label="Headline"
          description="The loudest sentence on the article."
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
          label="Mechanism points"
          description="One mechanism per line. Adjectives are not warnings."
          counter={`${points.length}/${WARNING_BANNER_LIMITS.maxPoints} points`}
          error={
            points.length > WARNING_BANNER_LIMITS.maxPoints
              ? `That is ${points.length} points; the limit is ${WARNING_BANNER_LIMITS.maxPoints}.`
              : null
          }
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              rows={6}
              value={draft.points.join("\n")}
              className="max-w-[76ch]"
              placeholder={"Both depress the brainstem respiratory drive\nOnset of the combined effect outlasts the euphoria"}
              onChange={(event) =>
                onDraftChange({ ...draft, points: event.target.value.split("\n") })
              }
            />
          )}
        </EditorField>

        <EditorFieldRow layout="twoColumn">
          <EditorField label="Tone" description="Drives colour, never wording.">
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

          <EditorField
            label="Priority"
            description="Higher sorts first within a tone, and decides which banner the 2-banner cap keeps."
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="number"
                inputSize="sm"
                className="tabular-nums"
                value={String(draft.priority)}
                onChange={(event) =>
                  onDraftChange({ ...draft, priority: Number(event.target.value) || 0 })
                }
              />
            )}
          </EditorField>
        </EditorFieldRow>

        <BannerIconField
          value={draft.icon}
          tone={draft.tone}
          severityLabel={draft.severityLabel}
          onChange={(icon) => onDraftChange({ ...draft, icon })}
          onValidityChange={onIconValidityChange}
        />

        <EditorField
          label="Link chips"
          description="The label is yours to write; the target stays constrained to sections an article actually renders, so a chip can never scroll nowhere."
          counter={`${draft.links.length}/${WARNING_BANNER_LIMITS.maxLinks}`}
        >
          <div className="space-y-2">
            {draft.links.map((link, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  value={link.label}
                  inputSize="sm"
                  maxLength={WARNING_BANNER_LIMITS.linkLabelMaxLength}
                  aria-label={`Chip label for the ${link.sectionId} section`}
                  placeholder={WARNING_BANNER_SECTION_LABELS[link.sectionId]}
                  className="min-w-[12rem] flex-1"
                  onChange={(event) => {
                    const links = [...draft.links];
                    links[index] = { ...link, label: event.target.value };
                    onDraftChange({ ...draft, links });
                  }}
                />
                <EditorSelect
                  selectSize="sm"
                  value={link.sectionId}
                  aria-label={`Scroll target for “${link.label || WARNING_BANNER_SECTION_LABELS[link.sectionId]}”`}
                  className="w-auto"
                  options={WARNING_BANNER_LINK_SECTIONS.map((section) => ({
                    value: section,
                    label: `#${section}`,
                  }))}
                  onChange={(event) => {
                    const links = [...draft.links];
                    links[index] = {
                      ...link,
                      sectionId: event.target.value as WarningBannerLinkSection,
                    };
                    onDraftChange({ ...draft, links });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      links: draft.links.filter((_, position) => position !== index),
                    })
                  }
                >
                  <Icon icon="lucide:trash-2" size={15} />
                </Button>
              </div>
            ))}
            {draft.links.length < WARNING_BANNER_LIMITS.maxLinks ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const taken = draft.links.map((link) => link.sectionId);
                  const section =
                    WARNING_BANNER_LINK_SECTIONS.find((entry) => !taken.includes(entry)) ??
                    WARNING_BANNER_LINK_SECTIONS[0];
                  onDraftChange({
                    ...draft,
                    links: [
                      ...draft.links,
                      { label: WARNING_BANNER_SECTION_LABELS[section], sectionId: section },
                    ],
                  });
                }}
              >
                <Icon icon="lucide:plus" size={15} />
                Add link
              </Button>
            ) : null}
          </div>
        </EditorField>

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
            Saving is blocked until the icon resolves — an unknown id renders no glyph at all, and
            nothing on the page would say so.
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        <EditorSection
          headingLevel="h3"
          icon="lucide:eye"
          title="Preview"
          description={
            state === "live"
              ? "This is what a reader sees on every substance below."
              : "Dimmed because no reader can reach it — this is what it would look like."
          }
        >
          <SafetyBanner
            variant={draft.tone}
            icon={draft.icon}
            severityLabel={draft.severityLabel}
            dimmed={state !== "live"}
          >
            <SafetyBannerTitle>{draft.headline || "Untitled headline"}</SafetyBannerTitle>
            <SafetyBannerPoints points={points} />
            <SafetyBannerLinks links={draft.links} />
          </SafetyBanner>
        </EditorSection>

        <EditorSection headingLevel="h3" icon="lucide:power" title="Enablement">
          <EditorCheckbox
            checked={draft.enabled}
            label="Enabled"
            description="Off means this preset renders nowhere, whatever is on its list below."
            onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
          />

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
                        `Disabled “${draft.label || draft.key}” on ${slug}.`,
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
          </div>
        </EditorSection>

        <EditorSection
          headingLevel="h3"
          icon="lucide:search"
          title="Candidate finder"
          description="Suggestions from class strings. These never affect the public site until you enable them."
        >
          <p className="theme-text-faint text-xs">
            {"Class strings are free-form: cocaine is an "}
            <span className="font-mono">Alkaloid (tropane)</span>
            {" and DXM is a "}
            <span className="font-mono">Morphinan (substituted)</span>
            {". Read before enabling."}
          </p>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {draft.candidateMatchers.map((matcher) => (
                <TagToken
                  key={matcher}
                  variant="compact"
                  label={<span className="font-mono">{matcher}</span>}
                  removeLabel={`Remove matcher ${matcher}`}
                  onRemove={() =>
                    onDraftChange({
                      ...draft,
                      candidateMatchers: draft.candidateMatchers.filter(
                        (entry) => entry !== matcher,
                      ),
                    })
                  }
                />
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = normalizeMatchers([...draft.candidateMatchers, matcherInput]);
                if (next.length > WARNING_BANNER_LIMITS.maxMatchers) {
                  return;
                }
                setMatcherInput("");
                onDraftChange({ ...draft, candidateMatchers: next });
              }}
            >
              <Input
                value={matcherInput}
                inputSize="sm"
                maxLength={WARNING_BANNER_LIMITS.matcherMaxLength}
                aria-label="Add a class matcher"
                placeholder="opioid"
                className="font-mono"
                onChange={(event) => setMatcherInput(event.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={!matcherInput.trim()}>
                Add matcher
              </Button>
            </form>
          </div>

          {/* A bordered scroll well, not a card inside a card, capped so the page
              keeps one scroll context (design brief §6). */}
          <Surface
            variant="subtle"
            padding="none"
            radius="lg"
            className="max-h-[40vh] overflow-y-auto"
          >
            {candidates.length === 0 ? (
              <p className="theme-text-faint p-3 text-sm">
                {draft.candidateMatchers.length === 0
                  ? "Add a matcher to see which substances it suggests."
                  : "No substance's class strings match these matchers."}
              </p>
            ) : (
              <ul className="divide-y divide-dose-divider">
                {candidates.map((candidate) => {
                  const isEnabled = enabled.has(candidate.slug);
                  return (
                    <li key={candidate.slug} className="flex items-start gap-2.5 px-3 py-2">
                      <EditorCheckbox
                        checked={isEnabled || staged.has(candidate.slug)}
                        disabled={isEnabled}
                        aria-label={`Stage ${candidate.slug}`}
                        onChange={(event) =>
                          setStaged((current) => {
                            const next = new Set(current);
                            if (event.target.checked) {
                              next.add(candidate.slug);
                            } else {
                              next.delete(candidate.slug);
                            }
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block truncate font-mono text-xs">
                          {candidate.slug}
                        </span>
                        <span className="theme-text-faint block truncate font-mono text-[11px]">
                          {candidate.hits.map((hit) => `matcher ${hit}`).join(" · ")}
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
                  `Enabled “${draft.label || draft.key}” on ${stagedSlugs.length} substance${stagedSlugs.length === 1 ? "" : "s"}.`,
                )
              }
            >
              {`Enable on ${stagedSlugs.length} substance${stagedSlugs.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={unapplied.length === 0 || !canWrite}
              onClick={() =>
                commit(
                  [...draft.enabledSlugs, ...unapplied.map((candidate) => candidate.slug)],
                  `Enabled “${draft.label || draft.key}” on all ${unapplied.length} candidates.`,
                )
              }
            >
              {`Enable all ${unapplied.length} candidates`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={draft.enabledSlugs.length === 0 || !canWrite}
              onClick={() =>
                commit([], `Disabled “${draft.label || draft.key}” everywhere.`)
              }
            >
              Disable all
            </Button>
          </EditorToolbar>

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
        </EditorSection>
      </div>
    </div>
  );
}
