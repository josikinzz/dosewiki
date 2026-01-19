import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { DosagesPage } from "./components/pages/DosagesPage";
import { useLightweightData } from "./data/LightweightDataProvider";
import { useLazyLibrary } from "./hooks/useLazyLibrary";
import { querySearchWithData } from "./data/builders/search";
import { RouteAnnouncer } from "./components/common/RouteAnnouncer";
import type { AppView } from "./types/navigation";
import { parsePath, viewToPath } from "./utils/routing";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "./data/userProfiles";
import { slugify } from "./utils/slug";

// Lazy load page components - only loaded when navigated to
const CategoryPage = lazy(() => import("./components/pages/CategoryPage").then(mod => ({ default: mod.CategoryPage })));
const EffectsIndexPage = lazy(() => import("./components/pages/EffectsIndexPage").then(mod => ({ default: mod.EffectsIndexPage })));
const EffectArticlePage = lazy(() => import("./components/pages/EffectArticlePage").then(mod => ({ default: mod.EffectArticlePage })));
const EffectCategoryPage = lazy(() => import("./components/pages/EffectCategoryPage").then(mod => ({ default: mod.EffectCategoryPage })));
const MechanismDetailPage = lazy(() => import("./components/pages/MechanismDetailPage").then(mod => ({ default: mod.MechanismDetailPage })));
const ClassificationDetailPage = lazy(() => import("./components/pages/ClassificationDetailPage").then(mod => ({ default: mod.ClassificationDetailPage })));
const SearchResultsPage = lazy(() => import("./components/pages/SearchResultsPage").then(mod => ({ default: mod.SearchResultsPage })));
const AboutPage = lazy(() => import("./components/pages/AboutPage").then(mod => ({ default: mod.AboutPage })));
const TripReportsPage = lazy(() => import("./components/pages/TripReportsPage").then(mod => ({ default: mod.TripReportsPage })));
const TripReportDetailPage = lazy(() => import("./components/pages/TripReportDetailPage").then(mod => ({ default: mod.TripReportDetailPage })));
const DataPage = lazy(() => import("./components/pages/DataPage").then(mod => ({ default: mod.DataPage })));
const UserProfilePage = lazy(() => import("./components/pages/UserProfilePage").then(mod => ({ default: mod.UserProfilePage })));
const SubstanceArticlePage = lazy(() => import("./components/pages/SubstanceArticlePage").then(mod => ({ default: mod.SubstanceArticlePage })));
const DevModePage = lazy(() => import("./components/pages/DevModePage").then(mod => ({ default: mod.DevModePage })));

/** Loading fallback for lazy-loaded pages */
function PageLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
        <p className="text-sm text-white/60">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Generate a human-readable page title for screen reader announcements.
 */
function getPageTitle(view: AppView, lookup: Map<string, { name: string }>): string {
  switch (view.type) {
    case "substances":
      return "Substance Index";
    case "substance": {
      const record = lookup.get(view.slug);
      return record ? `${record.name} - Substance Profile` : "Substance Profile";
    }
    case "category":
      return `${view.categoryKey} Category`;
    case "effects":
      return "Subjective Effects Index";
    case "effect":
      return `${view.effectSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} - Subjective Effect`;
    case "effect-category":
      return `${view.categorySlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Effects`;
    case "mechanism":
      return `${view.mechanismSlug} Mechanism`;
    case "classification":
      return `${view.slug} ${view.classification === "chemical" ? "Chemical" : "Psychoactive"} Class`;
    case "search":
      return `Search Results for "${view.query}"`;
    case "about":
      return "About dose.wiki";
    case "contributor":
      return `Contributor Profile`;
    case "reports":
      return "Trip Reports";
    case "report":
      return `Trip Report`;
    case "data":
      return "Download";
    case "dev":
      return `Developer Tools - ${view.tab}`;
    default:
      return "dose.wiki";
  }
}

const DEFAULT_VIEW: AppView = { type: "substances" };
const DEFAULT_SUBSTANCE_SLUG = "lsd";

export default function App() {
  // Lightweight data - always available (loaded in main.tsx)
  const { lookup, substances } = useLightweightData();

  // Parse initial view from URL - no validation needed
  const [view, setView] = useState<AppView>(() => parsePath(undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW));
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  // Determine if we need the full library for this view
  const needsFullLibrary = useMemo(() => {
    return (
      view.type === "mechanism" ||
      view.type === "classification" ||
      view.type === "category" ||
      view.type === "search"
    );
  }, [view.type]);

  // Lazy-load library only for pages that need it
  const { library, isLoading: libraryLoading } = useLazyLibrary(needsFullLibrary);

  useEffect(() => {
    const handlePopState = () => {
      setView(parsePath(undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW));
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
    // Simplified - just navigate directly with the key
    const key = slugify(identifier);
    navigate({ type: "category", categoryKey: key || identifier });
  }, [navigate]);

  const selectEffect = useCallback((identifier: string) => {
    const slug = slugify(identifier);
    navigate({ type: "effect", effectSlug: slug || identifier });
  }, [navigate]);

  const selectMechanism = useCallback(
    (mechanismSlug: string, qualifierSlug?: string) => {
      const slug = slugify(mechanismSlug);
      if (qualifierSlug) {
        navigate({ type: "mechanism", mechanismSlug: slug || mechanismSlug, qualifierSlug });
      } else {
        navigate({ type: "mechanism", mechanismSlug: slug || mechanismSlug });
      }
    },
    [navigate],
  );

  const selectClassification = useCallback(
    (classification: "chemical" | "psychoactive", label: string) => {
      const slug = slugify(label);
      navigate({ type: "classification", classification, slug: slug || label });
    },
    [navigate],
  );

  const activeSlug = view.type === "substance" ? view.slug : null;

  // Search results - only computed when library is available and we're on search page
  const searchResults = useMemo(() => {
    if (view.type !== "search" || !library) {
      return [];
    }
    return querySearchWithData(view.query, library);
  }, [view, library]);

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
    () => getPageTitle(view, lookup),
    [view, lookup],
  );

  // Update canonical link and document title for SEO
  useEffect(() => {
    const path = viewToPath(view);
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
    document.title = view.type === "substances"
      ? "dose.wiki - Substance Information Database"
      : `${pageTitle} | dose.wiki`;
  }, [view, pageTitle]);

  // Show loading for library-dependent pages
  const showLibraryLoading = needsFullLibrary && libraryLoading;

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

      <Header currentView={view} onNavigate={navigate} />

      <div ref={contentScrollRef} className="app-content relative">
        {view.type === "dev" ? (
          <Suspense fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
                <p className="text-sm text-white/60">Loading Developer Tools...</p>
              </div>
            </div>
          }>
            <DevModePage
              activeTab={view.tab}
              initialArticleSlug={view.slug}
              onTabChange={(tab) => navigate({ type: "dev", tab })}
            />
          </Suspense>
        ) : view.type === "substances" ? (
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <DosagesPage
              onSelectDrug={selectSubstance}
              onSelectCategory={selectCategory}
            />
          </main>
        ) : view.type === "category" ? (
          showLibraryLoading ? (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          ) : library ? (
            (() => {
              const detail = library.getCategoryDetail(view.categoryKey);
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
                  <Suspense fallback={<PageLoadingFallback />}>
                    <CategoryPage
                      detail={detail}
                      onSelectDrug={selectSubstance}
                      onNavigate={(path) => navigate(parsePath(path, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW))}
                      onSelectEffect={selectEffect}
                    />
                  </Suspense>
                </main>
              );
            })()
          ) : (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          )
        ) : view.type === "search" ? (
          showLibraryLoading ? (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          ) : (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <Suspense fallback={<PageLoadingFallback />}>
                <SearchResultsPage
                  query={view.query}
                  results={searchResults}
                  onSelectSubstance={selectSubstance}
                  onSelectCategory={selectCategory}
                  onSelectEffect={selectEffect}
                />
              </Suspense>
            </main>
          )
        ) : view.type === "effects" ? (
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <Suspense fallback={<PageLoadingFallback />}>
              <EffectsIndexPage onSelectEffect={selectEffect} />
            </Suspense>
          </main>
        ) : view.type === "effect-category" ? (
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <Suspense fallback={<PageLoadingFallback />}>
              <EffectCategoryPage
                categorySlug={view.categorySlug}
                onSelectEffect={selectEffect}
                onNavigateBack={() => navigate({ type: "effects" })}
              />
            </Suspense>
          </main>
        ) : view.type === "effect" ? (
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <Suspense fallback={<PageLoadingFallback />}>
              <EffectArticlePage
                effectSlug={view.effectSlug}
                getEffectDetail={library?.getEffectDetail ?? (() => null)}
                onNavigate={(path) => {
                  const parsed = parsePath(path, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW);
                  navigate(parsed);
                }}
                onSelectDrug={selectSubstance}
                onSelectCategory={selectCategory}
              />
            </Suspense>
          </main>
        ) : view.type === "mechanism" ? (
          showLibraryLoading ? (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          ) : library ? (
            (() => {
              const detail = library.getMechanismDetail(view.mechanismSlug);
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
                  <Suspense fallback={<PageLoadingFallback />}>
                    <MechanismDetailPage
                      detail={detail}
                      onSelectDrug={selectSubstance}
                      onSelectCategory={selectCategory}
                      onSelectMechanism={selectMechanism}
                      activeQualifierSlug={view.qualifierSlug}
                    />
                  </Suspense>
                </main>
              );
            })()
          ) : (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          )
        ) : view.type === "classification" ? (
          showLibraryLoading ? (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          ) : library ? (
            (() => {
              const detail =
                view.classification === "chemical"
                  ? library.getChemicalClassDetail(view.slug)
                  : library.getPsychoactiveClassDetail(view.slug);

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
                  <Suspense fallback={<PageLoadingFallback />}>
                    <ClassificationDetailPage detail={detail} onSelectDrug={selectSubstance} />
                  </Suspense>
                </main>
              );
            })()
          ) : (
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <PageLoadingFallback />
            </main>
          )
        ) : view.type === "about" ? (
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <Suspense fallback={<PageLoadingFallback />}>
              <AboutPage />
            </Suspense>
          </main>
        ) : view.type === "data" ? (
          <Suspense fallback={<PageLoadingFallback />}>
            <DataPage />
          </Suspense>
        ) : view.type === "reports" ? (
          <Suspense fallback={<PageLoadingFallback />}>
            <TripReportsPage
              onSelectReport={(slug) => navigate({ type: "report", slug })}
            />
          </Suspense>
        ) : view.type === "report" ? (
          <Suspense fallback={<PageLoadingFallback />}>
            <TripReportDetailPage
              slug={view.slug}
              fromSubstanceSlug={view.fromSubstanceSlug}
              onBack={() => {
                if (view.fromSubstanceSlug) {
                  navigate({ type: "substance", slug: view.fromSubstanceSlug });
                } else {
                  navigate({ type: "reports" });
                }
              }}
            />
          </Suspense>
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
              <Suspense fallback={<PageLoadingFallback />}>
                <UserProfilePage
                  profile={profile}
                  history={history}
                />
              </Suspense>
            );
          })()
        ) : activeSlug ? (
          <Suspense fallback={<PageLoadingFallback />}>
            <SubstanceArticlePage
              slug={activeSlug}
              onSelectCategory={selectCategory}
              onSelectEffect={selectEffect}
              onSelectMechanism={selectMechanism}
              onSelectClassification={selectClassification}
              onSelectReport={(slug) => navigate({ type: "report", slug, fromSubstanceSlug: activeSlug })}
            />
          </Suspense>
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
