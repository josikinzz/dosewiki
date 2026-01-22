import { motion } from "framer-motion";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../common/Icon";

import type { SubstanceRecord } from "../../data/builders/contentBuilder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MoleculeAsset, RouteKey } from "../../types/content";
import { useArticles } from "../../data/SubstanceIndexProvider";
import { slugify } from "../../utils/slug";
import { JsonEditor } from "../common/JsonEditor";
import { SectionCard } from "../common/SectionCard";
import { UiJsonToggle } from "../common/UiJsonToggle";
import { HeroSection } from "../sections/HeroSection";
import { DosageDurationSection } from "../sections/DosageDurationSection";
import { InfoSections, InfoSectionItemCard } from "../sections/InfoSections";
import { SubjectiveEffectsSection } from "../sections/SubjectiveEffectsSection";
import { InteractionsSection } from "../sections/InteractionsSection";
import { ToleranceSection } from "../sections/ToleranceSection";
import { NotesSection } from "../sections/NotesSection";
import { CitationsSection } from "../sections/CitationsSection";
import { ReagentSection } from "../sections/ReagentSection";
import { PharmacologySection } from "../sections/PharmacologySection";
import { HistoryCultureSection } from "../sections/HistoryCultureSection";
import { LegalitySection } from "../sections/LegalitySection";
import { LegalitySection } from "../sections/LegalitySection";
import { HarmPotentialSection } from "../sections/HarmPotentialSection";
import { TripReportsSection } from "../sections/TripReportsSection";
import {
  extractInfoSectionBuckets,
  buildHeroVariantLines,
} from "../../utils/substanceLayout";
import { useDevMode } from "../dev/DevModeContext";
import { getMoleculeAssetsByArticleId } from "../../data/mappings/moleculeAssets";
import { cardAnimation } from "../../constants/motion";

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

const extractArticleId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

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
  const [desktopViewMode, setDesktopViewMode] = useState<"ui" | "json">("ui");
  const { content } = record;
  const { filteredInfoSections, moleculeIdentityEntries, moleculeCardEntries } = useMemo(
    () => extractInfoSectionBuckets(content.infoSections),
    [content.infoSections],
  );
  const [moleculeAssets, setMoleculeAssets] = useState<MoleculeAsset[]>([]);
  const [moleculeAsset, setMoleculeAsset] = useState<MoleculeAsset | null>(null);
  const { open: openDevMode } = useDevMode();
  const articles = useArticles();

  const heroVariantLines = useMemo(() => buildHeroVariantLines(content.nameVariants), [content.nameVariants]);
  const decoratedHeroVariantLines = useMemo(
    () =>
      heroVariantLines.map((line) => ({
        ...line,
        icon: line.kind === "botanical" ? "lucide:leaf" : "lucide:message-square-plus",
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
            <Button
              key={`${badge.label}-${badge.categoryKey}`}
              variant="ghostPill"
              size="chipXs"
              onClick={handleClick}
            >
              {badge.label}
            </Button>
          ) : (
            <Badge
              key={badge.label}
              variant="ghostPill"
            >
              {badge.label}
            </Badge>
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

  useEffect(() => {
    setDesktopViewMode("ui");
  }, [record.slug]);

  useEffect(() => {
    let isMounted = true;

    if (record.id === null) {
      setMoleculeAssets([]);
      setMoleculeAsset(null);
      return undefined;
    }

    getMoleculeAssetsByArticleId(record.id)
      .then((assets) => {
        if (!isMounted) {
          return;
        }
        setMoleculeAssets(assets);
        setMoleculeAsset(assets[0] ?? null);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setMoleculeAssets([]);
        setMoleculeAsset(null);
      });

    return () => {
      isMounted = false;
    };
  }, [record.id]);

  const rawArticle = useMemo(() => {
    if (record.id !== null) {
      const byId = articles.find((article) => extractArticleId(article?.id) === record.id);
      if (byId) {
        return byId;
      }
    }

    return articles.find((article) => {
      if (!article || typeof article !== "object") {
        return false;
      }

      // SubstanceArticle schema uses identification.common_name
      const commonName = article.identification?.common_name?.trim() ?? "";
      const title = typeof article.title === "string" ? article.title.trim() : "";
      const slugSource = commonName || title;

      if (!slugSource) {
        return false;
      }

      return slugify(slugSource) === record.slug;
    });
  }, [articles, record.id, record.slug]);

  const articleJsonString = useMemo(() => {
    const payload = rawArticle ?? {
      message: "Article JSON unavailable",
      slug: record.slug,
    };

    try {
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      if (error instanceof Error) {
        return JSON.stringify(
          {
            message: "Failed to serialize article JSON",
            reason: error.message,
            slug: record.slug,
          },
          null,
          2,
        );
      }

      return JSON.stringify({ message: "Failed to serialize article JSON", slug: record.slug }, null, 2);
    }
  }, [rawArticle, record.slug]);

  const handleOpenDevEditor = useCallback(() => {
    openDevMode({ tab: "tag-editor" });
  }, [openDevMode]);

  const handleDesktopViewModeChange = useCallback((mode: "ui" | "json") => {
    setDesktopViewMode(mode);
  }, []);

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
          moleculeAsset={moleculeAsset ?? undefined}
          moleculeAssets={moleculeAssets.length > 0 ? moleculeAssets : undefined}
          badges={content.heroBadges}
          badgeVariant="compact"
          onCategorySelect={onSelectCategory}
        />

        <main className="mx-auto max-w-3xl px-4 pb-20 md:max-w-4xl">
          <div className="space-y-10 md:space-y-12">
            {resolvedRouteKey ? (
              <DosageDurationSection article={content} />
            ) : null}

            {content.infoSections && content.infoSections.length > 0 ? (
              <InfoSections
                sections={content.infoSections}
                onMechanismSelect={onSelectMechanism}
                onClassificationSelect={onSelectClassification}
              />
            ) : null}

            <PharmacologySection article={content} onSelectMechanism={onSelectMechanism} />
            <ReagentSection substanceName={content.name} aliases={content.aliases} reagentTesting={content.reagentTesting} />
            <SubjectiveEffectsSection effects={content.subjectiveEffects} onEffectSelect={onSelectEffect} />
            <HarmPotentialSection article={content} />
            <InteractionsSection article={content} />
            <ToleranceSection tolerance={content.tolerance} />
            <HistoryCultureSection article={content} />
            <LegalitySection article={content} />
            <TripReportsSection article={content} />
            <NotesSection notes={content.notes} />
            <CitationsSection sourceCitations={content.sourceCitations} citations={content.citations} />
          </div>
        </main>
      </div>

      <div className="hidden xl:block">
        <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-12">
          <div className="space-y-10">
            {desktopBanner}
            <div className="grid gap-8 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
              <div className="space-y-8">
                {desktopViewMode === "ui" ? (
                  <>
                    <motion.div {...cardAnimation} className="relative">
                      {/* Decorative background glow */}
                      <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]" aria-hidden="true" />

                      <div className="relative">
                        <h1 className="font-display text-[2.5rem] font-bold tracking-tight text-fuchsia-300 xl:text-[3.5rem] leading-none">
                          {content.name}
                        </h1>
                        {hasHeroVariantLines ? (
                          <div className="mt-8 flex flex-col gap-3">
                            {decoratedHeroVariantLines.map((line) => (
                              <p key={line.key} className="flex flex-wrap items-center gap-3 text-sm text-white/70 md:text-base">
                                <line.Icon className="h-4 w-4 text-fuchsia-400/60" aria-hidden="true" focusable="false" />
                                <span className="flex flex-wrap items-center gap-2">
                                  {line.values.map((value, index) => (
                                    <span key={`${line.key}-${value}-${index}`} className="flex items-center gap-2">
                                      <span className="italic text-white/90">{value}</span>
                                      {index < line.values.length - 1 ? <span className="text-white/20">·</span> : null}
                                    </span>
                                  ))}
                                </span>
                              </p>
                            ))}
                          </div>
                        ) : hasAliases ? (
                          <p className="mt-6 text-lg text-white/60 tracking-tight leading-relaxed">{content.aliases.join(" · ")}</p>
                        ) : shouldShowSubtitle ? (
                          <p className="mt-6 text-lg text-white/60 tracking-tight leading-relaxed">{content.subtitle}</p>
                        ) : null}
                      </div>
                    </motion.div>

                    <motion.div
                      {...cardAnimation}
                      transition={{ ...cardAnimation.transition, delay: 0.1 }}
                      className="space-y-16"
                    >
                      {resolvedRouteKey ? (
                        <div className="space-y-8">
                          <DosageDurationSection article={content} />
                        </div>
                      ) : null}

                      <div className="space-y-16">
                        <section className="space-y-8">
                          <PharmacologySection article={content} onSelectMechanism={onSelectMechanism} />
                        </section>

                        <section className="space-y-8">
                          <ReagentSection substanceName={content.name} aliases={content.aliases} reagentTesting={content.reagentTesting} />
                        </section>

                        <section className="space-y-8">
                          <SubjectiveEffectsSection effects={content.subjectiveEffects} onEffectSelect={onSelectEffect} />
                        </section>

                        <section className="space-y-8">
                          <HarmPotentialSection article={content} />
                        </section>

                        <section className="space-y-8">
                          <InteractionsSection interactions={content.interactions} layoutVariant="stacked" />
                        </section>

                        <section className="space-y-8">
                          <ToleranceSection tolerance={content.tolerance} />
                        </section>

                        <section className="space-y-8">
                          <HistoryCultureSection article={content} />
                        </section>

                        <section className="space-y-8">
                          <LegalitySection article={content} />
                        </section>

                        <section className="space-y-8">
                          <TripReportsSection article={content} />
                        </section>

                        <section className="space-y-8">
                          <NotesSection notes={content.notes} />
                        </section>

                        <section className="space-y-8">
                          <CitationsSection sourceCitations={content.sourceCitations} citations={content.citations} />
                        </section>
                      </div>
                    </motion.div>
                  </>
                ) : (
                  <motion.div {...cardAnimation} className="space-y-4">
                    <p className="text-sm text-white/70">Viewing JSON for {content.name}.</p>
                    <div className="rounded-3xl border border-white/10 bg-black/40 p-1 backdrop-blur-xl">
                      <JsonEditor value={articleJsonString} readOnly minHeight={640} />
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="space-y-8">
                <motion.div
                  {...cardAnimation}
                  transition={{ ...cardAnimation.transition, delay: 0.2 }}
                  className="w-full max-w-[22rem] rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.05] via-transparent to-violet-500/[0.05] p-6 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-md"
                >
                  <div className="relative rounded-2xl border border-white/5 bg-[#0f0a1f]/80 p-5 shadow-inner">
                    <div className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/5 to-transparent rounded-2xl pointer-events-none" />
                    {moleculeAsset ? (
                      <img
                        src={moleculeAsset.url}
                        alt={`Molecule depiction for ${content.name}`}
                        className="relative h-56 w-full object-contain drop-shadow-[0_0_15px_rgba(217,70,239,0.2)]"
                      />
                    ) : (
                      <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#120d27] text-sm text-white/55">
                        {FALLBACK_MOLECULE_LABEL}
                      </div>
                    )}
                    {moleculeIdentityEntries.length > 0 ? (
                      <dl className="mt-8 space-y-5">
                        {moleculeIdentityEntries.map((item) => {
                          const normalizedLabel = item.label.toLowerCase().trim();
                          const key = `${normalizedLabel}-${item.value}`;
                          const valueNode = item.href ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs leading-snug text-fuchsia-300 underline-offset-4 transition hover:text-fuchsia-200 hover:underline"
                            >
                              {item.value}
                            </a>
                          ) : (
                            <span className="text-xs leading-snug text-white/85">{item.value}</span>
                          );

                          return (
                            <div key={key} className="space-y-1 text-left">
                              <dt className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">{item.label}</dt>
                              <dd>{valueNode}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    ) : null}
                  </div>
                  {moleculeCardEntries.length > 0 ? (
                    <div className="mt-8 space-y-4">
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
                </motion.div>

                <motion.div
                  {...cardAnimation}
                  transition={{ ...cardAnimation.transition, delay: 0.3 }}
                >
                  <SectionCard className="w-full max-w-[22rem] space-y-5 border-white/10 bg-white/[0.02] shadow-xl ring-1 ring-white/5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-500/20 text-fuchsia-300 shadow-lg shadow-fuchsia-500/10 ring-1 ring-fuchsia-500/30">
                        <Icon icon="lucide:wrench" size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold tracking-tight text-white/90">Curator Utils</h3>
                        <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Article Tools</p>
                      </div>
                    </div>
                    <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
                    <UiJsonToggle
                      mode={desktopViewMode}
                      onModeChange={handleDesktopViewModeChange}
                      className="mx-0"
                    />
                    <Button
                      variant="ghostPill"
                      size="chipXs"
                      onClick={handleOpenDevEditor}
                      className="self-start rounded-full bg-white/[0.03] border border-white/10 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/30 transition-all"
                    >
                      <Icon icon="lucide:edit-3" size={16} />
                      Open developer editor
                    </Button>
                  </SectionCard>
                </motion.div>

                {content.heroBadges && content.heroBadges.length > 0 ? (
                  <motion.div
                    {...cardAnimation}
                    transition={{ ...cardAnimation.transition, delay: 0.35 }}
                    className="w-full max-w-[22rem]"
                  >
                    {renderHeroBadgesDesktop()}
                  </motion.div>
                ) : null}

                {filteredInfoSections.length > 0 ? (
                  <motion.div
                    {...cardAnimation}
                    transition={{ ...cardAnimation.transition, delay: 0.4 }}
                  >
                    <InfoSections
                      sections={filteredInfoSections}
                      layoutVariant="single-column"
                      onMechanismSelect={onSelectMechanism}
                      onClassificationSelect={onSelectClassification}
                    />
                  </motion.div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
