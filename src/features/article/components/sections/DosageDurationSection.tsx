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
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
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
  /**
   * The `dosage-panel-disclaimer` copy block, threaded from the route loader.
   * Absent falls back to the checked-in default inside `DosagePanel`.
   */
  dosageDisclaimer?: string;
}

// A route entry with no name is unrenderable, not a crash: the canonical name
// is what every tab, icon and group lookup is keyed on, so an empty one drops
// the entry rather than taking the whole article down with it.
function getCanonicalRouteName(route: string | null | undefined): string {
  const raw = typeof route === "string" ? route : "";
  return normalizeRouteName(raw) || raw.trim();
}

/**
 * Entries for one canonical route name. Two raw entries ("intranasal",
 * "snorted") can collapse into one tab, so presence has to be judged across
 * every entry in the group rather than the first one that happens to match.
 */
interface RouteGroup {
  /**
   * The source index travels with the entry: grouping collapses `intranasal`
   * and `snorted` into one tab, so the rendered route can no longer be found
   * by position, and an inline edit needs `dosage.routes[i]` to address it.
   */
  dosage: Array<{ route: DosageRoute; index: number }>;
  /** Same story on the duration side: `duration.routes[i]`, not the tab order. */
  duration: Array<{ route: DurationRoute; index: number }>;
}

export const DosageDurationSection = memo(function DosageDurationSection({
  article,
  dosageDisclaimer,
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
    dosage.routes.forEach((route, index) => {
      groupFor(route.route)?.dosage.push({ route, index });
    });
    duration.routes.forEach((route, index) => {
      groupFor(route.route)?.duration.push({ route, index });
    });
    return groups;
  }, [dosage.routes, duration.routes]);

  // The entry that actually renders for each tab: the first sibling carrying
  // content, so a hollow scaffold never shadows a populated one.
  const routeContent = useMemo(() => {
    const content = new Map<
      string,
      {
        dosage?: DosageRoute;
        dosageIndex?: number;
        duration?: DurationRoute;
        durationIndex?: number;
      }
    >();
    routeGroups.forEach((group, canonicalRoute) => {
      const dosageEntry = group.dosage.find((entry) => routeHasDosageContent(entry.route));
      const durationEntry = group.duration.find((entry) =>
        routeHasDurationContent(entry.route),
      );
      content.set(canonicalRoute, {
        dosage: dosageEntry?.route,
        dosageIndex: dosageEntry?.index,
        duration: durationEntry?.route,
        durationIndex: durationEntry?.index,
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

  // Route order is editorial: the first listed route opens. Only fall through
  // when that route carries nothing to show (plateau-host scaffolding).
  const defaultRoute = useMemo(() => {
    const hasContent = (canonicalRoute: string) => {
      const entry = routeContent.get(canonicalRoute);
      return !!entry?.dosage || !!entry?.duration;
    };
    const first = allRoutes[0];
    if (first && hasContent(first)) return first;
    return allRoutes.find(hasContent) ?? first ?? "oral";
  }, [allRoutes, routeContent]);

  const [activeRoute, setActiveRoute] = useState(defaultRoute);

  useEffect(() => {
    if (!allRoutes.includes(activeRoute)) {
      setActiveRoute(defaultRoute);
    }
  }, [activeRoute, allRoutes, defaultRoute]);

  const activeContent = routeContent.get(activeRoute);
  const plateauHostEntry = plateauNeedsHost
    ? routeGroups.get(activeRoute)?.dosage[0]
    : undefined;
  const dosageForActiveRoute = activeContent?.dosage ?? plateauHostEntry?.route;
  const dosageIndexForActiveRoute = activeContent?.dosage
    ? activeContent.dosageIndex
    : plateauHostEntry?.index;
  const durationForActiveRoute = activeContent?.duration;
  const durationIndexForActiveRoute = activeContent?.durationIndex;
  const hasBothPanels = !!dosageForActiveRoute && !!durationForActiveRoute;

  if ((!hasDosage && !hasDuration) || allRoutes.length === 0) {
    return <ArticleGapNotice article={article} section="dosage_duration" />;
  }

  return (
    <ArticleSection
      id="dosage-duration"
      icon={SUBSTANCE_SECTION_ICONS["dosage-duration"]}
      heading="Dosage & Duration"
    >
      <Tabs value={activeRoute} onValueChange={setActiveRoute} className="w-full">
        <TabsList className="theme-route-tabs-list theme-text-muted mb-3 flex h-auto flex-wrap justify-start gap-1.5 !border-0 !bg-transparent p-0 shadow-[var(--theme-elevation-none)]">
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
                  "theme-selected-control group relative isolate min-h-8 gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                  "border-transparent bg-transparent shadow-[var(--theme-elevation-none)] hover:border-transparent hover:bg-transparent",
                  "active:scale-[0.99] motion-reduce:active:scale-100",
                )}
              >
                {routeIcon ? (
                  <span
                    className={cn(
                      "theme-selected-control-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                      !isActive && "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]"
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
            <div className={cn("relative grid gap-4 items-start", hasBothPanels ? "md:grid-cols-2" : "md:grid-cols-1")}>
              {dosageForActiveRoute ? (
                <DosagePanel
                  article={article}
                  route={dosageForActiveRoute}
                  routeIndex={dosageIndexForActiveRoute}
                  plateauDosing={dosage.plateau_dosing}
                  disclaimer={dosageDisclaimer}
                />
              ) : null}
              {durationForActiveRoute ? (
                <DurationPanel
                  article={article}
                  route={durationForActiveRoute}
                  routeIndex={durationIndexForActiveRoute}
                />
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ArticleSection>
  );
});
