import { Leaf, MessageSquarePlus, Share2 } from "lucide-react";

import { IconBadge } from "../../../common/IconBadge";
import { SectionCard } from "../../../common/SectionCard";
import type { SubstanceRecord } from "../../../../data/contentBuilder";
import type { RouteKey } from "../../../../types/content";
import { DosageDurationCard } from "../../DosageDurationCard";
import { SubjectiveEffectsSection } from "../../SubjectiveEffectsSection";
import { AddictionCard } from "../../AddictionCard";
import { InteractionsSection } from "../../InteractionsSection";
import { ToleranceSection } from "../../ToleranceSection";
import { NotesSection } from "../../NotesSection";
import { CitationsSection } from "../../CitationsSection";
import { InfoSectionItemCard, InfoSections } from "../../InfoSections";
import {
  extractInfoSectionBuckets,
  buildHeroVariantLines,
} from "../../../../utils/substanceLayout";

interface LayoutLabPreviewProps {
  record: SubstanceRecord;
  activeRouteKey: RouteKey | null;
  onRouteChange: (route: RouteKey) => void;
  onOpenEditor?: () => void;
}

const FALLBACK_MOLECULE_LABEL = "Molecule artwork unavailable";

export function LayoutLabPreview({
  record,
  activeRouteKey,
  onRouteChange,
  onOpenEditor,
}: LayoutLabPreviewProps) {
  const { content } = record;
  const routeOrder = content.routeOrder;
  const activeRouteFallback = routeOrder[0];
  const resolvedRouteKey = activeRouteKey && content.routes[activeRouteKey]
    ? activeRouteKey
    : activeRouteFallback;
  const shareHref = `https://www.dose.wiki/#/substance/${record.slug}`;
  const { filteredInfoSections, moleculeIdentityEntries, moleculeCardEntries } = extractInfoSectionBuckets(content.infoSections);
  const heroVariantLines = buildHeroVariantLines(content.nameVariants).map((line) => ({
    ...line,
    Icon: line.kind === "botanical" ? Leaf : MessageSquarePlus,
  }));
  const hasHeroVariantLines = heroVariantLines.length > 0;
  const variantLineClasses = "flex flex-wrap items-center gap-2 text-sm text-white/80 md:text-base";

  return (
    <div className="space-y-10">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <div>
            <h2 className="text-4xl font-semibold text-fuchsia-300 xl:text-5xl">
              {content.name}
            </h2>
            {hasHeroVariantLines ? (
              <div className="mt-4 flex flex-col gap-2">
            {heroVariantLines.map((line) => (
              <p key={line.key} className={variantLineClasses}>
                <line.Icon className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
                    <span className="flex flex-wrap items-center gap-2 text-white/80">
                      {line.values.map((value, index) => (
                        <span key={`${line.key}-${value}-${index}`} className="flex items-center gap-2">
                          <span className="italic">{value}</span>
                          {index < line.values.length - 1 ? (
                            <span className="text-white/60">·</span>
                          ) : null}
                        </span>
                      ))}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <DosageDurationCard
            route={resolvedRouteKey ?? routeOrder[0]}
            onRouteChange={onRouteChange}
            routes={content.routes}
            routeOrder={routeOrder}
            note={content.dosageUnitsNote}
          />
          <SubjectiveEffectsSection effects={content.subjectiveEffects} />
          <InteractionsSection interactions={content.interactions} layoutVariant="stacked" />
          <ToleranceSection tolerance={content.tolerance} />
          <AddictionCard summary={content.addictionSummary} />
          <NotesSection notes={content.notes} />
          <CitationsSection citations={content.citations} />
          {content.heroBadges.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-4">
              {content.heroBadges.map((badge) => (
                <span
                  key={`${badge.label}-${badge.categoryKey ?? badge.label}`}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.35em] text-white/70"
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          <div className="w-full max-w-[22rem] rounded-[28px] border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-600/15 via-violet-500/12 to-indigo-500/12 p-6 ring-1 ring-white/10">
            <div className="rounded-2xl border border-white/10 bg-[#0f0a1f] p-4">
              {content.moleculeAsset ? (
                <img
                  src={content.moleculeAsset.url}
                  alt={`Molecule depiction for ${content.name}`}
                  className="h-56 w-full object-contain"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#120d27] text-sm text-white/55">
                  {FALLBACK_MOLECULE_LABEL}
                </div>
              )}
              {moleculeIdentityEntries.length > 0 ? (
                <dl className="mt-6 space-y-4">
                  {moleculeIdentityEntries.map((item) => {
                    const normalizedLabel = item.label.toLowerCase().trim();
                    const key = `${normalizedLabel}-${item.value}`;
                    const valueNode = item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs leading-snug text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className="text-xs leading-snug text-white/85">{item.value}</span>
                    );

                    return (
                      <div key={key} className="space-y-1 text-left">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">
                          {item.label}
                        </dt>
                        <dd>{valueNode}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
            </div>
            {moleculeCardEntries.length > 0 ? (
              <div className="mt-6 space-y-4">
                {moleculeCardEntries.map((item) => (
                  <InfoSectionItemCard
                    key={`${item.label}-${item.value}`}
                    item={item}
                    headingClassName="flex items-center gap-2 text-base font-semibold leading-tight text-fuchsia-300"
                  />
                ))}
              </div>
            ) : null}
          </div>
          <InfoSections sections={filteredInfoSections} layoutVariant="single-column" />
          <SectionCard className="p-4 text-xs text-white/60">
            <p className="flex items-center gap-2 text-sm font-semibold text-fuchsia-200">
              <IconBadge icon={Share2} label="Share" />
              Share link
            </p>
            <a
              href={shareHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate text-sm text-fuchsia-200 transition hover:text-fuchsia-100"
            >
              {shareHref}
            </a>
            {onOpenEditor && (
              <button
                type="button"
                onClick={onOpenEditor}
                className="mt-3 inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/15 hover:text-white"
              >
                Open in editor
              </button>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
