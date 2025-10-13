import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { GlobalSearch } from "./components/common/GlobalSearch";
import { InteractionsPage } from "./components/pages/InteractionsPage";

const DEFAULT_SLUG = lsdMetadata.slug;
const DEFAULT_RECORD = substanceBySlug.get(DEFAULT_SLUG) ?? lsdMetadata;
const DEFAULT_VIEW: AppView = { type: "substances" };

export default function App() {
  const [view, setView] = useState<AppView>(() => parseHash(undefined, DEFAULT_SLUG, DEFAULT_VIEW));
  const [isSearchInHeader, setIsSearchInHeader] = useState(false);
  const [topSearchContainer, setTopSearchContainer] = useState<HTMLDivElement | null>(null);
  const [headerSearchContainer, setHeaderSearchContainer] = useState<HTMLDivElement | null>(null);
  const [searchTarget, setSearchTarget] = useState<HTMLDivElement | null>(null);
  const searchRootElementRef = useRef<HTMLDivElement | null>(null);
  const [reservedTopSearchHeight, setReservedTopSearchHeight] = useState<number>(0);
  const [isHeaderSearchVisible, setHeaderSearchVisible] = useState(false);
  const [isBodySearchVisible, setBodySearchVisible] = useState(true);
  const headerShowTimeoutRef = useRef<number | null>(null);
  const bodyMoveTimeoutRef = useRef<number | null>(null);
  const FADE_DURATION_MS = 200;

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

  const activeSlug = view.type === "substance" ? view.slug : DEFAULT_SLUG;
  const activeRecord = substanceBySlug.get(activeSlug) ?? DEFAULT_RECORD;
  const content = activeRecord.content;

  const handleInteractionSelectionChange = useCallback(
    (primarySlug: string, secondarySlug: string) => {
      navigate({ type: "interactions", primarySlug, secondarySlug });
    },
    [navigate],
  );

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

  useEffect(() => {
    const handleScroll = () => {
      setIsSearchInHeader(window.scrollY > 70);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsSearchInHeader(window.scrollY > 70);
  }, [view]);

  useEffect(() => {
    if (!topSearchContainer && !headerSearchContainer) {
      return;
    }

    if (headerShowTimeoutRef.current !== null) {
      window.clearTimeout(headerShowTimeoutRef.current);
      headerShowTimeoutRef.current = null;
    }

    if (bodyMoveTimeoutRef.current !== null) {
      window.clearTimeout(bodyMoveTimeoutRef.current);
      bodyMoveTimeoutRef.current = null;
    }

    const headerElement = headerSearchContainer;
    const topElement = topSearchContainer;

    if (isSearchInHeader) {
      setBodySearchVisible(false);

      if (headerElement && searchTarget !== headerElement) {
        setSearchTarget(headerElement);
      }

      setHeaderSearchVisible(false);

      if (headerElement) {
        headerShowTimeoutRef.current = window.setTimeout(() => {
          setHeaderSearchVisible(true);
          headerShowTimeoutRef.current = null;
        }, FADE_DURATION_MS);
      }

      return () => {
        if (headerShowTimeoutRef.current !== null) {
          window.clearTimeout(headerShowTimeoutRef.current);
          headerShowTimeoutRef.current = null;
        }
      };
    }

    setHeaderSearchVisible(false);

    if (!topElement) {
      return undefined;
    }

    if (!searchTarget) {
      setSearchTarget(topElement);
      setBodySearchVisible(true);
      return undefined;
    }

    if (searchTarget === topElement) {
      setBodySearchVisible(true);
      return undefined;
    }

    setBodySearchVisible(false);

    bodyMoveTimeoutRef.current = window.setTimeout(() => {
      setSearchTarget(topElement);
      requestAnimationFrame(() => {
        setBodySearchVisible(true);
      });
      bodyMoveTimeoutRef.current = null;
    }, FADE_DURATION_MS);

    return () => {
      if (bodyMoveTimeoutRef.current !== null) {
        window.clearTimeout(bodyMoveTimeoutRef.current);
        bodyMoveTimeoutRef.current = null;
      }
    };
  }, [isSearchInHeader, headerSearchContainer, topSearchContainer, searchTarget]);

  useEffect(() => () => {
    if (headerShowTimeoutRef.current !== null) {
      window.clearTimeout(headerShowTimeoutRef.current);
    }
    if (bodyMoveTimeoutRef.current !== null) {
      window.clearTimeout(bodyMoveTimeoutRef.current);
    }
  }, []);

  const storeSearchRoot = useCallback((node: HTMLDivElement | null) => {
    searchRootElementRef.current = node;
  }, []);

  useLayoutEffect(() => {
    const element = searchRootElementRef.current;
    if (!element) {
      return;
    }

    if (searchTarget === topSearchContainer) {
      const rect = element.getBoundingClientRect();
      setReservedTopSearchHeight(rect.height);
    }
  }, [searchTarget, topSearchContainer]);

  const handleTopSearchContainerRef = useCallback((node: HTMLDivElement | null) => {
    setTopSearchContainer(node);
  }, []);

  const handleHeaderSearchSlotChange = useCallback((node: HTMLDivElement | null) => {
    setHeaderSearchContainer(node);
  }, []);

  const isSearchTargetInHeader = searchTarget === headerSearchContainer;

  const searchContainerClassName = isSearchTargetInHeader
    ? `w-full px-2 sm:px-3 md:px-4 transition-opacity duration-200 ease-out ${
        isHeaderSearchVisible ? "opacity-100" : "opacity-0"
      }`
    : `mx-auto w-full max-w-3xl px-4 sm:px-6 transition-opacity duration-200 ease-out ${
        isBodySearchVisible ? "opacity-100" : "opacity-0"
      }`;

  const topSearchWrapperClassName = `transition-[max-height,padding,opacity] duration-200 ease-out ${
    isSearchInHeader
      ? "pointer-events-none max-h-32 px-4 pb-6 pt-4 opacity-0 md:pt-6"
      : "max-h-32 px-4 pb-6 pt-4 opacity-100 md:pt-6"
  }`;

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

      <Header
        currentView={view}
        defaultSlug={DEFAULT_SLUG}
        onNavigate={navigate}
        onSearchSlotChange={handleHeaderSearchSlotChange}
      />

      <div
        ref={handleTopSearchContainerRef}
        className={topSearchWrapperClassName}
        style={reservedTopSearchHeight > 0 ? {
          height: reservedTopSearchHeight,
          minHeight: reservedTopSearchHeight,
          maxHeight: reservedTopSearchHeight,
        } : undefined}
      />

      {searchTarget &&
        createPortal(
          <GlobalSearch
            currentView={view}
            onNavigate={navigate}
            containerClassName={searchContainerClassName}
            compact={isSearchTargetInHeader}
            onRootReady={storeSearchRoot}
          />,
          searchTarget,
        )}

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
      ) : view.type === "mechanism" ? (
        (() => {
          const detail = getMechanismDetail(view.mechanismSlug);
          if (!detail) {
            return (
              <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-24">
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
      ) : (
        <>
          <Hero
            title={content.name}
            subtitle={content.aliases.length > 0 ? undefined : content.subtitle}
            aliases={content.aliases}
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
  );
}
