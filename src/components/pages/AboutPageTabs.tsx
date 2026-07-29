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
  /**
   * Open Data & Tools panel. Omit to drop the tab entirely: its exports are dose.wiki's
   * own, so a flavor that does not ship them must not show an empty tab either.
   */
  data?: ReactNode;
  contributors: ReactNode;
  /**
   * Accessible label for the contributor panel. Flavored: dose.wiki shows an editor-curated
   * founder subset, Effect Index the whole contributor roster behind one founder, so a single
   * fixed label would misdescribe one of them.
   */
  contributorsLabel?: string;
  docs: ReactNode;
  /**
   * Label for the final tab. Flavored: on Effect Index that panel carries licensing and
   * contact links rather than dose.wiki's `/docs/*` pages, so "Documentation" would name
   * the wrong thing.
   */
  docsLabel?: string;
}

const DEFAULT_TAB: AboutPageTabId = "mission";
const DEFAULT_DOCS_LABEL = "Documentation";
const DEFAULT_CONTRIBUTORS_LABEL = "Founders & Contributors";

function getTabFromHash(
  hash: string,
  tabIds: readonly AboutPageTabId[],
): AboutPageTabId | null {
  const normalized = hash.replace(/^#/, "").toLowerCase();
  return tabIds.includes(normalized as AboutPageTabId)
    ? (normalized as AboutPageTabId)
    : null;
}

function getCurrentHashTab(tabIds: readonly AboutPageTabId[]) {
  if (typeof window === "undefined") {
    return null;
  }

  return getTabFromHash(window.location.hash, tabIds);
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
  contributorsLabel = DEFAULT_CONTRIBUTORS_LABEL,
  docs,
  docsLabel = DEFAULT_DOCS_LABEL,
}: AboutPageTabsProps) {
  const [activeTab, setActiveTab] = useState<AboutPageTabId>(DEFAULT_TAB);
  const [isEnhanced, setIsEnhanced] = useState(false);

  // Derived from a stable boolean, not from `panels`: the panel nodes are fresh elements on
  // every render, and hanging the hash listener off them would re-subscribe each time.
  const hasDataPanel = data !== undefined;

  const panels = useMemo(
    () => [
      {
        id: "mission" as const,
        icon: "lucide:compass",
        tabLabel: "Mission",
        label: "Project Mission",
        content: mission,
      },
      // Omitted entirely rather than rendered empty when this flavor has no open data.
      ...(hasDataPanel
        ? [
            {
              id: "data" as const,
              icon: "lucide:database",
              tabLabel: "Open Data",
              label: "Open Data & Tools",
              content: data,
            },
          ]
        : []),
      {
        id: "contributors" as const,
        icon: "lucide:users",
        tabLabel: "Contributors",
        label: contributorsLabel,
        content: contributors,
      },
      {
        id: "docs" as const,
        icon: "lucide:book-open",
        tabLabel: docsLabel,
        label: docsLabel,
        content: docs,
      },
    ],
    [contributors, contributorsLabel, data, docs, docsLabel, hasDataPanel, mission],
  );

  const tabIds = useMemo<readonly AboutPageTabId[]>(
    () =>
      hasDataPanel
        ? ["mission", "data", "contributors", "docs"]
        : ["mission", "contributors", "docs"],
    [hasDataPanel],
  );

  useEffect(() => {
    const syncTabFromHash = () => {
      setActiveTab(getCurrentHashTab(tabIds) ?? DEFAULT_TAB);
    };

    syncTabFromHash();
    setIsEnhanced(true);
    window.addEventListener("hashchange", syncTabFromHash);
    window.addEventListener("popstate", syncTabFromHash);

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
      window.removeEventListener("popstate", syncTabFromHash);
    };
  }, [tabIds]);

  const tabItems = useMemo<PublicSegmentedTabItem<AboutPageTabId>[]>(
    () => panels.map(({ id, icon, tabLabel }) => ({ id, icon, label: tabLabel })),
    [panels],
  );

  const handleValueChange = useCallback((nextTab: AboutPageTabId) => {
    setActiveTab(nextTab);
    updateHash(nextTab);
  }, []);

  return (
    <div className="space-y-8">
      <div aria-hidden="true" className="h-0">
        {tabIds.map((tabId) => (
          <span key={tabId} id={tabId} className="block h-0 scroll-mt-28" />
        ))}
      </div>

      <PublicSegmentedTabs
        ariaLabel="About page sections"
        value={activeTab}
        onValueChange={handleValueChange}
        items={tabItems}
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
              id={`about-panel-${panel.id}`}
              role="tabpanel"
              aria-label={panel.label}
              hidden={isHidden}
              tabIndex={-1}
              className={cn("scroll-mt-28 focus:outline-none", isHidden && "hidden")}
            >
              {panel.content}
            </section>
          );
        })}
      </div>
    </div>
  );
}
