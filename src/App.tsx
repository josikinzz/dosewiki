import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { DosagesPage } from "./components/pages/DosagesPage";
import { CategoryPage } from "./components/pages/CategoryPage";
import { EffectsPage } from "./components/pages/EffectsPage";
import { EffectsIndexPage } from "./components/pages/EffectsIndexPage";
import { EffectDetailPage } from "./components/pages/EffectDetailPage";
import { EffectArticlePage } from "./components/pages/EffectArticlePage";
import { EffectCategoryPage } from "./components/pages/EffectCategoryPage";
import { MechanismDetailPage } from "./components/pages/MechanismDetailPage";
import { ClassificationDetailPage } from "./components/pages/ClassificationDetailPage";
import { SearchResultsPage } from "./components/pages/SearchResultsPage";
import { AboutPage } from "./components/pages/AboutPage";
import { TripReportsPage } from "./components/pages/TripReportsPage";
import { TripReportDetailPage } from "./components/pages/TripReportDetailPage";
import { DataPage } from "./components/pages/DataPage";
import { useSubjectiveEffects, useSubjectiveEffect } from "./hooks/useSubjectiveEffects";

// Lazy load DevModePage - only needed by authenticated editors
const DevModePage = lazy(() => 
  import("./components/pages/DevModePage").then(mod => ({ default: mod.DevModePage }))
);
import { useLibrary } from "./data/ArticlesProvider";
import { querySearchWithData } from "./data/builders/search";
import { RouteAnnouncer } from "./components/common/RouteAnnouncer";
import type { AppView } from "./types/navigation";
import { parsePath, viewToPath } from "./utils/routing";
import { InteractionsPage } from "./components/pages/InteractionsPage";
import { UserProfilePage } from "./components/pages/UserProfilePage";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "./data/userProfiles";
import { SubstanceArticlePage } from "./components/pages/SubstanceArticlePage";
import { slugify } from "./utils/slug";

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
      return "Subjective Effects Index";
    case "effect":
      return `${view.effectSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} - Subjective Effect`;
    case "effect-category":
      return `${view.categorySlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Effects`;
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
export default function App() {
  // Get library data from context
  const library = useLibrary();
  
  // Get subjective effects from Convex
  const { effects: subjectiveEffects, isLoading: effectsLoading } = useSubjectiveEffects();
  const {
    articles,
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

  // Create a map of raw articles by slug for the new article layout
  const articlesBySlug = useMemo(() => {
    const map = new Map<string, (typeof articles)[0]>();
    for (const article of articles) {
      const slug = slugify(article.title);
      map.set(slug, article);
    }
    return map;
  }, [articles]);

  const [view, setView] = useState<AppView>(() => parsePath(undefined, defaultSlug, DEFAULT_VIEW));
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
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
  const activeArticle = activeSlug ? articlesBySlug.get(activeSlug) ?? null : null;

  const handleInteractionSelectionChange = useCallback(
    (primarySlug: string, secondarySlug: string) => {
      navigate({ type: "interactions", primarySlug, secondarySlug });
    },
    [navigate],
  );

  const searchQuery = view.type === "search" ? view.query : "";
  const searchResults = useMemo(() => {
    if (view.type !== "search") {
      return [];
    }
    return querySearchWithData(view.query, library);
  }, [view.type, searchQuery, library]);

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

      <Header currentView={effectiveView} onNavigate={navigate} />

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
              <CategoryPage 
                detail={detail} 
                onSelectDrug={selectSubstance} 
                onNavigate={(path) => navigate(parsePath(path, defaultSlug, DEFAULT_VIEW))}
                onSelectEffect={selectEffect}
                effects={subjectiveEffects}
              />
            </main>
          );
        })()
      ) : view.type === "search" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <SearchResultsPage
            query={view.query}
            results={searchResults}
            onSelectSubstance={selectSubstance}
            onSelectCategory={selectCategory}
            onSelectEffect={selectEffect}
          />
        </main>
      ) : view.type === "effects" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          {subjectiveEffects.length > 0 ? (
            <EffectsIndexPage 
              effects={subjectiveEffects.map(e => ({ slug: e.slug, name: e.name, tags: e.tags }))} 
              onSelectEffect={selectEffect} 
            />
          ) : effectsLoading ? (
            <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
              </div>
            </div>
          ) : (
            <EffectsPage effects={effectSummaries} onSelectEffect={selectEffect} />
          )}
        </main>
      ) : view.type === "effect-category" ? (
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <EffectCategoryPage
            categorySlug={view.categorySlug}
            effects={subjectiveEffects.map(e => ({ slug: e.slug, name: e.name, tags: e.tags, summary: e.summary }))}
            onSelectEffect={selectEffect}
            onNavigateBack={() => navigate({ type: "effects" })}
          />
        </main>
      ) : view.type === "effect" ? (
        (() => {
          // First try to find the effect in Convex
          const convexEffect = subjectiveEffects.find(e => e.slug === view.effectSlug);
          
          if (convexEffect) {
            // Get related substances from library
            const libraryDetail = getEffectDetail(view.effectSlug);
            
            return (
              <main id="main-content" ref={mainRef} tabIndex={-1}>
                <EffectArticlePage
                  effect={convexEffect}
                  relatedSubstances={libraryDetail ? {
                    groups: libraryDetail.groups,
                    total: libraryDetail.definition.total,
                  } : undefined}
                  onNavigate={(path) => {
                    const parsed = parsePath(path, defaultSlug, DEFAULT_VIEW);
                    navigate(parsed);
                  }}
                  onSelectDrug={selectSubstance}
                  onSelectCategory={selectCategory}
                />
              </main>
            );
          }
          
          // Fall back to library-based detail view
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
      ) : view.type === "data" ? (
        <DataPage />
      ) : view.type === "reports" ? (
        <TripReportsPage
          onSelectReport={(slug) => navigate({ type: "report", slug })}
        />
      ) : view.type === "report" ? (
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
      ) : activeArticle ? (
        <SubstanceArticlePage
          article={activeArticle}
          onSelectCategory={selectCategory}
          onSelectEffect={selectEffect}
          onSelectMechanism={selectMechanism}
          onSelectClassification={selectClassification}
          onSelectReport={(slug) => navigate({ type: "report", slug, fromSubstanceSlug: activeSlug ?? undefined })}
        />
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
