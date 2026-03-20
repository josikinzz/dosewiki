"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RouteAnnouncer } from "@/components/common/RouteAnnouncer";
import type { AppView } from "@/types/navigation";
import { parsePath, viewToPath } from "@/utils/routing";

const DEFAULT_VIEW: AppView = { type: "substances" };
const DEFAULT_SUBSTANCE_SLUG = "lsd";

function getPageTitle(view: AppView): string {
  switch (view.type) {
    case "substances":
      return "Substance Index";
    case "substance":
      return `${view.slug.replace(/-/g, " ")} - Substance Profile`;
    case "category":
      return `${view.categoryKey} Category`;
    case "effects":
      return "Subjective Effects Index";
    case "effect":
      return `${view.effectSlug.replace(/-/g, " ")} - Subjective Effect`;
    case "effect-category":
      return `${view.categorySlug.replace(/-/g, " ")} Effects`;
    case "mechanism":
      return `${view.mechanismSlug.replace(/-/g, " ")} Mechanism`;
    case "classification":
      return `${view.slug.replace(/-/g, " ")} ${view.classification === "chemical" ? "Chemical" : "Psychoactive"} Class`;
    case "search":
      return `Search Results for "${view.query}"`;
    case "about":
      return "About dose.wiki";
    case "contributor":
      return "Contributor Profile";
    case "reports":
      return "Trip Reports";
    case "report":
      return "Trip Report";
    case "dev":
      return `Developer Tools - ${view.tab}`;
    default:
      return "dose.wiki";
  }
}

export function RouteChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const view = useMemo(
    () => parsePath(pathname ?? undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW),
    [pathname],
  );
  const pageTitle = useMemo(() => getPageTitle(view), [view]);

  return (
    <>
      <RouteAnnouncer message={pageTitle} />
      <Header currentView={view} onNavigate={(nextView) => router.push(viewToPath(nextView))} />
    </>
  );
}
