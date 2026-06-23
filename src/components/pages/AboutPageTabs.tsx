"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { cn } from "@/lib/utils";

type AboutPageTabId = "mission" | "data" | "contributors" | "docs";

interface AboutPageTabsProps {
  mission: ReactNode;
  data: ReactNode;
  contributors: ReactNode;
  docs: ReactNode;
}

const ABOUT_PAGE_TAB_IDS = ["mission", "data", "contributors", "docs"] as const;
const DEFAULT_TAB: AboutPageTabId = "mission";

const ABOUT_PAGE_TAB_ITEMS: PublicSegmentedTabItem<AboutPageTabId>[] = [
  {
    id: "mission",
    icon: "lucide:compass",
    label: "Mission",
  },
  {
    id: "data",
    icon: "lucide:database",
    label: "Open Data",
  },
  {
    id: "contributors",
    icon: "lucide:users",
    label: "Contributors",
  },
  {
    id: "docs",
    icon: "lucide:book-open",
    label: "Documentation",
  },
];

function getTabFromHash(hash: string): AboutPageTabId | null {
  const normalized = hash.replace(/^#/, "").toLowerCase();
  return ABOUT_PAGE_TAB_IDS.includes(normalized as AboutPageTabId)
    ? (normalized as AboutPageTabId)
    : null;
}

function getCurrentHashTab() {
  if (typeof window === "undefined") {
    return null;
  }

  return getTabFromHash(window.location.hash);
}

function updateHash(tabId: AboutPageTabId) {
  if (typeof window === "undefined") {
    return;
  }

  const nextHash = `#${tabId}`;
  if (window.location.hash === nextHash) {
    return;
  }

  window.history.pushState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

export function AboutPageTabs({
  mission,
  data,
  contributors,
  docs,
}: AboutPageTabsProps) {
  const [activeTab, setActiveTab] = useState<AboutPageTabId>(DEFAULT_TAB);
  const [isEnhanced, setIsEnhanced] = useState(false);

  useEffect(() => {
    const syncTabFromHash = () => {
      setActiveTab(getCurrentHashTab() ?? DEFAULT_TAB);
    };

    syncTabFromHash();
    setIsEnhanced(true);
    window.addEventListener("hashchange", syncTabFromHash);
    window.addEventListener("popstate", syncTabFromHash);

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
      window.removeEventListener("popstate", syncTabFromHash);
    };
  }, []);

  const panels = useMemo(
    () => [
      {
        id: "mission" as const,
        label: "Project Mission",
        content: mission,
      },
      {
        id: "data" as const,
        label: "Open Data & Tools",
        content: data,
      },
      {
        id: "contributors" as const,
        label: "Founders & Contributors",
        content: contributors,
      },
      {
        id: "docs" as const,
        label: "Documentation",
        content: docs,
      },
    ],
    [contributors, data, docs, mission],
  );

  const handleValueChange = useCallback((nextTab: AboutPageTabId) => {
    setActiveTab(nextTab);
    updateHash(nextTab);
  }, []);

  return (
    <div className="space-y-8">
      <PublicSegmentedTabs
        ariaLabel="About page sections"
        value={activeTab}
        onValueChange={handleValueChange}
        items={ABOUT_PAGE_TAB_ITEMS}
        mobileVariant="appGrid"
        listClassName="justify-center"
      />

      <div className={cn(!isEnhanced && "space-y-12")}>
        {panels.map((panel) => {
          const isActive = panel.id === activeTab;
          const isHidden = isEnhanced && !isActive;

          return (
            <section
              key={panel.id}
              id={panel.id}
              role="tabpanel"
              aria-label={panel.label}
              hidden={isHidden}
              tabIndex={-1}
              className={cn("scroll-mt-28", isHidden && "hidden")}
            >
              {panel.content}
            </section>
          );
        })}
      </div>
    </div>
  );
}
