"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { DosagesPage } from "@/components/pages/DosagesPage";
import { AboutPage } from "@/components/pages/AboutPage";
import { CategoryPage } from "@/components/pages/CategoryPage";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";
import { SearchResultsPage } from "@/components/pages/SearchResultsPage";
import { UserProfilePage } from "@/components/pages/UserProfilePage";
import { LightweightDataProvider, type SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import { SubstanceIndexProvider, useLibrary } from "@/data/SubstanceIndexProvider";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "@/data/userProfiles";
import { querySearchWithData } from "@/data/builders/search";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import { slugify } from "@/utils/slug";
import { viewToPath } from "@/utils/routing";
import type { AppView } from "@/types/navigation";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { EffectArticlePage } from "@/features/effects/pages/EffectArticlePage";
import { EffectCategoryPage } from "@/features/effects/pages/EffectCategoryPage";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";
import { TripReportDetailPage } from "@/features/reports/pages/TripReportDetailPage";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";

type LegacyPublicRouteClientProps = {
  view: AppView;
  fromSubstanceSlug?: string;
};

function MissingResource({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm text-white/70">{description}</p>
      </div>
    </main>
  );
}

function PublicLibraryProvider({ children }: { children: React.ReactNode }) {
  const { library, isLoading, isEmpty } = useLazyLibrary(true);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!library || isEmpty) {
    return (
      <MissingResource
        title="Library unavailable"
        description="The public library data is not available in this deployment yet."
      />
    );
  }

  return <SubstanceIndexProvider libraryData={library}>{children}</SubstanceIndexProvider>;
}

function PublicLightweightProvider({ children }: { children: React.ReactNode }) {
  const categoryLayout = useQuery(api.categoryLayout.get);
  const slugNameMap = useQuery(api.substanceIndex.getSlugNameMap);

  const layout = useMemo<CategoryLayout | null>(() => {
    if (!categoryLayout) {
      return null;
    }

    return {
      version: categoryLayout.version,
      categories: categoryLayout.categories.map((category) => ({
        key: category.key,
        label: category.label,
        iconKey: category.iconKey,
        sections: category.sections.map((section) => ({
          key: section.key,
          label: section.label,
          drugs: section.drugs,
        })),
        drugs: category.drugs,
        columns: category.columns,
      })),
    };
  }, [categoryLayout]);

  const substances = useMemo<SubstanceLookupEntry[]>(() => {
    if (!slugNameMap) {
      return [];
    }

    return slugNameMap.map((item) => ({
      slug: item.slug,
      name: item.name,
      priority: item.priority,
    }));
  }, [slugNameMap]);

  if (categoryLayout === undefined || slugNameMap === undefined) {
    return <LoadingScreen />;
  }

  if (!layout) {
    return (
      <MissingResource
        title="Substance index unavailable"
        description="Category layout data is missing from Convex."
      />
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      {children}
    </LightweightDataProvider>
  );
}

function LegacyCategoryRoute({
  categoryKey,
  onSelectDrug,
  onSelectEffect,
  onNavigate,
}: {
  categoryKey: string;
  onSelectDrug: (slug: string) => void;
  onSelectEffect: (slug: string) => void;
  onNavigate: (path: string) => void;
}) {
  const library = useLibrary();
  const detail = library.getCategoryDetail(categoryKey);

  if (!detail) {
    return (
      <MissingResource
        title="Category not found"
        description="Try selecting a category from the substances index."
      />
    );
  }

  return (
    <CategoryPage
      detail={detail}
      onSelectDrug={onSelectDrug}
      onNavigate={onNavigate}
      onSelectEffect={onSelectEffect}
    />
  );
}

function LegacyMechanismRoute({
  mechanismSlug,
  qualifierSlug,
  onSelectDrug,
  onSelectCategory,
  onSelectMechanism,
}: {
  mechanismSlug: string;
  qualifierSlug?: string;
  onSelectDrug: (slug: string) => void;
  onSelectCategory: (categoryKey: string) => void;
  onSelectMechanism: (mechanismSlug: string, qualifierSlug?: string) => void;
}) {
  const library = useLibrary();
  const detail = library.getMechanismDetail(mechanismSlug);

  if (!detail) {
    return (
      <MissingResource
        title="Mechanism not found"
        description="Select a mechanism badge from a substance profile to explore related entries."
      />
    );
  }

  return (
    <MechanismDetailPage
      detail={detail}
      onSelectDrug={onSelectDrug}
      onSelectCategory={onSelectCategory}
      onSelectMechanism={onSelectMechanism}
      activeQualifierSlug={qualifierSlug}
    />
  );
}

function LegacyClassificationRoute({
  classification,
  slug,
  onSelectDrug,
}: {
  classification: "chemical" | "psychoactive";
  slug: string;
  onSelectDrug: (slug: string) => void;
}) {
  const library = useLibrary();
  const detail =
    classification === "chemical"
      ? library.getChemicalClassDetail(slug)
      : library.getPsychoactiveClassDetail(slug);

  if (!detail) {
    return (
      <MissingResource
        title={`${classification === "chemical" ? "Chemical class" : "Psychoactive class"} not found`}
        description="Select a class tag from a substance profile to view related entries."
      />
    );
  }

  return <ClassificationDetailPage detail={detail} onSelectDrug={onSelectDrug} />;
}

function LegacySearchRoute({
  query,
  onSelectSubstance,
  onSelectCategory,
  onSelectEffect,
}: {
  query: string;
  onSelectSubstance: (slug: string) => void;
  onSelectCategory: (categoryKey: string) => void;
  onSelectEffect: (effectSlug: string) => void;
}) {
  const library = useLibrary();
  const results = useMemo(() => querySearchWithData(query, library), [query, library]);

  return (
    <SearchResultsPage
      query={query}
      results={results}
      onSelectSubstance={onSelectSubstance}
      onSelectCategory={onSelectCategory}
      onSelectEffect={onSelectEffect}
    />
  );
}

function LegacyEffectArticleRoute({
  effectSlug,
  onSelectDrug,
  onSelectCategory,
  onNavigate,
}: {
  effectSlug: string;
  onSelectDrug: (slug: string) => void;
  onSelectCategory: (categoryKey: string) => void;
  onNavigate: (path: string) => void;
}) {
  const library = useLibrary();

  return (
    <EffectArticlePage
      effectSlug={effectSlug}
      getEffectDetail={library.getEffectDetail}
      onNavigate={onNavigate}
      onSelectDrug={onSelectDrug}
      onSelectCategory={onSelectCategory}
    />
  );
}

function LegacyReportDetailRoute({
  slug,
  fromSubstanceSlug,
  onBack,
}: {
  slug: string;
  fromSubstanceSlug?: string;
  onBack: () => void;
}) {
  return <TripReportDetailPage slug={slug} fromSubstanceSlug={fromSubstanceSlug} onBack={onBack} />;
}

function needsLibrary(view: AppView): boolean {
  switch (view.type) {
    case "category":
    case "mechanism":
    case "classification":
    case "search":
    case "report":
    case "effect":
      return true;
    default:
      return false;
  }
}

function needsLightweight(view: AppView): boolean {
  return view.type === "substances" || view.type === "about";
}

function LegacyPublicRouteRenderer({ view, fromSubstanceSlug: _fromSubstanceSlug }: LegacyPublicRouteClientProps) {
  const router = useRouter();

  const navigate = (nextView: AppView) => {
    router.push(viewToPath(nextView));
  };

  const selectSubstance = (slug: string) => {
    navigate({ type: "substance", slug });
  };

  const selectCategory = (categoryKey: string) => {
    navigate({ type: "category", categoryKey });
  };

  const selectEffect = (effectSlug: string) => {
    navigate({ type: "effect", effectSlug });
  };

  const selectMechanism = (mechanismSlug: string, qualifierSlug?: string) => {
    navigate({ type: "mechanism", mechanismSlug, qualifierSlug });
  };

  const selectClassification = (classification: "chemical" | "psychoactive", label: string) => {
    const slug = slugify(label) || label;
    navigate({ type: "classification", classification, slug });
  };

  switch (view.type) {
    case "substances":
      return <DosagesPage onSelectDrug={selectSubstance} onSelectCategory={selectCategory} />;
    case "substance":
      return (
        <SubstanceArticlePage
          slug={view.slug}
          onSelectCategory={selectCategory}
          onSelectEffect={selectEffect}
          onSelectMechanism={selectMechanism}
          onSelectClassification={selectClassification}
          onSelectReport={(slug) => router.push(`/reports/${slug}?from=${encodeURIComponent(view.slug)}`)}
        />
      );
    case "effects":
      return <EffectsIndexPage onSelectEffect={selectEffect} />;
    case "effect-category":
      return (
        <EffectCategoryPage
          categorySlug={view.categorySlug}
          onSelectEffect={selectEffect}
          onNavigateBack={() => navigate({ type: "effects" })}
        />
      );
    case "about":
      return <AboutPage />;
    case "reports":
      return <TripReportsPage onSelectReport={(slug) => navigate({ type: "report", slug })} />;
    case "contributor": {
      const rawKey = view.profileKey.trim();
      const canonicalKey = rawKey.toUpperCase();
      const profile = getProfileByKey(canonicalKey);
      const history = buildProfileHistory(canonicalKey, 5);
      const isKnownProfile = profilesByKey.has(canonicalKey);

      if (!isKnownProfile && history.length === 0) {
        return (
          <MissingResource
            title="Contributor not found"
            description="Check the profile key or request access via the editor workflow."
          />
        );
      }

      return <UserProfilePage profile={profile} history={history} onSelectReport={(slug) => router.push(`/reports/${slug}`)} />;
    }
    default:
      return null;
  }
}

function LegacyPublicLibraryRoute(props: LegacyPublicRouteClientProps) {
  const router = useRouter();

  switch (props.view.type) {
    case "category":
      return (
        <LegacyCategoryRoute
          categoryKey={props.view.categoryKey}
          onSelectDrug={(slug) => router.push(`/${slug}`)}
          onSelectEffect={(slug) => router.push(`/effects/${slug}`)}
          onNavigate={(path) => router.push(path)}
        />
      );
    case "mechanism":
      return (
        <LegacyMechanismRoute
          mechanismSlug={props.view.mechanismSlug}
          qualifierSlug={props.view.qualifierSlug}
          onSelectDrug={(slug) => router.push(`/${slug}`)}
          onSelectCategory={(categoryKey) => router.push(`/category/${categoryKey}`)}
          onSelectMechanism={(mechanismSlug, qualifierSlug) => {
            router.push(
              qualifierSlug
                ? `/mechanism/${mechanismSlug}/${qualifierSlug}`
                : `/mechanism/${mechanismSlug}`,
            );
          }}
        />
      );
    case "classification":
      return (
        <LegacyClassificationRoute
          classification={props.view.classification}
          slug={props.view.slug}
          onSelectDrug={(slug) => router.push(`/${slug}`)}
        />
      );
    case "search":
      return (
        <LegacySearchRoute
          query={props.view.query}
          onSelectSubstance={(slug) => router.push(`/${slug}`)}
          onSelectCategory={(categoryKey) => router.push(`/category/${categoryKey}`)}
          onSelectEffect={(effectSlug) => router.push(`/effects/${effectSlug}`)}
        />
      );
    case "report":
      return (
        <LegacyReportDetailRoute
          slug={props.view.slug}
          fromSubstanceSlug={props.fromSubstanceSlug}
          onBack={() => {
            if (props.fromSubstanceSlug) {
              router.push(`/${props.fromSubstanceSlug}`);
              return;
            }
            router.push("/reports");
          }}
        />
      );
    case "effect":
      return (
        <LegacyEffectArticleRoute
          effectSlug={props.view.effectSlug}
          onSelectDrug={(slug) => router.push(`/${slug}`)}
          onSelectCategory={(categoryKey) => router.push(`/category/${categoryKey}`)}
          onNavigate={(path) => router.push(path)}
        />
      );
    default:
      return null;
  }
}

export function LegacyPublicRouteClient(props: LegacyPublicRouteClientProps) {
  if (needsLibrary(props.view)) {
    return (
      <PublicLibraryProvider>
        <LegacyPublicLibraryRoute {...props} />
      </PublicLibraryProvider>
    );
  }

  if (needsLightweight(props.view)) {
    return (
      <PublicLightweightProvider>
        <LegacyPublicRouteRenderer {...props} />
      </PublicLightweightProvider>
    );
  }

  return <LegacyPublicRouteRenderer {...props} />;
}
