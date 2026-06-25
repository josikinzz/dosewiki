"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { ArticleSection } from "@/components/common/ArticleSection";
import { normalizeRouteName } from "../../../../../lib/article/normalization.mjs";
import { DosagePanel } from "./dosageDurationPlateau";
import {
  DurationPanel,
  ROUTE_ICONS,
  formatRouteLabel,
} from "./dosageDurationShared";

interface DosageDurationSectionProps {
  article: SubstanceArticle;
}

function getCanonicalRouteName(route: string): string {
  return normalizeRouteName(route) || route.trim();
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;

  // Collect unique semantic routes from both dosage and duration.
  const allRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    dosage.routes.forEach((route) => {
      const canonicalRoute = getCanonicalRouteName(route.route);
      if (canonicalRoute) routeSet.add(canonicalRoute);
    });
    duration.routes.forEach((route) => {
      const canonicalRoute = getCanonicalRouteName(route.route);
      if (canonicalRoute) routeSet.add(canonicalRoute);
    });
    return Array.from(routeSet);
  }, [dosage, duration]);

  const hasDosage = dosage.routes.length > 0;
  const hasDuration = duration.routes.length > 0;

  const defaultRoute = allRoutes[0] || "oral";
  const [activeRoute, setActiveRoute] = useState(defaultRoute);

  useEffect(() => {
    if (!allRoutes.includes(activeRoute)) {
      setActiveRoute(defaultRoute);
    }
  }, [activeRoute, allRoutes, defaultRoute]);

  const dosageForActiveRoute = dosage.routes.find(
    (route) => getCanonicalRouteName(route.route) === activeRoute,
  );
  const durationForActiveRoute = duration.routes.find(
    (route) => getCanonicalRouteName(route.route) === activeRoute,
  );
  const hasBothPanels = !!dosageForActiveRoute && !!durationForActiveRoute;

  if (!hasDosage && !hasDuration) {
    return null;
  }

  return (
    <ArticleSection
      id="dosage-duration"
      icon="lucide:chart-no-axes-combined"
      heading="Dosage & Duration"
    >
      <Tabs value={activeRoute} onValueChange={setActiveRoute} className="w-full">
        <TabsList className="theme-route-tabs-list theme-text-muted mb-3 flex h-auto flex-wrap justify-start gap-1.5 !border-0 !bg-transparent p-0 shadow-none">
          {allRoutes.map(route => {
            const routeIcon = ROUTE_ICONS[route.toLowerCase()];
            const isActive = route === activeRoute;
            const routeLabel = formatRouteLabel(route);
            return (
              <TabsTrigger
                key={route}
                value={route}
                aria-label={`${routeLabel} route`}
                className={cn(
                  "theme-route-tab group relative isolate min-h-8 gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                  "border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-transparent",
                  "active:scale-[0.99] motion-reduce:active:scale-100",
                )}
              >
                {routeIcon ? (
                  <span
                    className={cn(
                      "theme-route-tab-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                      !isActive && "bg-transparent ring-transparent shadow-none"
                    )}
                  >
                    <Icon icon={routeIcon} size={16} />
                  </span>
                ) : null}
                <span className="relative">{routeLabel}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeRoute} forceMount className="mt-3">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 h-24 bg-gradient-to-r from-fuchsia-500/10 via-violet-400/10 to-violet-500/10 blur-3xl"
            />
            <div className={cn("relative grid gap-4 items-start", hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1")}>
              {dosageForActiveRoute ? (
                <DosagePanel article={article} route={dosageForActiveRoute} plateauDosing={dosage.plateau_dosing} />
              ) : null}
              {durationForActiveRoute ? <DurationPanel article={article} route={durationForActiveRoute} /> : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ArticleSection>
  );
});
