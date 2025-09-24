import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { Hero } from "./components/sections/Hero";
import { DosageDurationCard } from "./components/sections/DosageDurationCard";
import { InfoSections } from "./components/sections/InfoSections";
import { AddictionCard } from "./components/sections/AddictionCard";
import { SubjectiveEffectsSection } from "./components/sections/SubjectiveEffectsSection";
import { InteractionsSection } from "./components/sections/InteractionsSection";
import { ToleranceSection } from "./components/sections/ToleranceSection";
import { NotesSection } from "./components/sections/NotesSection";
import { CitationsSection } from "./components/sections/CitationsSection";
import { DosagesPage } from "./components/pages/DosagesPage";
import { CategoryPage } from "./components/pages/CategoryPage";
import { EffectsPage } from "./components/pages/EffectsPage";
import { EffectDetailPage } from "./components/pages/EffectDetailPage";
import { SearchResultsPage } from "./components/pages/SearchResultsPage";
import {
  substanceBySlug,
  dosageCategoryGroups,
  getCategoryDetail,
  findCategoryByKey,
  normalizeCategoryKey,
  effectSummaries,
  getEffectDetail,
  getEffectSummary,
} from "./data/library";
import { lsdMetadata } from "./data/lsd";
import { querySearch } from "./data/search";
import type { RouteKey } from "./types/content";
import type { AppView } from "./types/navigation";
import { parseHash, viewToHash } from "./utils/routing";
import { GlobalSearch } from "./components/common/GlobalSearch";

const DEFAULT_SLUG = lsdMetadata.slug;
const DEFAULT_RECORD = substanceBySlug.get(DEFAULT_SLUG) ?? lsdMetadata;
const DEFAULT_VIEW: AppView = { type: "substances" };

export default function App() {
  const [view, setView] = useState<AppView>(() => parseHash(undefined, DEFAULT_SLUG, DEFAULT_VIEW));

  useEffect(() => {
    const handleHashChange = () => {
      setView(parseHash(undefined, DEFAULT_SLUG, DEFAULT_VIEW));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = useCallback((nextView: AppView) => {
    const nextHash = viewToHash(nextView);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      setView(nextView);
    }
  }, []);

  const selectSubstance = useCallback((slug: string) => {
    navigate({ type: "substance", slug });
  }, [navigate]);

  const selectCategory = useCallback((identifier: string) => {
    const key = normalizeCategoryKey(identifier);
    const definition = findCategoryByKey(key);
    if (definition) {
      navigate({ type: "category", categoryKey: definition.key });
    }
  }, [navigate]);

  const selectEffect = useCallback((identifier: string) => {
    const summary = getEffectSummary(identifier);
    if (summary) {
      navigate({ type: "effect", effectSlug: summary.slug });
    }
  }, [navigate]);

  const activeSlug = view.type === "substance" ? view.slug : DEFAULT_SLUG;
  const activeRecord = substanceBySlug.get(activeSlug) ?? DEFAULT_RECORD;
  const content = activeRecord.content;

  const defaultRoute = useMemo<RouteKey | undefined>(() => {
    if (!content) {
      return undefined;
    }

    const primaryRoute = content.routeOrder[0];
    if (primaryRoute && content.routes[primaryRoute]) {
      return primaryRoute;
    }

    const firstAvailable = Object.keys(content.routes)[0] as RouteKey | undefined;
    return firstAvailable;
  }, [content]);

  const [route, setRoute] = useState<RouteKey | undefined>(defaultRoute);

  useEffect(() => {
    setRoute(defaultRoute);
  }, [defaultRoute, activeSlug]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [view]);

  const activeRouteKey: RouteKey | undefined = useMemo(() => {
    if (!content || !defaultRoute) {
      return undefined;
    }

    if (route && content.routes[route]) {
      return route;
    }

    if (defaultRoute && content.routes[defaultRoute]) {
      return defaultRoute;
    }

    return undefined;
  }, [route, defaultRoute, content]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f] text-white selection:bg-fuchsia-500/30">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <Header currentView={view} defaultSlug={DEFAULT_SLUG} onNavigate={navigate} />

      <div className="px-4 pb-6 pt-4 md:pt-6">
        <GlobalSearch currentView={view} onNavigate={navigate} />
      </div>

      {view.type === "substances" ? (
        <main>
          <DosagesPage
            groups={dosageCategoryGroups}
            onSelectDrug={selectSubstance}
            onSelectCategory={selectCategory}
          />
        </main>
      ) : view.type === "category" ? (
        (() => {
          const detail = getCategoryDetail(view.categoryKey);
          if (!detail) {
            return (
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-24">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">Category not found.</p>
                  <p className="mt-2 text-sm text-white/70">
                    Try selecting a category from the Substances index.
                  </p>
                </div>
              </main>
            );
          }

          return (
            <main>
              <CategoryPage detail={detail} onSelectDrug={selectSubstance} />
            </main>
          );
        })()
      ) : view.type === "search" ? (
        <main>
          <SearchResultsPage
            query={view.query}
            results={querySearch(view.query)}
            onSelectSubstance={selectSubstance}
            onSelectCategory={selectCategory}
            onSelectEffect={selectEffect}
          />
        </main>
      ) : view.type === "effects" ? (
        <main>
          <EffectsPage effects={effectSummaries} onSelectEffect={selectEffect} />
        </main>
      ) : view.type === "effect" ? (
        (() => {
          const detail = getEffectDetail(view.effectSlug);
          if (!detail) {
            return (
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-24">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">Effect not found.</p>
                  <p className="mt-2 text-sm text-white/70">
                    Browse the effects catalog to choose another entry.
                  </p>
                </div>
              </main>
            );
          }

          return (
            <main>
              <EffectDetailPage
                detail={detail}
                onSelectDrug={selectSubstance}
                onSelectCategory={selectCategory}
              />
            </main>
          );
        })()
      ) : view.type === "interactions" || view.type === "about" ? (
        <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-24">
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
            <p className="text-lg font-semibold text-white">This section is under construction.</p>
            <p className="mt-2 text-sm text-white/70">
              Check back soon for detailed {view.type === "interactions" ? "interaction" : "about"} content updates.
            </p>
          </div>
        </main>
      ) : (
        <>
          <Hero
            title={content.name}
            subtitle={content.subtitle}
            placeholder={content.moleculePlaceholder}
            badges={content.heroBadges}
            onCategorySelect={selectCategory}
          />

          <main className="mx-auto max-w-3xl px-4 pb-20 md:max-w-4xl">
            <div className="space-y-10 md:space-y-12">
              {activeRouteKey && (
                <DosageDurationCard
                  route={activeRouteKey}
                  onRouteChange={(nextRoute) => setRoute(nextRoute)}
                  routes={content.routes}
                  routeOrder={content.routeOrder}
                  note={content.dosageUnitsNote}
                />
              )}

              {content.infoSections && content.infoSections.length > 0 && (
                <InfoSections sections={content.infoSections} />
              )}

              <SubjectiveEffectsSection
                effects={content.subjectiveEffects}
                onEffectSelect={selectEffect}
              />
              <AddictionCard summary={content.addictionSummary} />
              <InteractionsSection interactions={content.interactions} />
              <ToleranceSection tolerance={content.tolerance} />
              <NotesSection notes={content.notes} />
              <CitationsSection citations={content.citations} />
            </div>
          </main>
        </>
      )}

      <Footer />
    </div>
  );
}


