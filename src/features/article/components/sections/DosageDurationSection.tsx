"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DosageRoute, DurationRoute, SubstanceArticle } from "@/schema";
import {
  hasDosageContent,
  hasDurationContent,
  routeHasDosageContent,
  routeHasDurationContent,
} from "@/schema";
import { ArticleSection } from "@/components/common/ArticleSection";
import { normalizeRouteName } from "../../../../../lib/article/normalization.mjs";
import { DosagePanel } from "./dosageDurationPlateau";
import {
  DurationPanel,
  ROUTE_ICONS,
  formatRouteLabel,
} from "./dosageDurationShared";
import { ArticleGapNotice } from "./ArticleGapNotice";

interface DosageDurationSectionProps {
  article: SubstanceArticle;
}

function getCanonicalRouteName(route: string): string {
  return normalizeRouteName(route) || route.trim();
}

/**
 * Entries for one canonical route name. Two raw entries ("intranasal",
 * "snorted") can collapse into one tab, so presence has to be judged across
 * every entry in the group rather than the first one that happens to match.
 */
interface RouteGroup {
  dosage: DosageRoute[];
  duration: DurationRoute[];
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
}: DosageDurationSectionProps) {
  const { dosage, duration } = article;

  // Group every raw route entry under its canonical (tab) name, in the order
  // the tabs used to appear: dosage first, then duration-only routes.
  const routeGroups = useMemo(() => {
    const groups = new Map<string, RouteGroup>();
    const groupFor = (rawRoute: string): RouteGroup | null => {
      const canonicalRoute = getCanonicalRouteName(rawRoute);
      if (!canonicalRoute) return null;
      const existing = groups.get(canonicalRoute);
      if (existing) return existing;
      const created: RouteGroup = { dosage: [], duration: [] };
      groups.set(canonicalRoute, created);
      return created;
    };
    dosage.routes.forEach((route) => {
      groupFor(route.route)?.dosage.push(route);
    });
    duration.routes.forEach((route) => {
      groupFor(route.route)?.duration.push(route);
    });
    return groups;
  }, [dosage.routes, duration.routes]);

  // The entry that actually renders for each tab: the first sibling carrying
  // content, so a hollow scaffold never shadows a populated one.
  const routeContent = useMemo(() => {
    const content = new Map<string, { dosage?: DosageRoute; duration?: DurationRoute }>();
    routeGroups.forEach((group, canonicalRoute) => {
      content.set(canonicalRoute, {
        dosage: group.dosage.find((route) => routeHasDosageContent(route)),
        duration: group.duration.find((route) => routeHasDurationContent(route)),
      });
    });
    return content;
  }, [routeGroups]);

  const hasDosage = hasDosageContent(dosage);
  const hasDuration = hasDurationContent(duration);

  // Plateau dosing lives on the dosage panel rather than on a route, so an
  // article whose only dosage content is a plateau table still needs a host
  // route to render it through.
  const plateauNeedsHost = useMemo(() => {
    if (!hasDosageContent({ routes: [], plateau_dosing: dosage.plateau_dosing })) return false;
    return !Array.from(routeContent.values()).some((entry) => entry.dosage);
  }, [dosage.plateau_dosing, routeContent]);

  // Only routes that render something get a tab. The rule is an OR: a
  // duration-only route, or one whose dosage is prose without a dose ladder,
  // is legitimate content.
  const allRoutes = useMemo(() => {
    const withContent: string[] = [];
    routeContent.forEach((entry, canonicalRoute) => {
      if (entry.dosage || entry.duration) withContent.push(canonicalRoute);
    });
    if (withContent.length > 0 || !plateauNeedsHost) return withContent;
    const plateauHosts: string[] = [];
    routeGroups.forEach((group, canonicalRoute) => {
      if (group.dosage.length > 0) plateauHosts.push(canonicalRoute);
    });
    return plateauHosts;
  }, [plateauNeedsHost, routeContent, routeGroups]);

  // Prefer a route documented on both sides, then any route with content.
  const defaultRoute = useMemo(() => {
    const both = allRoutes.find((canonicalRoute) => {
      const entry = routeContent.get(canonicalRoute);
      return !!entry?.dosage && !!entry?.duration;
    });
    const either =
      both ??
      allRoutes.find((canonicalRoute) => {
        const entry = routeContent.get(canonicalRoute);
        return !!entry?.dosage || !!entry?.duration;
      });
    return either ?? allRoutes[0] ?? "oral";
  }, [allRoutes, routeContent]);

  const [activeRoute, setActiveRoute] = useState(defaultRoute);

  useEffect(() => {
    if (!allRoutes.includes(activeRoute)) {
      setActiveRoute(defaultRoute);
    }
  }, [activeRoute, allRoutes, defaultRoute]);

  const activeContent = routeContent.get(activeRoute);
  const dosageForActiveRoute =
    activeContent?.dosage ??
    (plateauNeedsHost ? routeGroups.get(activeRoute)?.dosage[0] : undefined);
  const durationForActiveRoute = activeContent?.duration;
  const hasBothPanels = !!dosageForActiveRoute && !!durationForActiveRoute;

  if ((!hasDosage && !hasDuration) || allRoutes.length === 0) {
    return <ArticleGapNotice article={article} section="dosage_duration" />;
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
