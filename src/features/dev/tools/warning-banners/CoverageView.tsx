"use client";

/**
 * Coverage: the audit surface.
 *
 * Pick a substance and see exactly what a reader sees: the real `SafetyBanner`
 * components rather than a summary of them, above the article's own class
 * strings in monospace so the evidence an editor decides on is on screen beside
 * the decision. `resolveEnabledBanners` takes the slug and nothing else, so this
 * view cannot show a banner an editor did not explicitly enable, which is why
 * auditing happens here rather than by reading a classification back.
 *
 * Laid out like the other workspaces: the substances on the left (searchable,
 * sticky and sized to the screen on desktop, a capped list on a phone), the
 * picked substance on the right, and the rollout of every preset under it.
 * Picking a substance on a phone scrolls its detail in, and the detail carries
 * Back to list.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SafetyBanner,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import {
  presetAppliesToSlug,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  searchWarningBannerTargets,
  warningBannerPresetState,
  MAX_BANNERS_PER_ARTICLE,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  EditorPanel,
  EditorStatusPill,
  Notice,
  useScrollToDetail,
  type EditorActionStatusState,
  type NoticeMessage,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { LINK_LIST_CLASS } from "../home/homeParts";
import { countNoun, presetReachLabel, presetStateLabel, STATE_PILL_TONE, TONE_LABEL } from "./bannerLabels";
import type { EnablementChange } from "./enablement";

export type CoverageViewProps = {
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  /** False until the substance list has answered (or failed). */
  targetsLoaded?: boolean;
  /**
   * The saved global glyph size. Coverage answers "what does a reader see", so a
   * preview at any other size would be answering a different question.
   */
  iconSize: number;
  activeSlug: string;
  /** The substance a `/dev/banners/<slug>` link opened, if any. */
  linkedSlug?: string;
  onActiveSlugChange: (slug: string) => void;
  saveState: EditorActionStatusState | "idle";
  /** The result of the last write made from here, shown with the substance it changed. */
  notice?: NoticeMessage | null;
  onDismissNotice?: () => void;
  onRequestEnablement: (preset: WarningBannerPreset, change: EnablementChange) => void;
  onEditPreset: (preset: WarningBannerPreset) => void;
};

export function CoverageView({
  presets,
  targets,
  targetsLoaded = true,
  iconSize,
  activeSlug,
  linkedSlug,
  onActiveSlugChange,
  saveState,
  notice = null,
  onDismissNotice,
  onRequestEnablement,
  onEditPreset,
}: CoverageViewProps) {
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScrollToDetail(detailRef, activeSlug || null);
  // A `/dev/banners/<slug>` link asked for one substance: on a phone, where the
  // list stacks above it, bring that substance into view once on arrival.
  const arrivedFromLink = useRef(false);
  useEffect(() => {
    // Wait for the list above it, so the jump lands where the detail ends up.
    if (arrivedFromLink.current || !targetsLoaded || !linkedSlug || linkedSlug !== activeSlug) return;
    arrivedFromLink.current = true;
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 1023px)").matches) return;
    detailRef.current?.scrollIntoView?.({ block: "start" });
  }, [linkedSlug, activeSlug, targetsLoaded]);

  // The same helper the Presets search uses, so typing `opioid` here lists
  // exactly the substances that enabling `opioid` would have offered; two
  // search semantics in one tool is one too many.
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
  const saving = saveState === "saving";
  const searching = filter.trim().length >= 2;

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    listRef.current
      ?.querySelector<HTMLElement>(`[data-substance="${CSS.escape(activeSlug)}"] button, input[type="search"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] lg:items-start xl:gap-10">
      <div ref={listRef} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
        <div className="flex items-center justify-between gap-3">
          <h3 id="banner-substances-heading" className="type-meta-label theme-text-muted">
            Substances
          </h3>
          <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
            {!targetsLoaded
              ? "Loading"
              : searching
                ? `${filtered.length} of ${targets.length}`
                : countNoun(targets.length, "substance")}
          </p>
        </div>
        <div className="relative">
          <Input
            value={filter}
            inputSize="sm"
            type="search"
            data-banner-search=""
            aria-keyshortcuts="/"
            aria-label="Find a substance"
            placeholder={targets.length > 0 ? `Search ${targets.length} substances by name or class` : "Search substances"}
            className="peer pr-9"
            onChange={(event) => setFilter(event.target.value)}
          />
          {/* The key cap, on fine pointers only and only while the field is empty. */}
          {filter === "" ? (
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 peer-focus:hidden [@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          ) : null}
        </div>

        {!targetsLoaded ? (
          <p className="theme-text-muted px-0.5 text-sm">Loading the substance list.</p>
        ) : filtered.length === 0 ? (
          <p className="theme-text-muted px-0.5 text-sm">
            {targets.length === 0
              ? "The substance list is empty, so there is nothing to audit yet."
              : "No substance matches that search. Try a shorter name or a class."}
          </p>
        ) : (
          <div className="-mx-2.5 max-h-[22rem] overflow-y-auto overscroll-contain px-2.5 lg:max-h-[min(calc(100dvh_-_17rem),640px)]">
            <ul aria-labelledby="banner-substances-heading" className={LINK_LIST_CLASS}>
              {filtered.map((entry) => {
                // Listed presets only. A sitewide preset reaches every row, so
                // counting it would put the same pill on all of them and say nothing.
                const count = presets.filter(
                  (preset) => !preset.allSubstances && presetAppliesToSlug(preset, entry.slug),
                ).length;
                const isActive = entry.slug === activeSlug;
                return (
                  <li key={entry.slug} data-substance={entry.slug}>
                    <button
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => {
                        onActiveSlugChange(entry.slug);
                        if (isActive) headingRef.current?.focus();
                      }}
                      className={cn(
                        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm transition-colors motion-reduce:transition-none",
                        isActive && "theme-dev-link-lead",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block truncate font-medium">{entry.title || entry.slug}</span>
                        <span className="theme-text-faint block truncate font-mono text-xs">
                          <span className="sr-only">, </span>
                          {entry.slug}
                        </span>
                      </span>
                      {count > 0 ? (
                        <span className="shrink-0">
                          <span className="sr-only">, </span>
                          <EditorStatusPill inline tone="success">{`On ${countNoun(count, "list")}`}</EditorStatusPill>
                        </span>
                      ) : null}
                      <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-8">
        <section ref={detailRef as RefObject<HTMLElement | null>} aria-label="What a reader sees" className="scroll-mt-24">
          {!activeSlug ? (
            <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
              <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
                <Icon icon="lucide:eye" size={18} className="theme-icon-accent shrink-0" />
                Pick a substance to see what a reader sees on it
              </p>
              <p className="theme-text-muted max-w-[60ch] text-sm">
                Its banners show here in the order the article stacks them, with the presets that
                could still be enabled on it.
              </p>
              {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
            </EditorPanel>
          ) : (
            <EditorPanel className="overflow-visible">
              <header className="theme-portal-rule space-y-2 border-b px-4 py-3.5 sm:px-5">
                <div className="lg:hidden">
                  <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={backToList}>
                    <Icon icon="lucide:arrow-left" size={14} />
                    Back to list
                  </Button>
                </div>
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
                >
                  {target?.title || activeSlug}
                </h3>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                  <span className="theme-text-faint font-mono text-xs">{activeSlug}</span>
                  <span aria-hidden className="theme-text-faint">·</span>
                  <span className="theme-text-secondary">
                    {rendered.length === 0
                      ? "No banner renders on this article."
                      : `${countNoun(rendered.length, "banner")} ${rendered.length === 1 ? "renders" : "render"} here, in this order.`}
                  </span>
                </p>
                {/* The class strings, verbatim and monospace. They decide nothing
                    (enablement is by slug) but they are what an editor reads
                    before deciding, so they belong beside the decision. */}
                {target ? (
                  <p className="text-xs">
                    <span className="type-meta-label theme-text-faint mr-2">Classes</span>
                    <span className="theme-text-muted font-mono">
                      {target.classes.length > 0
                        ? target.classes.join(" · ")
                        : "none on this article"}
                    </span>
                  </p>
                ) : null}
                {linkedSlug && linkedSlug === activeSlug ? (
                  <p className="theme-text-faint text-xs">
                    {"Coverage started on "}
                    {target?.title || linkedSlug}
                    {", the substance this link opened."}
                  </p>
                ) : null}
              </header>

              <div className="space-y-5 px-4 py-5 sm:px-5">
                {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}

                {!target && targets.length > 0 ? (
                  <Notice
                    tone="warning"
                    message={
                      <>
                        <span className="font-mono">{activeSlug}</span>
                        {" is not in the loaded substance list. Any banner below still renders, because enablement is by slug."}
                      </>
                    }
                  />
                ) : null}

                {rendered.length === 0 ? (
                  <p className="theme-text-muted text-sm">Nothing is enabled on this substance.</p>
                ) : (
                  <ol aria-label="Banners on this article" className="space-y-5">
                    {rendered.map((preset) => (
                      <li key={preset.key} className="space-y-2">
                        <SafetyBanner variant={preset.tone} icon={preset.icon} iconSize={iconSize}>
                          <SafetyBannerTitle severityLabel={preset.severityLabel} tone={preset.tone}>
                            {preset.headline}
                          </SafetyBannerTitle>
                          <SafetyBannerPoints points={preset.points} />
                        </SafetyBanner>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="theme-text-faint min-w-0 text-xs">
                            <span className="font-mono">{preset.key}</span>
                            {preset.allSubstances
                              ? " · sitewide"
                              : ` · on ${countNoun(preset.enabledSlugs.length, "substance")}`}
                          </span>
                          <span className="ml-auto flex flex-wrap items-center gap-x-1 gap-y-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => onEditPreset(preset)}>
                              <Icon icon="lucide:pencil" size={14} />
                              Edit words
                            </Button>
                            {!preset.allSubstances ? (
                              <Button
                                type="button"
                                variant="ghostDestructive"
                                size="sm"
                                disabled={saving}
                                onClick={() =>
                                  onRequestEnablement(preset, { action: "disable", slugs: [activeSlug] })
                                }
                              >
                                {`Disable on ${target?.title || activeSlug}`}
                              </Button>
                            ) : null}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {suppressed.map((preset) => (
                  <Notice
                    key={preset.key}
                    tone="warning"
                    title={`Over the ${MAX_BANNERS_PER_ARTICLE}-banner cap`}
                    message={
                      <>
                        <span className="font-mono">{preset.key}</span>
                        {" is enabled here but does not render, because an article shows at most "}
                        {MAX_BANNERS_PER_ARTICLE}
                        {". Disable one of the banners above, or this one."}
                      </>
                    }
                    actions={
                      !preset.allSubstances ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => onRequestEnablement(preset, { action: "disable", slugs: [activeSlug] })}
                        >
                          {`Disable ${preset.key} here`}
                        </Button>
                      ) : undefined
                    }
                  />
                ))}

                <div className="theme-portal-rule space-y-2 border-t pt-5">
                  <h4 className="theme-text-primary text-sm font-semibold">Not on this article</h4>
                  <p className="theme-text-muted text-sm">Nothing here reaches the public site until you enable it.</p>
                  {notApplied.length === 0 ? (
                    <p className="theme-text-faint text-sm">Every preset already applies to this substance.</p>
                  ) : (
                    <ul className={LINK_LIST_CLASS}>
                      {notApplied.map((preset) => {
                        const state = warningBannerPresetState(preset);
                        return (
                          <li key={preset.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2.5">
                            <span className="min-w-0 flex-1">
                              <span className="theme-text-primary block truncate font-mono text-sm">{preset.key}</span>
                              <span className="theme-text-faint block truncate text-xs">
                                {preset.headline || "No headline yet"}
                              </span>
                            </span>
                            <EditorStatusPill tone={STATE_PILL_TONE[state]}>{presetStateLabel(preset)}</EditorStatusPill>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={saving}
                              onClick={() => onRequestEnablement(preset, { action: "enable", slugs: [activeSlug] })}
                            >
                              Enable here
                              <span className="sr-only">{`: ${preset.key}`}</span>
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </EditorPanel>
          )}
        </section>

        <section aria-labelledby="banner-rollout-heading" className="space-y-2">
          <h3 id="banner-rollout-heading" className="type-meta-label theme-text-muted">
            Rollout
          </h3>
          <p className="theme-text-muted max-w-[75ch] text-sm">
            How far each preset reaches. A preset that is off reaches nobody, whatever its list says.
          </p>
          {presets.length === 0 ? (
            <p className="theme-text-faint text-sm">No presets to roll out yet.</p>
          ) : (
            <ul className={LINK_LIST_CLASS}>
              {presets.map((preset) => {
                const state = warningBannerPresetState(preset);
                return (
                  <li key={preset.key}>
                    <button
                      type="button"
                      title={`Open ${preset.key} in Presets`}
                      onClick={() => onEditPreset(preset)}
                      className="theme-dev-link-row group flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2.5 py-2 text-left text-sm transition-colors motion-reduce:transition-none"
                    >
                      <span className="theme-text-primary min-w-0 flex-1 truncate font-mono">{preset.key}</span>
                      <span className="theme-text-muted text-xs">
                        <span className="sr-only">, </span>
                        {`${TONE_LABEL[preset.tone]} · ${presetReachLabel(preset)}`}
                      </span>
                      <span>
                        <span className="sr-only">, </span>
                        <EditorStatusPill inline tone={STATE_PILL_TONE[state]}>{presetStateLabel(preset)}</EditorStatusPill>
                      </span>
                      <span className="sr-only">, open in Presets</span>
                      <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
