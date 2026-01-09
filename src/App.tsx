import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { HarmReductionBanner } from "./components/sections/HarmReductionBanner";
import { DosagesPage } from "./components/pages/DosagesPage";
import { CategoryPage } from "./components/pages/CategoryPage";
import { EffectsPage } from "./components/pages/EffectsPage";
import { EffectDetailPage } from "./components/pages/EffectDetailPage";
import { MechanismDetailPage } from "./components/pages/MechanismDetailPage";
import { ClassificationDetailPage } from "./components/pages/ClassificationDetailPage";
import { SearchResultsPage } from "./components/pages/SearchResultsPage";
import { DevModePage } from "./components/pages/DevModePage";
import { AboutPage } from "./components/pages/AboutPage";
import { useLibrary } from "./data/ArticlesProvider";
import { querySearchWithData } from "./data/builders/search";
import { RouteAnnouncer } from "./components/common/RouteAnnouncer";
import type { RouteKey } from "./types/content";
import type { AppView } from "./types/navigation";
import { parsePath, viewToPath } from "./utils/routing";
import { InteractionsPage } from "./components/pages/InteractionsPage";
import { UserProfilePage } from "./components/pages/UserProfilePage";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "./data/userProfiles";
import { SubstanceArticle } from "./components/pages/SubstanceArticle";

/**
 * Generate a human-readable page title for screen reader announcements.
 */
function getPageTitle(view: AppView, substanceBySlug: Map<string, { name: string }>): string {
  switch (view.type) {
    case "substances":
      return "Substance Index";
    case "substance": {
      const record = substanceBySlug.get(view.slug);
      return record ? `${record.name} - Substance Profile` : "Substance Profile";
    }
    case "category":
      return `${view.categoryKey} Category`;
    case "effects":
      return "Effects Index";
    case "effect":
      return `${view.effectSlug} Effect`;
    case "mechanism":
      return `${view.mechanismSlug} Mechanism`;
    case "classification":
      return `${view.slug} ${view.classification === "chemical" ? "Chemical" : "Psychoactive"} Class`;
    case "interactions":
      return "Drug Interactions";
    case "search":
      return `Search Results for "${view.query}"`;
    case "about":
      return "About dose.wiki";
    case "contributor":
      return `Contributor Profile`;
    case "dev":
      return `Developer Tools - ${view.tab}`;
    default:
      return "dose.wiki";
  }
}

const DEFAULT_VIEW: AppView = { type: "substances" };
const HARM_REDUCTION_DISMISS_KEY = "dosewiki:harmReductionBannerDismissed";

export default function App() {
  // Get library data from context
  const library = useLibrary();
  const {
    substanceRecords,
    substanceBySlug,
    dosageCategoryGroups,
    effectSummaries,
    getCategoryDetail,
    findCategoryByKey,
    normalizeCategoryKey,
    getEffectDetail,
    getEffectSummary,
    getMechanismDetail,
    getMechanismSummary,
    getChemicalClassDetail,
    getPsychoactiveClassDetail,
  } = library;

  // Compute default slug from substance records
  const defaultSlug = useMemo(() => {
    // Try to find LSD first
    const lsd = substanceRecords.find(
      (r) => r.slug === "lsd" || r.name.toLowerCase() === "lsd",
    );
    if (lsd) return lsd.slug;

    // Fall back to first substance
    return substanceRecords[0]?.slug ?? null;
  }, [substanceRecords]);

  const [view, setView] = useState<AppView>(() => parsePath(undefined, defaultSlug, DEFAULT_VIEW));
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(HARM_REDUCTION_DISMISS_KEY) === "true";
  });

  const isInvalidSubstanceView = view.type === "substance" &&
    (defaultSlug === null || !substanceBySlug.has(view.slug));

  useEffect(() => {
    if (!isInvalidSubstanceView) {
      return;
    }

    if (defaultSlug) {
      const fallbackView: AppView = { type: "substance", slug: defaultSlug };
      setView(fallbackView);

      if (typeof window !== "undefined") {
        const fallbackPath = viewToPath(fallbackView);
        if (window.location.pathname !== fallbackPath) {
          window.history.replaceState(null, "", fallbackPath);
        }
      }
    } else {
      // No substances exist - redirect to index
      setView({ type: "substances" });
      if (typeof window !== "undefined" && window.location.pathname !== "/substances") {
        window.history.replaceState(null, "", "/substances");
      }
    }
  }, [isInvalidSubstanceView]);

  const effectiveView = useMemo<AppView>(() => {
    if (isInvalidSubstanceView) {
      if (defaultSlug) {
        return { type: "substance", slug: defaultSlug };
      }
      return { type: "substances" };
    }
    return view;
  }, [isInvalidSubstanceView, view]);

  useEffect(() => {
    const handlePopState = () => {
      setView(parsePath(undefined, defaultSlug, DEFAULT_VIEW));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextView: AppView) => {
    const nextPath = viewToPath(nextView);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
      setView(nextView);
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
  }, [navigate, normalizeCategoryKey, findCategoryByKey]);

  const selectEffect = useCallback((identifier: string) => {
    const summary = getEffectSummary(identifier);
    if (summary) {
      navigate({ type: "effect", effectSlug: summary.slug });
    }
  }, [navigate, getEffectSummary]);

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
    [navigate, getMechanismSummary],
  );

  const selectClassification = useCallback(
    (classification: "chemical" | "psychoactive", label: string) => {
      const detail = classification === "chemical"
        ? getChemicalClassDetail(label)
        : getPsychoactiveClassDetail(label);

      if (!detail) {
        return;
      }

      navigate({ type: "classification", classification, slug: detail.slug });
    },
    [navigate, getChemicalClassDetail, getPsychoactiveClassDetail],
  );

  const activeSlug = effectiveView.type === "substance" ? effectiveView.slug : defaultSlug;
  const activeRecord = activeSlug ? substanceBySlug.get(activeSlug) ?? null : null;
  const content = activeRecord?.content ?? null;

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

    const storedRoute = activeSlug ? routePreferencesRef.current.get(activeSlug) : undefined;
    const validStoredRoute = storedRoute && content.routes[storedRoute] ? storedRoute : undefined;

    if (!validStoredRoute && storedRoute && activeSlug) {
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
      if (!content || !content.routes[nextRoute] || !activeSlug) {
        return;
      }

      routePreferencesRef.current.set(activeSlug, nextRoute);
      setRoute(nextRoute);
    },
    [activeSlug, content],
  );

  // Ref for main content focus management
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: 0, left: 0 });

    // Move focus to main content on navigation (skip DevMode to preserve editing focus)
    if (view.type !== "dev" && mainRef.current) {
      mainRef.current.focus();
    }
  }, [view]);

  // Generate page title for screen reader announcements
  const pageTitle = useMemo(
    () => getPageTitle(effectiveView, substanceBySlug),
    [effectiveView, substanceBySlug],
  );

  // Update canonical link and document title for SEO
  useEffect(() => {
    const path = viewToPath(effectiveView);
    const canonicalUrl = `https://dose.wiki${path}`;

    // Update or create canonical link
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    // Update document title
    document.title = effectiveView.type === "substances"
      ? "dose.wiki - Substance Information Database"
      : `${pageTitle} | dose.wiki`;
  }, [effectiveView, pageTitle]);

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
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-fuchsia-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:ring-offset-2 focus:ring-offset-[#0f0a1f]"
      >
        Skip to main content
      </a>

      {/* Route announcer for screen readers */}
      <RouteAnnouncer message={pageTitle} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <Header currentView={effectiveView} defaultSlug={defaultSlug} onNavigate={navigate} />

      <div ref={contentScrollRef} className="app-content relative">
        {view.type === "dev" ? (
          <DevModePage
            activeTab={view.tab}
            initialArticleSlug={view.slug}
            onTabChange={(tab) => navigate({ type: "dev", tab })}
          />
        ) : view.type === "substances" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
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
              <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <CategoryPage detail={detail} onSelectDrug={selectSubstance} />
            </main>
          );
        })()
      ) : view.type === "search" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <SearchResultsPage
            query={view.query}
            results={querySearchWithData(view.query, library)}
            onSelectSubstance={selectSubstance}
            onSelectCategory={selectCategory}
            onSelectEffect={selectEffect}
          />
        </main>
      ) : view.type === "effects" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <EffectsPage effects={effectSummaries} onSelectEffect={selectEffect} />
        </main>
      ) : view.type === "effect" ? (
        (() => {
          const detail = getEffectDetail(view.effectSlug);
          if (!detail) {
            return (
              <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
            <main id="main-content" ref={mainRef} tabIndex={-1}>
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
              <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">Mechanism not found.</p>
                  <p className="mt-2 text-sm text-white/70">Select a mechanism badge from a substance to explore related entries.</p>
                </div>
              </main>
            );
          }

          return (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
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
      ) : view.type === "classification" ? (
        (() => {
          const detail =
            view.classification === "chemical"
              ? getChemicalClassDetail(view.slug)
              : getPsychoactiveClassDetail(view.slug);

          if (!detail) {
            const descriptor = view.classification === "chemical" ? "Chemical class" : "Psychoactive class";
            return (
              <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
                  <p className="text-lg font-semibold text-white">{descriptor} not found.</p>
                  <p className="mt-2 text-sm text-white/70">Select a class tag from a substance profile to view related entries.</p>
                </div>
              </main>
            );
          }

          return (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <ClassificationDetailPage detail={detail} onSelectDrug={selectSubstance} />
            </main>
          );
        })()
      ) : view.type === "interactions" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <InteractionsPage
            substances={substanceRecords}
            initialPrimarySlug={view.primarySlug}
            initialSecondarySlug={view.secondarySlug}
            onNavigateToSubstance={selectSubstance}
            onSelectionChange={handleInteractionSelectionChange}
          />
        </main>
      ) : view.type === "about" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
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
              <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
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
      ) : activeRecord && content ? (
        (() => {
          const harmReductionBannerNode = isBannerDismissed
            ? null
            : (
              <HarmReductionBanner
                citations={content.citations}
                onDismiss={dismissHarmReductionBanner}
              />
            );

          return (
            <SubstanceArticle
              record={activeRecord}
              activeRouteKey={activeRouteKey}
              onRouteChange={handleRouteChange}
              onSelectCategory={selectCategory}
              onSelectEffect={selectEffect}
              onSelectMechanism={selectMechanism}
              onSelectClassification={selectClassification}
              harmReductionBanner={harmReductionBannerNode}
            />
          );
        })()
      ) : (
        <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
            <p className="text-lg font-semibold text-white">No substances in database.</p>
            <p className="mt-2 text-sm text-white/70">
              Use DevMode to generate and add new articles.
            </p>
          </div>
        </main>
      )}

        <Footer />
      </div>
    </div>
  );
}
