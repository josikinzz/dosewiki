"use client";

/**
 * Coverage — the audit surface (design brief §3, view 2).
 *
 * Pick a substance and see exactly what a reader sees: the real `SafetyBanner`
 * components rather than a summary of them, above the article's own class
 * strings in monospace so the evidence an editor decides on is on screen beside
 * the decision. `resolveEnabledBanners` takes the slug and nothing else, so this
 * view cannot show a banner an editor did not explicitly enable — which is why
 * auditing happens here rather than by reading a classification back.
 */

import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SafetyBanner,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import { Surface } from "@/components/ui/surface";
import {
  presetAppliesToSlug,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  searchWarningBannerTargets,
  warningBannerPresetState,
  MAX_BANNERS_PER_ARTICLE,
  type WarningBannerPreset,
  type WarningBannerPresetState,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
  type EditorActionStatusState,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import type { EnablementChange } from "./enablement";

/** Enablement state only — severity colour never reaches a status position. */
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

export type CoverageViewProps = {
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  /**
   * The saved global glyph size. Coverage answers "what does a reader see", so a
   * preview at any other size would be answering a different question.
   */
  iconSize: number;
  activeSlug: string;
  onActiveSlugChange: (slug: string) => void;
  saveState: EditorActionStatusState | "idle";
  onRequestEnablement: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onEditPreset: (preset: WarningBannerPreset) => void;
};

export function CoverageView({
  presets,
  targets,
  iconSize,
  activeSlug,
  onActiveSlugChange,
  saveState,
  onRequestEnablement,
  onEditPreset,
}: CoverageViewProps) {
  const [filter, setFilter] = useState("");

  // The same helper the Presets search uses, so typing `opioid` in the rail
  // lists exactly the substances that enabling `opioid` would have offered —
  // two search semantics in one tool is one too many.
  // Annotated: the helper returns the `Match` subtype, and an unannotated
  // union of two array types is not mappable.
  const filtered = useMemo<WarningBannerTarget[]>(
    () =>
      filter.trim().length >= 2
        ? searchWarningBannerTargets(filter, targets, targets.length)
        : targets,
    [filter, targets],
  );

  const target = targets.find((entry) => entry.slug === activeSlug) ?? null;
  const rendered = activeSlug ? resolveEnabledBanners(presets, activeSlug) : [];
  const suppressed = activeSlug ? resolveSuppressedBanners(presets, activeSlug) : [];
  const notApplied = activeSlug
    ? presets.filter((preset) => !presetAppliesToSlug(preset, activeSlug))
    : [];

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2">
        <Input
          value={filter}
          inputSize="sm"
          type="search"
          aria-label="Find a substance"
          placeholder={`Search ${targets.length} substances`}
          onChange={(event) => setFilter(event.target.value)}
        />

        {/* Below the 2-column breakpoint the rail becomes a select rather than
            disappearing — amputating the picker on a narrow viewport would make
            the view unusable exactly where it is hardest to navigate (§6). */}
        <EditorSelect
          selectSize="sm"
          className="min-[900px]:hidden"
          aria-label="Substance"
          value={activeSlug}
          placeholder="Pick a substance"
          options={filtered.map((entry) => ({
            value: entry.slug,
            label: entry.title ? `${entry.title} (${entry.slug})` : entry.slug,
          }))}
          onChange={(event) => onActiveSlugChange(event.target.value)}
        />

        <Surface
          variant="subtle"
          padding="none"
          radius="lg"
          className="hidden max-h-[40vh] space-y-1 overflow-y-auto p-1.5 min-[900px]:block"
        >
          {filtered.length === 0 ? (
            <p className="theme-text-faint p-2 text-sm">No substance matches that search.</p>
          ) : (
            filtered.map((entry) => {
              // Listed presets only. A sitewide preset reaches every row, so
              // counting it would put the same pill on all 577 and say nothing.
              const count = presets.filter(
                (preset) => !preset.allSubstances && presetAppliesToSlug(preset, entry.slug),
              ).length;
              return (
                <EditorListItem
                  key={entry.slug}
                  active={entry.slug === activeSlug}
                  title={entry.title || entry.slug}
                  subtitle={entry.slug}
                  badge={
                    count > 0 ? (
                      <EditorStatusPill tone="success">{`listed · ${count}`}</EditorStatusPill>
                    ) : null
                  }
                  onSelect={() => onActiveSlugChange(entry.slug)}
                />
              );
            })
          )}
        </Surface>
      </div>

      <div className="space-y-6">
        {!activeSlug ? (
          <p className="theme-text-secondary text-sm">
            Pick a substance to see what a reader sees on it.
          </p>
        ) : (
          <>
            <EditorSection
              headingLevel="h3"
              icon="lucide:eye"
              title={target?.title || activeSlug}
              description={
                rendered.length === 0
                  ? "No banner renders on this article."
                  : `${rendered.length} banner${rendered.length === 1 ? "" : "s"} render here, in this order.`
              }
              actions={
                <EditorStatusPill tone="neutral">
                  <span className="font-mono">{activeSlug}</span>
                </EditorStatusPill>
              }
            >
              {!target && targets.length > 0 ? (
                <EditorNotice
                  notice={{
                    tone: "warning",
                    message: (
                      <>
                        <span className="font-mono">{activeSlug}</span>
                        {" is not in the loaded substance list. Any banner below still renders, because enablement is by slug."}
                      </>
                    ),
                  }}
                />
              ) : null}

              {/* The class strings, verbatim and monospace. They decide nothing —
                  enablement is by slug — but they are what an editor reads before
                  deciding, so they belong on this page rather than in the article. */}
              {target ? (
                <p className="theme-text-faint font-mono text-xs">
                  {target.classes.length > 0
                    ? target.classes.join(" · ")
                    : "no classification strings on this article"}
                </p>
              ) : null}

              {rendered.length === 0 ? (
                <p className="theme-text-faint text-sm">
                  Nothing is enabled on this slug.
                </p>
              ) : (
                <div className="space-y-4">
                  {rendered.map((preset) => (
                    <div key={preset.key} className="space-y-2">
                      <SafetyBanner
                        variant={preset.tone}
                        icon={preset.icon}
                        iconSize={iconSize}
                      >
                        <SafetyBannerTitle
                          severityLabel={preset.severityLabel}
                          tone={preset.tone}
                        >
                          {preset.headline}
                        </SafetyBannerTitle>
                        <SafetyBannerPoints points={preset.points} />
                      </SafetyBanner>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="theme-text-faint font-mono text-xs">
                          {preset.allSubstances
                            ? `${preset.key} · sitewide`
                            : `${preset.key} · enabled on ${preset.enabledSlugs.length} substances`}
                        </span>
                        {!preset.allSubstances ? (
                          <Button
                            type="button"
                            variant="ghostDestructive"
                            size="sm"
                            disabled={saveState === "saving"}
                            onClick={() =>
                              onRequestEnablement(preset, { action: "disable", slugs: [activeSlug] })
                            }
                          >
                            {`Disable on ${activeSlug}`}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="textLink"
                          size="auto"
                          onClick={() => onEditPreset(preset)}
                        >
                          Edit words
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {suppressed.map((preset) => (
                <EditorNotice
                  key={preset.key}
                  notice={{
                    tone: "warning",
                    title: `Over the ${MAX_BANNERS_PER_ARTICLE}-banner cap`,
                    message: (
                      <>
                        <span className="font-mono">{preset.key}</span>
                        {" is enabled on "}
                        <span className="font-mono">{activeSlug}</span>
                        {" but will not render. Disable one of the banners above, or disable this one."}
                      </>
                    ),
                  }}
                />
              ))}
            </EditorSection>

            <EditorSection
              headingLevel="h3"
              icon="lucide:list-plus"
              title="Not applied"
              description="Nothing here reaches the public site until you enable it."
            >
              {notApplied.length === 0 ? (
                <p className="theme-text-faint text-sm">
                  Every preset is already enabled on this substance.
                </p>
              ) : (
                <ul className="space-y-2">
                  {notApplied.map((preset) => (
                    <li
                      key={preset.key}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dose-border px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block truncate font-mono text-sm">
                          {preset.key}
                        </span>
                        <span className="theme-text-faint block truncate text-xs">
                          {preset.headline || "No headline yet"}
                        </span>
                      </span>
                      <EditorStatusPill tone={STATE_PILL_TONE[warningBannerPresetState(preset)]}>
                        {STATE_LABEL[warningBannerPresetState(preset)]}
                      </EditorStatusPill>
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        disabled={saveState === "saving"}
                        onClick={() =>
                          onRequestEnablement(preset, { action: "enable", slugs: [activeSlug] })
                        }
                      >
                        Enable here
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </EditorSection>
          </>
        )}

        <EditorSection
          headingLevel="h3"
          icon="lucide:gauge"
          title="Rollout"
          description="How far each preset reaches. A preset that is off reaches nobody, whatever its list says."
        >
          {presets.length === 0 ? (
            <p className="theme-text-faint text-sm">No presets to roll out yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {presets.map((preset) => {
                const state = warningBannerPresetState(preset);
                return (
                  <li
                    key={preset.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dose-border px-3 py-2"
                  >
                    <span className="theme-text-primary min-w-0 flex-1 truncate font-mono text-sm">
                      {preset.key}
                    </span>
                    <span className="theme-text-secondary text-sm tabular-nums">
                      {preset.allSubstances
                        ? "sitewide"
                        : `${preset.enabledSlugs.length} enabled`}
                    </span>
                    <EditorStatusPill tone={STATE_PILL_TONE[state]}>
                      {STATE_LABEL[state]}
                    </EditorStatusPill>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Open ${preset.key} in Presets`}
                      onClick={() => onEditPreset(preset)}
                    >
                      <Icon icon="lucide:pencil" size={15} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </EditorSection>
      </div>
    </div>
  );
}
