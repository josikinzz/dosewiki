"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { Icon, type IconName } from "@/components/common/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface DosageDurationRouteView {
  key: string;
  label: string;
  icon?: IconName;
  panel: ReactNode;
}

export const DosageDurationSectionView = memo(
  function DosageDurationSectionView({
    routes,
    initialRoute,
  }: {
    routes: readonly DosageDurationRouteView[];
    initialRoute: string;
  }) {
    const t = useT();
    const [activeRoute, setActiveRoute] = useState(initialRoute);

    useEffect(() => {
      if (!routes.some((route) => route.key === activeRoute))
        setActiveRoute(initialRoute);
    }, [activeRoute, initialRoute, routes]);

    return (
      <ArticleSection
        id="dosage-duration"
        icon={SUBSTANCE_SECTION_ICONS["dosage-duration"]}
        heading={t("Dosage & Duration")}
      >
        <Tabs
          value={activeRoute}
          onValueChange={setActiveRoute}
          className="w-full"
        >
          <TabsList className="theme-route-tabs-list theme-text-muted mb-3 flex h-auto flex-wrap justify-start gap-1.5 !border-0 !bg-transparent p-0 shadow-[var(--theme-elevation-none)]">
            {routes.map((route) => {
              const isActive = route.key === activeRoute;
              return (
                <TabsTrigger
                  key={route.key}
                  value={route.key}
                  aria-label={t("{{route}} route", { route: t(route.label) })}
                  className={cn(
                    "theme-selected-control group relative isolate min-h-8 gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                    "border-transparent bg-transparent shadow-[var(--theme-elevation-none)] hover:border-transparent hover:bg-transparent",
                    "active:scale-[0.99] motion-reduce:active:scale-100",
                  )}
                >
                  {route.icon ? (
                    <span
                      className={cn(
                        "theme-selected-control-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                        !isActive &&
                          "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]",
                      )}
                    >
                      <Icon icon={route.icon} size={16} />
                    </span>
                  ) : null}
                  <span className="relative">{t(route.label)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {routes.map((route) =>
            route.key === activeRoute ? (
              <TabsContent key={route.key} value={route.key} className="mt-3">
                <div className="theme-tab-panel-enter relative">
                  {route.panel}
                </div>
              </TabsContent>
            ) : null,
          )}
        </Tabs>
      </ArticleSection>
    );
  },
);
