"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import type { ReactNode } from "react";

import {
  MAX_BANNERS_PER_ARTICLE,
  WARNING_BANNER_TONES,
  type WarningBannerTarget,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import {
  EditorNavTabs,
  LoadErrorState,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { BannerCoverage, CapSuppression } from "./bannerCoverage";
import { countNoun, TONE_LABEL } from "./bannerLabels";
import { CoverageView, type CoverageViewProps } from "./CoverageView";
import { PresetsView, type PresetsViewProps } from "./PresetsView";

/**
 * The same tone tokens the banner itself renders with, so the readout and the
 * preview cannot disagree about what "danger" looks like.
 */
const TONE_CHIP_CLASS: Record<WarningBannerTone, string> = {
  danger: "theme-semantic-danger-badge",
  unsafe: "theme-semantic-unsafe-badge",
  caution: "theme-semantic-caution-badge",
};

const TONE_INK_CLASS: Record<WarningBannerTone, string> = {
  danger: "text-dose-danger-badge",
  unsafe: "text-dose-unsafe-badge",
  caution: "text-dose-caution-badge",
};

/**
 * The rollout readout, and the loudest thing in the tool: no other /dev
 * surface leads with the blast radius of its own data, and it stays at zero
 * until an editor acts. One figure per tone, because "577 of 577 show a
 * banner" was true and useless once a sitewide caution notice existed;
 * sitewide presets are named as such rather than counted as every slug in the
 * corpus. One strip of three, so it reads at a glance on a phone too.
 */
function CoverageReadout({
  coverage,
  capped,
  targetCount,
}: {
  coverage: BannerCoverage;
  capped: CapSuppression;
  targetCount: number;
}) {
  const nothingLive = coverage.listed.size === 0 && coverage.sitewide === 0;
  const corpus = targetCount > 0 ? `of ${countNoun(targetCount, "substance")}` : "substances";

  return (
    <div className="space-y-2.5">
      <dl
        aria-label="Where banners render, by tone"
        className="grid grid-cols-3 divide-x divide-dose-divider rounded-card border border-dose-border"
      >
        {WARNING_BANNER_TONES.map((tone) => {
          const reach = coverage.byTone[tone];
          const sitewide = reach.sitewide > 0;
          const count = reach.listed.size;
          return (
            <div key={tone} data-tone={tone} className="min-w-0 space-y-1.5 px-3 py-3 sm:px-4">
              <dt>
                <span className={cn("type-chip-label inline-flex h-5 items-center rounded-pill px-2", TONE_CHIP_CLASS[tone])}>
                  {TONE_LABEL[tone]}
                </span>
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className={cn(
                    "font-display text-2xl font-semibold leading-none tabular-nums",
                    sitewide || count > 0 ? TONE_INK_CLASS[tone] : "theme-text-faint",
                  )}
                >
                  {sitewide ? "All" : count}
                </span>
                <span className="theme-text-secondary text-xs sm:text-sm">
                  {sitewide ? `articles, ${countNoun(reach.sitewide, "sitewide preset")}` : corpus}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="theme-text-secondary max-w-[75ch] text-sm">
        {nothingLive
          ? "No preset is live. Nothing on the public site shows a banner."
          : `${coverage.listed.size} ${corpus} are on a banner list.${
              coverage.sitewide > 0
                ? ` ${countNoun(coverage.sitewide, "sitewide preset")} ${coverage.sitewide === 1 ? "reaches" : "reach"} every article, including ones published later.`
                : ""
            }`}
        {capped.articles > 0
          ? ` An article shows at most ${MAX_BANNERS_PER_ARTICLE} (danger, then unsafe, then caution); ${countNoun(capped.articles, "article")} ${capped.articles === 1 ? "hits" : "hit"} that cap.`
          : ""}
      </p>
    </div>
  );
}

export type WarningBannersStudioViewMode = "presets" | "coverage";

type WarningBannersStudioViewProps = {
  presetCount: number;
  capped: CapSuppression;
  targets: WarningBannerTarget[];
  targetsError: string | null;
  coverage: BannerCoverage;
  view: WarningBannersStudioViewMode;
  /** The `useConfirm` and dirty-guard dialogs, rendered once here for every guarded write. */
  confirmDialog: ReactNode;
  onRetryTargets: () => void;
  onViewChange: (view: WarningBannersStudioViewMode) => void;
  presetsProps: PresetsViewProps;
  coverageProps: CoverageViewProps;
};

/**
 * Presentation for the studio. Its parent owns every query, draft and write so
 * switching between Presets and Coverage cannot fork state or save feedback.
 */
export function WarningBannersStudioView({
  presetCount,
  capped,
  targets,
  targetsError,
  coverage,
  view,
  confirmDialog,
  onRetryTargets,
  onViewChange,
  presetsProps,
  coverageProps,
}: WarningBannersStudioViewProps) {
  return (
    <div>
      <DevToolSection
        tool="banners"
        description="Warnings at the top of substance articles. A preset shows on the substances you list, or on every article when you choose that; never by classification."
      >
        <CoverageReadout coverage={coverage} capped={capped} targetCount={targets.length} />

        {targetsError ? (
          <LoadErrorState
            what="the substance list"
            message={`${targetsError} Substance search and the Coverage list stay empty until it loads.`}
            onRetry={onRetryTargets}
          />
        ) : null}

        <EditorNavTabs
          label="Banners views"
          value={view}
          onChange={(next) => onViewChange(next === "coverage" ? "coverage" : "presets")}
          options={[
            { value: "presets", label: "Presets", icon: "lucide:layers", badge: presetCount },
            { value: "coverage", label: "Coverage", icon: "lucide:list-checks" },
          ]}
        />

        <div className="pt-1">
          {view === "presets" ? <PresetsView {...presetsProps} /> : <CoverageView {...coverageProps} />}
        </div>
      </DevToolSection>

      {confirmDialog}
    </div>
  );
}
