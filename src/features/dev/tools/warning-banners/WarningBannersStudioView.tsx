"use client";

import type { ReactNode } from "react";

import {
  WARNING_BANNER_TONES,
  type WarningBannerPreset,
  type WarningBannerTarget,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import {
  EditorNavTabs,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { BannerCoverage } from "./bannerCoverage";
import { CoverageView } from "./CoverageView";
import {
  PresetsView,
  type BannerIconSizeControl,
  type PresetsViewProps,
} from "./PresetsView";

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
 * The rollout readout. Deliberately the largest type in the tool: no other
 * /dev surface leads with the blast radius of its own data, and it stays at
 * zero until an editor acts (design brief §2). One figure per tone, because
 * "577 of 577 show a banner" was true and useless once a sitewide caution
 * notice existed; sitewide presets are named as such rather than counted as
 * every slug in the corpus.
 */
function CoverageReadout({
  coverage,
  targetCount,
}: {
  coverage: BannerCoverage;
  targetCount: number;
}) {
  const nothingLive = coverage.listed.size === 0 && coverage.sitewide === 0;
  const corpus = targetCount > 0 ? `of ${targetCount} substances` : "substances";

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-3">
        {WARNING_BANNER_TONES.map((tone) => {
          const reach = coverage.byTone[tone];
          const sitewide = reach.sitewide > 0;
          const count = reach.listed.size;
          return (
            <div
              key={tone}
              className="space-y-1.5 rounded-xl border border-dose-border px-3 py-2.5"
            >
              <dt>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em]",
                    TONE_CHIP_CLASS[tone],
                  )}
                >
                  {tone}
                </span>
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "font-display text-[22px] font-semibold tabular-nums",
                    sitewide || count > 0 ? TONE_INK_CLASS[tone] : "theme-text-faint",
                  )}
                >
                  {sitewide ? "Every article" : count}
                </span>
                <span className="theme-text-secondary text-sm">
                  {sitewide
                    ? `${reach.sitewide} sitewide preset${reach.sitewide === 1 ? "" : "s"}`
                    : corpus}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="theme-text-secondary text-sm">
        {nothingLive
          ? "No preset is live. Nothing on the public site shows a banner."
          : `${coverage.listed.size} ${corpus} are on a banner list.${
              coverage.sitewide > 0
                ? ` ${coverage.sitewide} sitewide preset${coverage.sitewide === 1 ? " reaches" : "s reach"} every article, including ones published later.`
                : ""
            }`}
      </p>
    </div>
  );
}

export type WarningBannersStudioViewMode = "presets" | "coverage";

type WarningBannersStudioViewProps = {
  initialSubstanceSlug?: string;
  presets: WarningBannerPreset[];
  targets: WarningBannerTarget[];
  targetsError: string | null;
  coverage: BannerCoverage;
  view: WarningBannersStudioViewMode;
  coverageSlug: string;
  openKey: string | null;
  draft: WarningBannerPreset | null;
  isNew: boolean;
  isDirty: boolean;
  saveState: EditorActionStatusState | "idle";
  notice: EditorNoticeMessage | null;
  iconSizeNotice: EditorNoticeMessage | null;
  iconSizeControl: BannerIconSizeControl;
  iconValid: boolean;
  /** The `useConfirm` dialog, rendered once here for every guarded write. */
  confirmDialog: ReactNode;
  onRetryTargets: () => void;
  onViewChange: (view: WarningBannersStudioViewMode) => void;
  onIconValidityChange: (valid: boolean) => void;
  onDraftChange: (draft: WarningBannerPreset) => void;
  onOpen: (preset: WarningBannerPreset | null) => void;
  onCreate: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onRequestEnablement: PresetsViewProps["onRequestEnablement"];
  onRequestDelete: (preset: WarningBannerPreset) => void;
  onInspectCoverage: (slug: string) => void;
  onCoverageSlugChange: (slug: string) => void;
  onEditCoveragePreset: (preset: WarningBannerPreset) => void;
};

/**
 * Presentation for the studio. Its parent owns every query, draft and write so
 * switching between Presets and Coverage cannot fork state or save feedback.
 */
export function WarningBannersStudioView({
  initialSubstanceSlug,
  presets,
  targets,
  targetsError,
  coverage,
  view,
  coverageSlug,
  openKey,
  draft,
  isNew,
  isDirty,
  saveState,
  notice,
  iconSizeNotice,
  iconSizeControl,
  iconValid,
  onRetryTargets,
  onViewChange,
  onIconValidityChange,
  onDraftChange,
  onOpen,
  onCreate,
  onSave,
  onDiscard,
  onRequestEnablement,
  onRequestDelete,
  onInspectCoverage,
  onCoverageSlugChange,
  onEditCoveragePreset,
  confirmDialog,
}: WarningBannersStudioViewProps) {
  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:triangle-alert"
        title="Banner Studio"
        description="Warnings at the top of substance articles. Each enabled preset targets an explicit substance list or, by deliberate choice, every substance article, never a classification rule."
        actions={
          <EditorStatusPill tone="neutral">
            {`${presets.length} preset${presets.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        <CoverageReadout coverage={coverage} targetCount={targets.length} />

        {targetsError ? (
          <LoadErrorState
            message={`${targetsError} Substance search and the Coverage rail stay empty until it loads.`}
            onRetry={onRetryTargets}
          />
        ) : null}

        {notice ? <EditorNotice notice={notice} /> : null}
        {/* A second, separate notice. Sharing one would let a preset save and a
            size save overwrite each other's outcome on screen. */}
        {iconSizeNotice ? <EditorNotice notice={iconSizeNotice} /> : null}

        <EditorNavTabs
          label="Banner Studio views"
          value={view}
          onChange={(next) => onViewChange(next === "coverage" ? "coverage" : "presets")}
          options={[
            { value: "presets", label: "Presets", icon: "lucide:layers", badge: presets.length },
            {
              value: "coverage",
              label: "Coverage",
              icon: "lucide:list-checks",
              badge: coverage.listed.size,
            },
          ]}
        />

        {initialSubstanceSlug ? (
          <p className="theme-text-faint text-xs">
            {"Coverage started on "}
            <span className="font-mono">{`/dev/banners/${initialSubstanceSlug}`}</span>
            {", the substance this link opened."}
          </p>
        ) : null}

        {view === "presets" ? (
          <PresetsView
            presets={presets}
            targets={targets}
            iconSizeControl={iconSizeControl}
            openKey={openKey}
            draft={draft}
            isNew={isNew}
            isDirty={isDirty}
            saveState={saveState}
            iconValid={iconValid}
            onIconValidityChange={onIconValidityChange}
            onDraftChange={onDraftChange}
            onOpen={onOpen}
            onCreate={onCreate}
            onSave={onSave}
            onDiscard={onDiscard}
            onRequestEnablement={onRequestEnablement}
            onRequestDelete={onRequestDelete}
            onInspectCoverage={onInspectCoverage}
          />
        ) : (
          <CoverageView
            presets={presets}
            targets={targets}
            iconSize={iconSizeControl.size}
            activeSlug={coverageSlug}
            onActiveSlugChange={onCoverageSlugChange}
            saveState={saveState}
            onRequestEnablement={onRequestEnablement}
            onEditPreset={onEditCoveragePreset}
          />
        )}
      </EditorSection>

      {confirmDialog}
    </div>
  );
}
