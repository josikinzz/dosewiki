import { ReactNode, useMemo } from "react";
import { Leaf, MessageSquarePlus } from "lucide-react";

import type { SubstanceRecord } from "../../data/contentBuilder";
import type { RouteKey } from "../../types/content";
import { Hero } from "../sections/Hero";
import { DosageDurationCard } from "../sections/DosageDurationCard";
import { InfoSections, InfoSectionItemCard } from "../sections/InfoSections";
import { SubjectiveEffectsSection } from "../sections/SubjectiveEffectsSection";
import { InteractionsSection } from "../sections/InteractionsSection";
import { ToleranceSection } from "../sections/ToleranceSection";
import { AddictionCard } from "../sections/AddictionCard";
import { NotesSection } from "../sections/NotesSection";
import { CitationsSection } from "../sections/CitationsSection";
import {
  extractInfoSectionBuckets,
  buildHeroVariantLines,
} from "../../utils/substanceLayout";

interface SubstanceArticleProps {
  record: SubstanceRecord;
  activeRouteKey?: RouteKey;
  onRouteChange: (route: RouteKey) => void;
  onSelectCategory: (categoryKey: string) => void;
  onSelectEffect: (effect: string) => void;
  onSelectMechanism: (mechanismSlug: string, qualifierSlug?: string) => void;
  onSelectClassification: (classification: "chemical" | "psychoactive", label: string) => void;
  harmReductionBanner?: ReactNode;
}

const FALLBACK_MOLECULE_LABEL = "Molecule artwork unavailable";

export function SubstanceArticle({
  record,
  activeRouteKey,
  onRouteChange,
  onSelectCategory,
  onSelectEffect,
  onSelectMechanism,
  onSelectClassification,
  harmReductionBanner,
}: SubstanceArticleProps) {
  const { content } = record;
  const { filteredInfoSections, moleculeIdentityEntries, moleculeCardEntries } = useMemo(
    () => extractInfoSectionBuckets(content.infoSections),
    [content.infoSections],
  );

  const heroVariantLines = useMemo(() => buildHeroVariantLines(content.nameVariants), [content.nameVariants]);
  const decoratedHeroVariantLines = useMemo(
    () =>
      heroVariantLines.map((line) => ({
        ...line,
        Icon: line.kind === "botanical" ? Leaf : MessageSquarePlus,
      })),
    [heroVariantLines],
  );

  const hasHeroVariantLines = decoratedHeroVariantLines.length > 0;
  const hasAliases = content.aliases.length > 0;
  const shouldShowSubtitle = Boolean(content.subtitle) && !hasHeroVariantLines && !hasAliases;

  const fallbackRoute = content.routeOrder[0];
  const resolvedRouteKey = useMemo<RouteKey | undefined>(() => {
    if (activeRouteKey && content.routes[activeRouteKey]) {
      return activeRouteKey;
    }
    if (fallbackRoute && content.routes[fallbackRoute]) {
      return fallbackRoute;
    }
    return undefined;
  }, [activeRouteKey, content.routes, fallbackRoute]);

  const renderHeroBadgesDesktop = () => {
    if (!content.heroBadges || content.heroBadges.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-wrap gap-2 pt-4">
        {content.heroBadges.map((badge) => {
          const handleClick = () => {
            if (badge.categoryKey) {
              onSelectCategory(badge.categoryKey);
            }
          };

          return badge.categoryKey ? (
            <button
              key={`${badge.label}-${badge.categoryKey}`}
              type="button"
              onClick={handleClick}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.35em] text-white/70 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {badge.label}
            </button>
          ) : (
            <span
              key={badge.label}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.35em] text-white/70"
            >
              {badge.label}
            </span>
          );
        })}
      </div>
    );
  };

  const mobileBanner = harmReductionBanner ? (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-6 md:max-w-4xl">{harmReductionBanner}</div>
  ) : null;

  const desktopBanner = harmReductionBanner ? (
    <div className="max-w-3xl">{harmReductionBanner}</div>
  ) : null;

  return (
    <div>
      <div className="xl:hidden">
        {mobileBanner}
        <Hero
          title={content.name}
          subtitle={content.subtitle}
          aliases={content.aliases}
          nameVariants={content.nameVariants}
          placeholder={content.moleculePlaceholder}
          moleculeAsset={content.moleculeAsset}
          moleculeAssets={content.moleculeAssets}
          badges={content.heroBadges}
          badgeVariant="compact"
          onCategorySelect={onSelectCategory}
        />

        <main className="mx-auto max-w-3xl px-4 pb-20 md:max-w-4xl">
          <div className="space-y-10 md:space-y-12">
            {resolvedRouteKey ? (
              <DosageDurationCard
                route={resolvedRouteKey}
                onRouteChange={onRouteChange}
                routes={content.routes}
                routeOrder={content.routeOrder}
                note={content.dosageUnitsNote}
              />
            ) : null}

            {content.infoSections && content.infoSections.length > 0 ? (
              <InfoSections
                sections={content.infoSections}
                onMechanismSelect={onSelectMechanism}
                onClassificationSelect={onSelectClassification}
              />
            ) : null}

            <SubjectiveEffectsSection effects={content.subjectiveEffects} onEffectSelect={onSelectEffect} />
            <AddictionCard summary={content.addictionSummary} />
            <InteractionsSection interactions={content.interactions} />
            <ToleranceSection tolerance={content.tolerance} />
            <NotesSection notes={content.notes} />
            <CitationsSection citations={content.citations} />
          </div>
        </main>
      </div>

      <div className="hidden xl:block">
        <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-12">
          <div className="space-y-10">
            {desktopBanner}
            <div className="grid gap-8 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
              <div className="space-y-8">
                <div>
                  <h1 className="text-4xl font-semibold text-fuchsia-300 xl:text-5xl">{content.name}</h1>
                  {hasHeroVariantLines ? (
                    <div className="mt-4 flex flex-col gap-2">
                      {decoratedHeroVariantLines.map((line) => (
                        <p key={line.key} className="flex flex-wrap items-center gap-2 text-sm text-white/80 md:text-base">
                          <line.Icon className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
                          <span className="flex flex-wrap items-center gap-2 text-white/80">
                            {line.values.map((value, index) => (
                              <span key={`${line.key}-${value}-${index}`} className="flex items-center gap-2">
                                <span className="italic">{value}</span>
                                {index < line.values.length - 1 ? <span className="text-white/60">·</span> : null}
                              </span>
                            ))}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : hasAliases ? (
                    <p className="mt-4 text-base text-white/80">{content.aliases.join(" · ")}</p>
                  ) : shouldShowSubtitle ? (
                    <p className="mt-4 text-base text-white/80">{content.subtitle}</p>
                  ) : null}
                </div>

                {resolvedRouteKey ? (
                  <DosageDurationCard
                    route={resolvedRouteKey}
                    onRouteChange={onRouteChange}
                    routes={content.routes}
                    routeOrder={content.routeOrder}
                    note={content.dosageUnitsNote}
                  />
                ) : null}

                <SubjectiveEffectsSection effects={content.subjectiveEffects} onEffectSelect={onSelectEffect} />
                <InteractionsSection interactions={content.interactions} layoutVariant="stacked" />
                <ToleranceSection tolerance={content.tolerance} />
                <AddictionCard summary={content.addictionSummary} />
                <NotesSection notes={content.notes} />
                <CitationsSection citations={content.citations} />
                {renderHeroBadgesDesktop()}
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
                              <dt className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">{item.label}</dt>
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
                          onMechanismSelect={onSelectMechanism}
                          onClassificationSelect={onSelectClassification}
                          headingClassName="flex items-center gap-2 text-base font-semibold leading-tight text-fuchsia-300"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                {filteredInfoSections.length > 0 ? (
                  <InfoSections
                    sections={filteredInfoSections}
                    layoutVariant="single-column"
                    onMechanismSelect={onSelectMechanism}
                    onClassificationSelect={onSelectClassification}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
