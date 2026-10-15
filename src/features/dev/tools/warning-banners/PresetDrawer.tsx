"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafetyBanner, SafetyBannerPoints, SafetyBannerTitle } from "@/components/ui/safety-banner";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  searchWarningBannerTargets,
  warningBannerPresetState,
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
} from "@/features/dev/components";
import { BannerIconField } from "./BannerIconField";
import { countNoun, TONE_LABEL } from "./bannerLabels";
import type { EnablementChange } from "./enablement";
import { presetDraftIssues } from "./presetDrafts";

const WHERE_IT_RENDERS: Record<Exclude<WarningBannerPresetState, "live">, string> = {
  dormant: "Enabled, but no substances selected. This renders nowhere yet.",
  off: "Switched off. This renders nowhere.",
};

const SITEWIDE_HINT_THRESHOLD = Math.ceil(WARNING_BANNER_LIMITS.maxEnabledSlugs / 2);

type PresetDrawerProps = {
  contextual?: boolean;
  draft: WarningBannerPreset;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  iconSize: number;
  targets: WarningBannerTarget[];
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRequestEnablement?: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onInspectCoverage?: (slug: string) => void;
  renderPreview?: (preview: DrawerPreview) => ReactNode;
};

export type DrawerPreview = {
  draft: WarningBannerPreset;
  slug: string | null;
  slugOptions: { slug: string; title: string }[];
  onSlugChange: (slug: string) => void;
};

export function PresetDrawer({
  contextual = false,
  draft,
  isNew,
  isDirty,
  saveState,
  iconValid,
  iconSize,
  targets,
  onIconValidityChange,
  onDraftChange,
  onSave,
  onDiscard,
  onRequestEnablement,
  onInspectCoverage,
  renderPreview,
}: PresetDrawerProps) {
  const [query, setQuery] = useState("");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const validationId = useId();

  useEffect(() => {
    setStaged(new Set());
  }, [draft.key, draft.enabledSlugs]);
  useEffect(() => {
    setQuery("");
    setPreviewSlug(null);
  }, [draft.key]);

  const titles = useMemo(
    () => new Map(targets.map((target) => [target.slug, target.title])),
    [targets],
  );
  const titleOf = (slug: string) => titles.get(slug) ?? slug;
  const previewOptions = useMemo(
    () =>
      !draft.allSubstances && draft.enabledSlugs.length > 0
        ? draft.enabledSlugs.map((slug) => ({ slug, title: titles.get(slug) ?? slug }))
        : targets.map((target) => ({ slug: target.slug, title: target.title })),
    [draft.allSubstances, draft.enabledSlugs, targets, titles],
  );
  const activePreviewSlug =
    previewSlug && previewOptions.some((option) => option.slug === previewSlug)
      ? previewSlug
      : (previewOptions[0]?.slug ?? null);

  const enabled = useMemo(() => new Set(draft.enabledSlugs), [draft.enabledSlugs]);
  const results = useMemo(() => searchWarningBannerTargets(query, targets), [query, targets]);

  const pending = results.filter((result) => !enabled.has(result.slug));
  const stagedSlugs = [...staged].filter((slug) => !enabled.has(slug));
  const state = warningBannerPresetState(draft);
  const points = draft.points.map((point) => point.trim()).filter(Boolean);

  const { keyValid, headlineError, pointsError, severityError, overSlugBudget, contentInvalid } =
    presetDraftIssues(draft);
  const longList =
    !draft.allSubstances && draft.enabledSlugs.length >= SITEWIDE_HINT_THRESHOLD;
  const canWrite = keyValid && iconValid && !overSlugBudget && saveState !== "saving" && !contentInvalid;

  const canChangeScope = saveState !== "saving";
  const readerSlug =
    activePreviewSlug && draft.enabledSlugs.includes(activePreviewSlug)
      ? activePreviewSlug
      : (draft.enabledSlugs[0] ?? "");
  const request = (change: EnablementChange) => onRequestEnablement?.(draft, change);

  return (
    <div className="space-y-9">
      <EditorSection
        headingLevel="h3"
        icon="lucide:eye"
        title="Preview"
        description={state === "live" ? undefined : WHERE_IT_RENDERS[state]}
      >
        {renderPreview ? (
          renderPreview({
            draft,
            slug: activePreviewSlug,
            slugOptions: previewOptions,
            onSlugChange: setPreviewSlug,
          })
        ) : (
          <SafetyBanner variant={draft.tone} icon={draft.icon} iconSize={iconSize}>
            <SafetyBannerTitle severityLabel={draft.severityLabel} tone={draft.tone}>
              {draft.headline || "Untitled headline"}
            </SafetyBannerTitle>
            <SafetyBannerPoints points={points} />
          </SafetyBanner>
        )}
      </EditorSection>

      <EditorSection
        headingLevel="h3"
        icon="lucide:type"
        title="Words"
        description={contextual ? undefined : "What a reader reads. These publish with Publish preset."}
      >
        {isNew ? (
          <EditorField
            label="Key"
            description="Lower-case letters, digits and hyphens. It names the preset in every list and cannot be changed later."
            error={
              draft.key.trim() && !keyValid
                ? "Keys look like opioid-respiratory: lower-case letters, digits and hyphens."
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
                autoCapitalize="none"
                autoCorrect="off"
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
          error={headlineError}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={draft.headline}
              inputSize="sm"
              placeholder="Opioids and benzodiazepines stop breathing together"
              onChange={(event) => onDraftChange({ ...draft, headline: event.target.value })}
            />
          )}
        </EditorField>

        <EditorField
          label="Points"
          description="One per line; start a line with - or * for a bullet. Say what happens and what to do, not how bad it is."
          counter={`${points.length}/${WARNING_BANNER_LIMITS.maxPoints}`}
          error={pointsError}
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
            description={
              draft.severityLabel.trim() && draft.severityLabel.trim().toLowerCase() !== draft.tone
                ? `The word on the banner's chip. Readers see \u201c${draft.severityLabel.trim()}\u201d on a ${draft.tone} banner; the tone sets the colour and the order.`
                : "The word on the banner's chip."
            }
            counter={`${draft.severityLabel.length}/${WARNING_BANNER_LIMITS.severityLabelMaxLength}`}
            error={severityError}
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

          <EditorField label="Tone" description="The banner's colour, and its place in the stack.">
            {(controlProps) => (
              <EditorSelect
                {...controlProps}
                selectSize="sm"
                value={draft.tone}
                options={WARNING_BANNER_TONES.map((tone) => ({ value: tone, label: TONE_LABEL[tone] }))}
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

        {contextual ? (
          <>
            <p className="theme-text-secondary text-sm">
              Shared wording · {draft.allSubstances ? "all current and future substance articles" : `${draft.enabledSlugs.length} assigned article${draft.enabledSlugs.length === 1 ? "" : "s"}`} · dose.wiki and Effect Index.
              {!draft.enabled ? " This preset remains disabled." : null}
            </p>
            {contentInvalid ? (
              <p id={validationId} role="status" className="text-dose-danger text-sm">
                Fix the highlighted fields before publishing. Your local changes are kept.
              </p>
            ) : null}

            <EditorToolbar variant="split">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={!isDirty || !canWrite}
                  aria-describedby={contentInvalid ? validationId : undefined}
                  onClick={onSave}
                >
                  <Icon icon="lucide:save" size={15} />
                  Review
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
              </div>
              {saveState === "idle" || (saveState === "saved" && isDirty) ? (
                <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
                  {isDirty ? "Unsaved changes" : "No changes"}
                </EditorStatusPill>
              ) : (
                <EditorActionStatus status={saveState} />
              )}
            </EditorToolbar>

            {!iconValid ? (
              <p className="theme-text-faint text-xs">
                Saving is blocked until the icon resolves. An unknown id renders no glyph, silently.
              </p>
            ) : null}
          </>
        ) : null}
      </EditorSection>

      {!contextual ? (
        <EditorSection
          headingLevel="h3"
          icon="lucide:power"
          title="Where it shows"
          description={
            isNew
              ? "Everything here publishes with the new preset."
              : "The switches publish with the preset. A substance added or removed goes live on its own once you confirm, and leaves unsaved words as a draft."
          }
        >
          <div className="space-y-3">
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="type-meta-label theme-text-faint">Switches</span>
              <span className="theme-text-muted text-xs">Publish with the preset</span>
            </p>
            <EditorCheckbox
              checked={draft.enabled}
              label="Enabled"
              description="Off means this preset renders nowhere, whatever is on its list."
              onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
            />

            <EditorCheckbox
              checked={draft.allSubstances}
              label="All substance articles"
              description="Sitewide: every current article, and every article published later."
              onChange={(event) =>
                onDraftChange({ ...draft, allSubstances: event.target.checked })
              }
            />
          </div>

          {draft.allSubstances ? (
            <Surface variant="subtle" padding="sm" radius="lg">
              <p className="theme-text-secondary text-sm">
                {draft.enabled
                  ? "Shows on every substance article, including ones published later. "
                  : "Once switched on, this shows on every substance article. "}
                The list below is kept for later but does not limit where it shows.
              </p>
            </Surface>
          ) : null}

          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-2">
            <span className="type-meta-label theme-text-faint">Substances</span>
            <span className="theme-text-muted text-xs">
              {isNew ? "Publish with the new preset" : "Each change goes live when you confirm it"}
            </span>
          </p>
          <fieldset className="min-w-0 space-y-3">
            <legend className="theme-text-primary mb-1 text-sm font-medium">
              {draft.allSubstances
                ? "Substance list (kept, not in use while sitewide)"
                : `Enabled on ${countNoun(draft.enabledSlugs.length, "substance")}`}
            </legend>

            {draft.enabledSlugs.length === 0 ? (
              <p className="theme-text-muted text-sm">
                {draft.allSubstances
                  ? "No saved list. None is needed while it is sitewide."
                  : draft.enabled
                    ? "Enabled, but no substances selected. This renders nowhere."
                    : "No substances selected."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {draft.enabledSlugs.map((slug) => (
                  <TagToken
                    key={slug}
                    variant="compact"
                    removeTone="danger"
                    label={titles.has(slug) ? titleOf(slug) : <span className="font-mono">{slug}</span>}
                    removeLabel={`Disable on ${titleOf(slug)}`}
                    onRemove={() => request({ action: "disable", slugs: [slug] })}
                  />
                ))}
              </div>
            )}
            {overSlugBudget ? (
              <p className="text-dose-warning text-sm">
                {`${draft.enabledSlugs.length} substances is over the ${WARNING_BANNER_LIMITS.maxEnabledSlugs} limit. Remove some before saving, or tick All substance articles if this banner belongs everywhere.`}
              </p>
            ) : longList ? (
              <p className="theme-text-secondary text-sm">
                {`${draft.enabledSlugs.length} substances is a long list. If this banner belongs on every article, tick All substance articles instead of splitting the list across presets; it also covers articles published later.`}
              </p>
            ) : null}
            {draft.enabledSlugs.length > 0 ? (
              <Button
                type="button"
                variant="textLink"
                size="auto"
                className="theme-accent-underline underline-offset-4 [@media(pointer:coarse)]:min-h-11"
                onClick={() => onInspectCoverage?.(readerSlug)}
              >
                {`See what a reader sees on ${titleOf(readerSlug)}`}
                <Icon icon="lucide:arrow-right" size={14} />
              </Button>
            ) : null}
          </fieldset>

          {!draft.allSubstances ? (
            <div className="space-y-2.5">
              <EditorField
                label="Find substances"
                description={
                  <>
                    {"By name or class. Classes are free text (cocaine is an "}
                    <span className="font-mono">Alkaloid (tropane)</span>
                    {"), so read the list before enabling."}
                  </>
                }
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={query}
                    inputSize="sm"
                    type="search"
                    data-banner-search=""
                    aria-keyshortcuts="/"
                    placeholder="diazepam, or opioid"
                    disabled={draft.allSubstances}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </EditorField>

              {query.trim().length >= 2 || results.length > 0 ? (
                <Surface
                  variant="subtle"
                  padding="none"
                  radius="lg"
                  className="max-h-[40vh] overflow-y-auto"
                >
                  {results.length === 0 ? (
                    <p className="theme-text-muted p-3 text-sm">
                      {targets.length === 0
                        ? "The substance list has not loaded yet."
                        : `Nothing matches “${query.trim()}”. Try a shorter name or a class.`}
                    </p>
                  ) : (
                    <div className="divide-y divide-dose-divider">
                      {([
                        ["name", "Name matches"],
                        ["class", "Class matches, read before enabling"],
                      ] as const).map(([kind, heading]) => {
                        const group = results.filter((result) => result.kind === kind);
                        if (group.length === 0) return null;
                        return (
                          <div key={kind} role="group" aria-label={heading}>
                            <p className="type-meta-label theme-text-faint px-3 pb-1 pt-2.5">{`${heading} (${group.length})`}</p>
                            <ul className="divide-y divide-dose-divider">
                              {group.map((result) => {
                                const isEnabled = enabled.has(result.slug);
                                return (
                                  <li key={result.slug}>
                                    <label
                                      className={cn(
                                        "flex items-start gap-2.5 px-3 py-2 [@media(pointer:coarse)]:py-3",
                                        isEnabled ? "cursor-default" : "cursor-pointer",
                                      )}
                                    >
                                      <EditorCheckbox
                                        className="mt-0.5"
                                        checked={isEnabled || staged.has(result.slug)}
                                        disabled={isEnabled}
                                        aria-label={`Select ${result.title || result.slug}`}
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
                                        <span className="theme-text-faint block truncate font-mono text-xs">
                                          {result.kind === "class"
                                            ? `${result.slug} · ${result.reason}`
                                            : result.slug}
                                        </span>
                                      </span>
                                      {isEnabled ? (
                                        <EditorStatusPill inline tone="success">Enabled</EditorStatusPill>
                                      ) : null}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Surface>
              ) : targets.length === 0 && !draft.allSubstances ? (
                <p className="theme-text-muted text-sm">Loading the substance list.</p>
              ) : null}

              {pending.length > 0 ? (
                <EditorToolbar>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      draft.allSubstances || stagedSlugs.length === 0 || overSlugBudget || !canChangeScope
                    }
                    onClick={() => request({ action: "enable", slugs: stagedSlugs })}
                  >
                    <Icon icon="lucide:plus" size={15} />
                    {`Enable on ${countNoun(stagedSlugs.length, "substance")}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      draft.allSubstances || pending.length === 0 || overSlugBudget || !canChangeScope
                    }
                    onClick={() =>
                      request({ action: "enable", slugs: pending.map((result) => result.slug) })
                    }
                  >
                    {pending.length === 1
                      ? `Enable on ${pending[0].title}`
                      : `Enable on all ${pending.length} results`}
                  </Button>
                </EditorToolbar>
              ) : null}
            </div>
          ) : null}
        </EditorSection>
      ) : null}
    </div>
  );
}
