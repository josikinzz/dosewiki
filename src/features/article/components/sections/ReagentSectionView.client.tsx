"use client";

import { memo, type ReactNode } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ArticleSection } from "@/components/common/ArticleSection";
import { useT } from "@/i18n/client";
import {
  REAGENT_RESULT_NEUTRAL_COLOR,
  buildReagentResultGradient,
  buildReagentResultLabelGradient,
  parseReagentResultColors,
} from "@/lib/reagentPalette";
import {
  reagentDataToDisplayEntries,
  type ReagentDisplayEntry,
} from "@/lib/reagentTesting";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { useReagentData } from "@/hooks/useReagentData";

const COLLAPSED_LIMIT = 4;
const SHORT_CODES: Record<string, string> = {
  marquis: "MQ",
  mecke: "ME",
  mandelin: "MD",
  simon: "SM",
  robadope: "RB",
  froehde: "FR",
  liebermann: "LB",
  ehrlich: "EH",
  hofmann: "HM",
  folin: "FO",
  gallic: "GA",
  scott: "SC",
};

function ReagentRow({
  reagent,
  description,
}: {
  reagent: string;
  description: string;
}) {
  const t = useT();
  const colors = parseReagentResultColors(description);
  const gradient = buildReagentResultGradient(colors);
  const darkenedGradient = buildReagentResultLabelGradient(colors);
  const shortCode =
    SHORT_CODES[reagent.toLowerCase()] ?? reagent.slice(0, 2).toUpperCase();
  const isNoReaction =
    description.toLowerCase().includes("no reaction") ||
    description.toLowerCase().includes("no change") ||
    colors[0] === REAGENT_RESULT_NEUTRAL_COLOR;
  return (
    <article
      className="theme-reagent-swatch reagent-label-panel relative grid h-11 grid-cols-[max-content_minmax(0,1fr)] overflow-hidden rounded-xl transition hover:ring-1 hover:ring-dose-accent-muted @xl:h-12"
      style={{ background: darkenedGradient }}
    >
      <div className="theme-reagent-swatch-label-layer pointer-events-none absolute inset-0" />
      <span className="reagent-label-title relative z-10 flex items-center gap-1.5 whitespace-nowrap px-4 text-xs font-semibold leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] @xl:text-sm">
        {reagent.charAt(0).toUpperCase() + reagent.slice(1)}
        <span className="reagent-label-code font-normal">({shortCode})</span>
      </span>
      <div
        className="reagent-spectrum-panel relative z-10 flex items-center justify-center"
        style={{ background: gradient }}
      >
        <div className="theme-reagent-swatch-spectrum-layer pointer-events-none absolute inset-0" />
        {isNoReaction ? (
          <span className="reagent-label-description-muted relative z-10 text-[0.6875rem] font-medium uppercase tracking-[0.08em] drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
            {t("No reaction")}
          </span>
        ) : null}
      </div>
      <span className="sr-only">{t(description)}</span>
    </article>
  );
}

export const ReagentSectionView = memo(function ReagentSectionView({
  entries,
  intro,
}: {
  entries: readonly ReagentDisplayEntry[];
  intro: ReactNode;
}) {
  const t = useT();
  if (entries.length === 0) return null;
  return (
    <ArticleSection
      id="reagent-testing"
      icon={SUBSTANCE_SECTION_ICONS["reagent-testing"]}
      heading={t("Reagent Testing")}
    >
      {intro}
      <ExpandableList
        ariaLabelBase={t("reagent results")}
        collapsedCount={Math.max(entries.length - COLLAPSED_LIMIT, 0)}
        id="reagent-results-list"
        items={entries}
        visibleItems={entries.slice(0, COLLAPSED_LIMIT)}
        className="theme-reagent-results-panel rounded-xl p-3"
        toggleClassName="mt-3"
      >
        {({ items }) => (
          <div className="@container space-y-3">
            {items.map((entry) => (
              <ReagentRow
                key={entry.key}
                reagent={entry.reagent}
                description={entry.description}
              />
            ))}
          </div>
        )}
      </ExpandableList>
      <ArticleSection.SourceFooter
        source={{
          href: "https://protestkit.eu",
          prefix: t("Powered by"),
          label: "PROtestkit.eu",
          faviconSrc: "/favicons/protestkit.png",
        }}
      />
    </ArticleSection>
  );
});

export const ReagentSectionFallback = memo(function ReagentSectionFallback({
  lookupIdentifier,
  staticEntries,
  intro,
}: {
  lookupIdentifier: string;
  staticEntries: readonly ReagentDisplayEntry[];
  intro: ReactNode;
}) {
  const t = useT();
  const { data, isLoading } = useReagentData(
    staticEntries.length === 0 ? lookupIdentifier : "",
  );
  if (staticEntries.length === 0 && isLoading) {
    return (
      <ArticleSection
        id="reagent-testing"
        icon={SUBSTANCE_SECTION_ICONS["reagent-testing"]}
        heading={t("Reagent Testing")}
      >
        <ArticleSection.State
          kind="loading"
          title={t("Loading reagent data")}
          description={t("Expected colorimetric results are being prepared.")}
        />
      </ArticleSection>
    );
  }
  const entries =
    staticEntries.length > 0
      ? staticEntries
      : reagentDataToDisplayEntries(data);
  return <ReagentSectionView entries={entries} intro={intro} />;
});
