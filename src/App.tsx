import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { HarmReductionBanner } from "./components/sections/HarmReductionBanner";
import { DosagesPage } from "./components/pages/DosagesPage";
import { CategoryPage } from "./components/pages/CategoryPage";
import { EffectsPage } from "./components/pages/EffectsPage";
import { EffectDetailPage } from "./components/pages/EffectDetailPage";
import { MechanismDetailPage } from "./components/pages/MechanismDetailPage";
import { SearchResultsPage } from "./components/pages/SearchResultsPage";
import { DevModePage } from "./components/pages/DevModePage";
import { AboutPage } from "./components/pages/AboutPage";
import {
  substanceRecords,
  substanceBySlug,
  dosageCategoryGroups,
  getCategoryDetail,
  findCategoryByKey,
  normalizeCategoryKey,
  effectSummaries,
  getEffectDetail,
  getEffectSummary,
  getMechanismDetail,
  getMechanismSummary,
} from "./data/library";
import { lsdMetadata } from "./data/lsd";
import { querySearch } from "./data/search";
import type { RouteKey } from "./types/content";
import type { AppView } from "./types/navigation";
import { parseHash, viewToHash } from "./utils/routing";
import { InteractionsPage } from "./components/pages/InteractionsPage";
import { UserProfilePage } from "./components/pages/UserProfilePage";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "./data/userProfiles";

const DEFAULT_SLUG = lsdMetadata.slug;
const DEFAULT_RECORD = substanceBySlug.get(DEFAULT_SLUG) ?? lsdMetadata;
const DEFAULT_VIEW: AppView = { type: "substances" };
const HARM_REDUCTION_DISMISS_KEY = "dosewiki:harmReductionBannerDismissed";

export default function App() {
  const [view, setView] = useState<AppView>(() => parseHash(undefined, DEFAULT_SLUG, DEFAULT_VIEW));
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(HARM_REDUCTION_DISMISS_KEY) === "true";
  });

  const isInvalidSubstanceView = view.type === "substance" && !substanceBySlug.has(view.slug);

  useEffect(() => {
    if (!isInvalidSubstanceView) {
      return;
    }

    const fallbackView: AppView = { type: "substance", slug: DEFAULT_SLUG };
    setView(fallbackView);

    if (typeof window !== "undefined") {
      const fallbackHash = viewToHash(fallbackView);
      if (window.location.hash !== fallbackHash) {
        window.history.replaceState(null, "", fallbackHash);
      }
    }
  }, [isInvalidSubstanceView]);

  const effectiveView = useMemo<AppView>(() => {
    if (isInvalidSubstanceView) {
      return { type: "substance", slug: DEFAULT_SLUG };
    }
    return view;
  }, [isInvalidSubstanceView, view]);

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

  const selectMechanism = useCallback(
    (mechanismSlug: string, qualifierSlug?: string) => {
      const summary = getMechanismSummary(mechanismSlug);
      if (!summary) {
        return;
      }

      if (qualifierSlug) {
        navigate({ type: "mechanism", mechanismSlug: summary.slug, qualifierSlug });
        return;
      }

      navigate({ type: "mechanism", mechanismSlug: summary.slug });
    },
    [navigate],
  );

  const activeSlug = effectiveView.type === "substance" ? effectiveView.slug : DEFAULT_SLUG;
  const activeRecord = substanceBySlug.get(activeSlug) ?? DEFAULT_RECORD;
  const content = activeRecord.content;

  const handleInteractionSelectionChange = useCallback(
    (primarySlug: string, secondarySlug: string) => {
      navigate({ type: "interactions", primarySlug, secondarySlug });
    },
    [navigate],
  );

  const dismissHarmReductionBanner = useCallback(() => {
    setIsBannerDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HARM_REDUCTION_DISMISS_KEY, "true");
    }
  }, []);

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

  const routePreferencesRef = useRef<Map<string, RouteKey>>(new Map());
  const [route, setRoute] = useState<RouteKey | undefined>(defaultRoute);

  useEffect(() => {
    if (!content) {
      if (route !== undefined) {
        setRoute(undefined);
      }
      return;
    }

    const storedRoute = routePreferencesRef.current.get(activeSlug);
    const validStoredRoute = storedRoute && content.routes[storedRoute] ? storedRoute : undefined;

    if (!validStoredRoute && storedRoute) {
      routePreferencesRef.current.delete(activeSlug);
    }

    const fallbackRoute = defaultRoute && content.routes[defaultRoute] ? defaultRoute : undefined;
    const nextRoute = validStoredRoute ?? fallbackRoute;

    if (route !== nextRoute) {
      setRoute(nextRoute);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug, content, defaultRoute]);

  const handleRouteChange = useCallback(
    (nextRoute: RouteKey) => {
      if (!content || !content.routes[nextRoute]) {
        return;
      }

      routePreferencesRef.current.set(activeSlug, nextRoute);
      setRoute(nextRoute);
    },
    [activeSlug, content],
  );

  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: 0, left: 0 });
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
    <div className="app-container relative bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f] text-white selection:bg-fuchsia-500/30">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <Header currentView={effectiveView} defaultSlug={DEFAULT_SLUG} onNavigate={navigate} />

      <div ref={contentScrollRef} className="app-content relative">
        {view.type === "dev" ? (
        <DevModePage activeTab={view.tab} onTabChange={(tab) => navigate({ type: "dev", tab })} />
      ) : view.type === "substances" ? (
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
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
      ) : view.type === "mechanism" ? (
        (() => {
          const detail = getMechanismDetail(view.mechanismSlug);
          if (!detail) {
            return (
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">Mechanism not found.</p>
                  <p className="mt-2 text-sm text-white/70">Select a mechanism badge from a substance to explore related entries.</p>
                </div>
              </main>
            );
          }

          return (
            <main>
              <MechanismDetailPage
                detail={detail}
                onSelectDrug={selectSubstance}
                onSelectCategory={selectCategory}
                onSelectMechanism={selectMechanism}
                activeQualifierSlug={view.qualifierSlug}
              />
            </main>
          );
        })()
      ) : view.type === "interactions" ? (
        <main>
          <InteractionsPage
            substances={substanceRecords}
            initialPrimarySlug={view.primarySlug}
            initialSecondarySlug={view.secondarySlug}
            onNavigateToSubstance={selectSubstance}
            onSelectionChange={handleInteractionSelectionChange}
          />
        </main>
      ) : view.type === "about" ? (
        <main>
          <AboutPage />
        </main>
      ) : view.type === "contributor" ? (
        (() => {
          const rawKey = view.profileKey.trim();
          const canonicalKey = rawKey.toUpperCase();
          const profile = getProfileByKey(canonicalKey);
          const history = buildProfileHistory(canonicalKey, 5);
          const isKnownProfile = profilesByKey.has(canonicalKey);

          if (!isKnownProfile && history.length === 0) {
            return (
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">Contributor not found.</p>
                  <p className="mt-2 text-sm text-white/70">
                    Check the profile key or request access via the Dev Tools workflow.
                  </p>
                </div>
              </main>
            );
          }

          return (
            <UserProfilePage
              profile={profile}
              history={history}
            />
          );
        })()
      ) : (
        <>
          {!isBannerDismissed && (
            <div className="mx-auto max-w-3xl px-4 pb-6 pt-6 md:max-w-4xl">
              <HarmReductionBanner citations={content.citations} onDismiss={dismissHarmReductionBanner} />
            </div>
          )}
          <Hero
            title={content.name}
            subtitle={content.aliases.length > 0 ? undefined : content.subtitle}
            aliases={content.aliases}
            placeholder={content.moleculePlaceholder}
            moleculeAsset={content.moleculeAsset}
            moleculeAssets={content.moleculeAssets}
            badges={content.heroBadges}
            badgeVariant="compact"
            onCategorySelect={selectCategory}
          />

          <main className="mx-auto max-w-3xl px-4 pb-20 md:max-w-4xl">
            <div className="space-y-10 md:space-y-12">
              {activeRouteKey && (
                <DosageDurationCard
                  route={activeRouteKey}
                  onRouteChange={handleRouteChange}
                  routes={content.routes}
                  routeOrder={content.routeOrder}
                  note={content.dosageUnitsNote}
                />
              )}

              {content.infoSections && content.infoSections.length > 0 && (
                <InfoSections
                  sections={content.infoSections}
                  onMechanismSelect={selectMechanism}
                />
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
    </div>
  );
}
