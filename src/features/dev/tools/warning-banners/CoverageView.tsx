"use client";

/**
 * Coverage — the audit surface (design brief §3, view 2).
 *
 * Pick a substance and see exactly what a reader sees: the real `SafetyBanner`
 * components rather than a summary of them, each followed by the monospace
 * provenance line that says why it is there. `resolveEnabledBanners` takes the
 * slug and nothing else, so this view cannot show a banner that an editor did
 * not explicitly enable — which is the point of auditing here rather than
 * reading the class matchers back.
 */

import { useMemo, useState } from "react";

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
import {
  matcherHits,
  normalizeClassToken,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  substanceClassTokens,
  warningBannerPresetState,
  MAX_BANNERS_PER_ARTICLE,
  type WarningBannerPreset,
  type WarningBannerPresetState,
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
import type { WarningBannerTarget } from "./warningBannerTargets";

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
  activeSlug: string;
  onActiveSlugChange: (slug: string) => void;
  saveState: EditorActionStatusState | "idle";
  onCommitEnabledSlugs: (
    preset: WarningBannerPreset,
    nextSlugs: string[],
    summary: string,
  ) => void;
  onEditPreset: (preset: WarningBannerPreset) => void;
};

export function CoverageView({
  presets,
  targets,
  activeSlug,
  onActiveSlugChange,
  saveState,
  onCommitEnabledSlugs,
  onEditPreset,
}: CoverageViewProps) {
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? targets.filter(
            (target) =>
              target.slug.includes(needle) || target.title.toLowerCase().includes(needle),
          )
        : targets,
    [needle, targets],
  );

  const target = targets.find((entry) => entry.slug === activeSlug) ?? null;
  const rendered = activeSlug ? resolveEnabledBanners(presets, activeSlug) : [];
  const suppressed = activeSlug ? resolveSuppressedBanners(presets, activeSlug) : [];

  /**
   * Raw class strings, not the normalized tokens: the provenance line quotes
   * what is actually stored on the article so an editor can go and read it.
   */
  const rawClasses = target
    ? [...target.psychoactiveClasses, ...target.chemicalClasses, ...target.indexCategories]
    : [];
  const tokens = target
    ? substanceClassTokens({
        psychoactiveClasses: target.psychoactiveClasses,
        chemicalClasses: target.chemicalClasses,
        indexCategories: target.indexCategories,
      })
    : [];

  const provenanceFor = (preset: WarningBannerPreset): string[] =>
    matcherHits(preset, tokens).map((matcher) => {
      const hit = matcher.trim().toLowerCase();
      const source = rawClasses.find(
        (value) =>
          value.toLowerCase().includes(hit) || normalizeClassToken(value).includes(hit),
      );
      return source ? `matcher ${matcher} hit ${source}` : `matcher ${matcher}`;
    });

  /** Suggested here but not enabled here — the `not applied` block. */
  const notApplied = activeSlug
    ? presets.filter(
        (preset) =>
          !preset.enabledSlugs.includes(activeSlug) && matcherHits(preset, tokens).length > 0,
      )
    : [];

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2">
        <Input
          value={filter}
          inputSize="sm"
          type="search"
          aria-label="Filter substances"
          placeholder={`Filter ${targets.length} substances`}
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
            label: entry.title ? `${entry.title} — ${entry.slug}` : entry.slug,
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
            <p className="theme-text-faint p-2 text-sm">No substance matches that filter.</p>
          ) : (
            filtered.map((entry) => {
              const count = presets.filter(
                (preset) => preset.enabled && preset.enabledSlugs.includes(entry.slug),
              ).length;
              return (
                <EditorListItem
                  key={entry.slug}
                  active={entry.slug === activeSlug}
                  title={entry.title || entry.slug}
                  subtitle={entry.slug}
                  badge={
                    count > 0 ? (
                      <EditorStatusPill tone="success">{`live · ${count}`}</EditorStatusPill>
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
                        {" is not in the loaded substance list, so no class strings are available for it. Any banner below still renders, because enablement is by slug."}
                      </>
                    ),
                  }}
                />
              ) : null}

              {rendered.length === 0 ? (
                <p className="theme-text-faint text-sm">
                  Nothing is enabled on this slug. The suggestions below are not applied.
                </p>
              ) : (
                <div className="space-y-4">
                  {rendered.map((preset) => {
                    const lines = provenanceFor(preset);
                    return (
                      <div key={preset.key} className="space-y-2">
                        <SafetyBanner
                          variant={preset.tone}
                          icon={preset.icon}
                          severityLabel={preset.severityLabel}
                        >
                          <SafetyBannerTitle>{preset.headline}</SafetyBannerTitle>
                          <SafetyBannerPoints points={preset.points} />
                          <SafetyBannerLinks links={preset.links} />
                        </SafetyBanner>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="theme-text-faint font-mono text-xs">
                            {lines.length > 0
                              ? lines.join(" · ")
                              : "enabled by hand — no matcher suggests this substance"}
                          </span>
                          <Button
                            type="button"
                            variant="ghostDestructive"
                            size="sm"
                            disabled={saveState === "saving"}
                            onClick={() =>
                              onCommitEnabledSlugs(
                                preset,
                                preset.enabledSlugs.filter((slug) => slug !== activeSlug),
                                `Disabled “${preset.label || preset.key}” on ${activeSlug}.`,
                              )
                            }
                          >
                            {`Disable on ${activeSlug}`}
                          </Button>
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
                    );
                  })}
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
                        {" but will not render. Raise its priority or disable one of the banners above."}
                      </>
                    ),
                  }}
                />
              ))}
            </EditorSection>

            <EditorSection
              headingLevel="h3"
              icon="lucide:list-plus"
              title="not applied"
              description="Class strings suggest these. Nothing about them reaches the public site until you enable them here."
            >
              {notApplied.length === 0 ? (
                <p className="theme-text-faint text-sm">
                  No preset's matchers suggest this substance.
                </p>
              ) : (
                <ul className="space-y-2">
                  {notApplied.map((preset) => (
                    <li
                      key={preset.key}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dose-border px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block truncate text-sm font-medium">
                          {preset.label || preset.key}
                        </span>
                        <span className="theme-text-faint block truncate font-mono text-xs">
                          {provenanceFor(preset).join(" · ")}
                        </span>
                      </span>
                      <EditorStatusPill tone={STATE_PILL_TONE[warningBannerPresetState(preset)]}>
                        {STATE_LABEL[warningBannerPresetState(preset)]}
                      </EditorStatusPill>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={saveState === "saving"}
                        onClick={() =>
                          onCommitEnabledSlugs(
                            preset,
                            [...preset.enabledSlugs, activeSlug],
                            `Enabled “${preset.label || preset.key}” on ${activeSlug}.`,
                          )
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
                    <span className="theme-text-primary min-w-0 flex-1 truncate text-sm">
                      {preset.label || preset.key}
                    </span>
                    <span className="theme-text-secondary text-sm tabular-nums">
                      {`${preset.enabledSlugs.length} enabled`}
                    </span>
                    <EditorStatusPill tone={STATE_PILL_TONE[state]}>
                      {STATE_LABEL[state]}
                    </EditorStatusPill>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Open ${preset.label || preset.key} in Presets`}
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
