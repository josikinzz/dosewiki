"use client";

import { useEffect, useId, useMemo, useState } from "react";

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
} from "@/features/dev/components";
import { BannerIconField } from "./BannerIconField";
import type { EnablementChange } from "./enablement";

/**
 * Says where a preset renders, in words. The preview itself is never faded:
 * the state belongs in a sentence and a status pill, not in the legibility of
 * the thing being previewed.
 */
const WHERE_IT_RENDERS: Record<Exclude<WarningBannerPresetState, "live">, string> = {
  dormant: "Enabled, but no substances selected. This renders nowhere yet.",
  off: "Switched off. This renders nowhere.",
};

/**
 * Half the per-preset cap. A list this long is usually a sitewide banner being
 * built by hand, and the cap will force it to be split into copies that then
 * drift apart; the drawer points at the checkbox before that happens.
 */
const SITEWIDE_HINT_THRESHOLD = Math.ceil(WARNING_BANNER_LIMITS.maxEnabledSlugs / 2);

type PresetDrawerProps = {
  /** Contextual copy editing deliberately excludes coverage and deletion. */
  contextual?: boolean;
  draft: WarningBannerPreset;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  iconValid: boolean;
  /** Read-only here: the size is edited once, in the global toolbar above. */
  iconSize: number;
  targets: WarningBannerTarget[];
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRequestEnablement?: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onRequestDelete?: (preset: WarningBannerPreset) => void;
  onInspectCoverage?: (slug: string) => void;
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
  onRequestDelete,
  onInspectCoverage,
}: PresetDrawerProps) {
  const [query, setQuery] = useState("");
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const validationId = useId();

  // Staging is per preset: carrying ticks from one drawer into the next would
  // be a way to enable a class of substances on a preset nobody was looking at.
  // It also clears once a write lands, which is the only way `enabledSlugs`
  // changes identity, so a cancelled dialog keeps the ticks and a confirmed one
  // does not leave them behind as ghosts.
  useEffect(() => {
    setStaged(new Set());
  }, [draft.key, draft.enabledSlugs]);
  useEffect(() => {
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
  const longList =
    !draft.allSubstances && draft.enabledSlugs.length >= SITEWIDE_HINT_THRESHOLD;
  const headlineError = draft.headline.length > WARNING_BANNER_LIMITS.headlineMaxLength
    ? `The headline is ${draft.headline.length} characters; the limit is ${WARNING_BANNER_LIMITS.headlineMaxLength}.`
    : contextual && !draft.headline.trim() ? "Add a headline before publishing." : null;
  const pointsError = points.length > WARNING_BANNER_LIMITS.maxPoints
    ? `That is ${points.length} lines; the limit is ${WARNING_BANNER_LIMITS.maxPoints}.`
    : contextual && points.some((point) => point.length > WARNING_BANNER_LIMITS.pointMaxLength)
      ? `Shorten each line to ${WARNING_BANNER_LIMITS.pointMaxLength} characters or fewer.` : null;
  const severityError = contextual && !draft.severityLabel.trim()
    ? "Add a severity label before publishing."
    : contextual && draft.severityLabel.length > WARNING_BANNER_LIMITS.severityLabelMaxLength
      ? `Shorten the severity label to ${WARNING_BANNER_LIMITS.severityLabelMaxLength} characters or fewer.` : null;
  const contentInvalid = Boolean(headlineError || pointsError || severityError);
  const canWrite = keyValid && iconValid && !overSlugBudget && saveState !== "saving" && (!contextual || !contentInvalid);

  /**
   * Every enablement button writes the whole draft, unsaved copy edits included:
   * one POST is the only write this tool has, and the alternative, persisting
   * the new slug list while quietly discarding the headline beside it, would
   * leave the drawer showing words the server never received. `canWrite` gates
   * these buttons on the same key and icon checks as Save for that reason. The
   * controller confirms before it writes.
   */
  const request = (change: EnablementChange) => onRequestEnablement?.(draft, change);

  return (
    <div className="space-y-7">
      {/* The one preview, full width, above the fields that feed it. It renders
          at the saved global glyph size so the preview and a live article cannot
          disagree; the primitive owns the dark severity chip and the markdown
          list rule.

          Never dimmed. An earlier pass faded a preset that was enabled nowhere,
          reasoning that a full-strength preview of an invisible banner overstates
          the state of the site. In practice it just made the thing an editor is
          trying to look at harder to see. The status pill in the table and the
          line under this heading already say where it renders. */}
      <EditorSection
        headingLevel="h3"
        icon="lucide:eye"
        title="Preview"
        description={state === "live" ? undefined : WHERE_IT_RENDERS[state]}
      >
        <SafetyBanner variant={draft.tone} icon={draft.icon} iconSize={iconSize}>
          <SafetyBannerTitle severityLabel={draft.severityLabel} tone={draft.tone}>
            {draft.headline || "Untitled headline"}
          </SafetyBannerTitle>
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
              className={contextual ? undefined : "text-[15px]"}
              placeholder="Opioids and benzodiazepines stop breathing together"
              onChange={(event) => onDraftChange({ ...draft, headline: event.target.value })}
            />
          )}
        </EditorField>

        <EditorField
          label="Mechanism"
          description="One per line. Lines are paragraphs; start a line with - or * to make it a bullet. Adjectives are not warnings."
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

        {contextual ? (
          <p className="theme-text-secondary text-sm">
            Shared wording · {draft.allSubstances ? "all current and future substance articles" : `${draft.enabledSlugs.length} assigned article${draft.enabledSlugs.length === 1 ? "" : "s"}`} · dose.wiki and Effect Index.
            {!draft.enabled ? " This preset remains disabled." : null}
          </p>
        ) : null}
        {contextual && contentInvalid ? (
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
              aria-describedby={contextual && contentInvalid ? validationId : undefined}
              onClick={onSave}
            >
              <Icon icon="lucide:save" size={15} />
              {contextual ? "Publish shared preset" : "Publish preset"}
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
            {!isNew && !contextual && onRequestDelete ? (
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
            Saving is blocked until the icon resolves. An unknown id renders no glyph, silently.
          </p>
        ) : null}
      </EditorSection>

      {!contextual ? <EditorSection headingLevel="h3" icon="lucide:power" title="Where it shows">
        <EditorCheckbox
          checked={draft.enabled}
          label="Enabled"
          description="Off means this preset renders nowhere, whatever is on its list."
          onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
        />

        <EditorCheckbox
          checked={draft.allSubstances}
          label="All substance articles"
          description="Sitewide scope includes every current article and automatically includes articles published later."
          onChange={(event) =>
            onDraftChange({ ...draft, allSubstances: event.target.checked })
          }
        />

        {draft.allSubstances ? (
          <Surface variant="subtle" padding="sm" radius="lg">
            <p className="theme-text-secondary text-sm">
              This preset applies to every substance article. The individual list below is retained
              for later use but does not limit sitewide scope.
            </p>
          </Surface>
        ) : null}

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
              disabled={draft.allSubstances}
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
            disabled={draft.allSubstances || stagedSlugs.length === 0 || !canWrite}
            onClick={() => request({ action: "enable", slugs: stagedSlugs })}
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
            disabled={draft.allSubstances || pending.length === 0 || !canWrite}
            onClick={() =>
              request({ action: "enable", slugs: pending.map((result) => result.slug) })
            }
          >
            {pending.length === 1
              ? `Enable on ${pending[0].title}`
              : `Enable on all ${pending.length} results`}
          </Button>
        </EditorToolbar>

        <div className="space-y-2">
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
            {draft.allSubstances
              ? "Sitewide · all substance articles"
              : `Enabled on ${draft.enabledSlugs.length} substance${draft.enabledSlugs.length === 1 ? "" : "s"}`}
          </p>
          {draft.enabledSlugs.length === 0 ? (
            <p className="theme-text-secondary text-sm">
              {draft.enabled
                ? "Enabled, but no substances selected. This renders nowhere."
                : "No substances selected."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {/* Each X is a production write, so it is inked like one and
                  asks before it lands; Discard changes above never touches
                  this list. */}
              {draft.enabledSlugs.map((slug) => (
                <TagToken
                  key={slug}
                  variant="compact"
                  removeTone="danger"
                  label={<span className="font-mono">{slug}</span>}
                  removeLabel={`Disable on ${slug}`}
                  onRemove={() => request({ action: "disable", slugs: [slug] })}
                />
              ))}
            </div>
          )}
          {overSlugBudget ? (
            <p className="text-dose-warning text-xs">
              {`${draft.enabledSlugs.length} substances is over the ${WARNING_BANNER_LIMITS.maxEnabledSlugs} limit. Remove some before saving, or tick All substance articles if this banner belongs everywhere.`}
            </p>
          ) : longList ? (
            <p className="theme-text-secondary text-xs">
              {`${draft.enabledSlugs.length} substances is a long list. If this banner belongs on every article, tick All substance articles instead of splitting the list across presets; it also covers articles published later.`}
            </p>
          ) : null}
          {draft.enabledSlugs.length > 0 ? (
            <Button
              type="button"
              variant="textLink"
              size="auto"
              onClick={() => onInspectCoverage?.(draft.enabledSlugs[0])}
            >
              {`See what a reader sees on ${draft.enabledSlugs[0]}`}
            </Button>
          ) : null}
        </div>
      </EditorSection> : null}
    </div>
  );
}
