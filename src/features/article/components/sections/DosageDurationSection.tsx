"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { ArticleSection } from "@/components/common/ArticleSection";
import { DosagePanel } from "./dosageDurationPlateau";
import {
  DurationPanel,
  ROUTE_ICONS,
  formatRouteLabel,
} from "./dosageDurationShared";

interface DosageDurationSectionProps {
  article: SubstanceArticle;
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;
  const prefersReducedMotion = useReducedMotion();

  // Collect unique routes from both dosage and duration
  const allRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    dosage.routes.forEach(r => routeSet.add(r.route));
    duration.routes.forEach(r => routeSet.add(r.route));
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

  const dosageForActiveRoute = dosage.routes.find(r => r.route === activeRoute);
  const durationForActiveRoute = duration.routes.find(r => r.route === activeRoute);
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
            return (
              <TabsTrigger
                key={route}
                value={route}
                className={cn(
                  "theme-route-tab group relative isolate gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-300",
                  "border-transparent bg-transparent shadow-none hover:-translate-y-px hover:border-transparent hover:bg-transparent hover:text-white",
                  "active:translate-y-0 active:scale-[0.985]",
                  "data-[state=active]:border-fuchsia-400/20 data-[state=active]:bg-[linear-gradient(135deg,rgba(217,70,239,0.18),rgba(124,58,237,0.12))] data-[state=active]:text-white",
                  "data-[state=active]:shadow-[0_12px_30px_-18px_rgba(217,70,239,0.7),inset_0_0_0_1px_rgba(255,255,255,0.04)]",
                  !prefersReducedMotion && "will-change-transform"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.18),transparent_65%)] opacity-0 transition-opacity duration-300",
                    isActive && "opacity-100"
                  )}
                />
                {routeIcon ? (
                  <span
                    className={cn(
                      "theme-route-tab-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                      isActive
                        ? "bg-fuchsia-400/18 text-white ring-fuchsia-300/25 shadow-[0_0_20px_rgba(217,70,239,0.18)]"
                        : "bg-transparent text-white/85 ring-transparent shadow-none group-hover:bg-transparent group-hover:text-white"
                    )}
                  >
                    <Icon icon={routeIcon} size={16} />
                  </span>
                ) : null}
                <span className="relative">{formatRouteLabel(route)}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeRoute} forceMount className="mt-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeRoute}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-24 bg-gradient-to-r from-fuchsia-500/10 via-violet-400/10 to-sky-400/10 blur-3xl"
              />
              <div className={cn("relative grid gap-4 items-start", hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1")}>
                {dosageForActiveRoute ? (
                  <DosagePanel article={article} route={dosageForActiveRoute} plateauDosing={dosage.plateau_dosing} />
                ) : null}
                {durationForActiveRoute ? <DurationPanel article={article} route={durationForActiveRoute} /> : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </ArticleSection>
  );
});
