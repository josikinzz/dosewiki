import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Icon, type IconName } from "@/components/common/Icon";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportCard } from "../components/ReportCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TripReport, ReportViewMode } from "@/types/tripReport";
import { getConvexUrl, isConvexEnabled } from "@/lib/convex";

interface TripReportsPageProps {
  onSelectReport: (slug: string) => void;
}

const VIEW_MODES: { key: ReportViewMode; label: string; icon: IconName }[] = [
  { key: "substance", label: "Substance", icon: "lucide:flask-conical" },
  { key: "title", label: "Title", icon: "lucide:layout-list" },
  { key: "author", label: "Author", icon: "lucide:user" },
];

/**
 * Trip reports listing page with view mode selector.
 */
export const TripReportsPage = memo(function TripReportsPage({
  onSelectReport,
}: TripReportsPageProps) {
  const convexEnabled = isConvexEnabled();

  if (!convexEnabled) {
    return <TripReportsUnavailable />;
  }

  return <TripReportsPageContent onSelectReport={onSelectReport} />;
});

const TripReportsPageContent = memo(function TripReportsPageContent({
  onSelectReport,
}: TripReportsPageProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>("substance");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const showConvexDebug =
    import.meta.env.DEV || import.meta.env.VITE_SHOW_CONVEX_DEBUG === "true";
  const convexUrl = getConvexUrl();

  // Fetch reports from Convex
  const reports = useQuery(api.tripReports.getAll);
  const isLoading = reports === undefined;
  const resolvedReports = reports ?? [];

  // Group and sort reports based on view mode
  const groupedReports = useMemo(() => {
    if (viewMode === "title") {
      // Sort by title
      const sorted = [...resolvedReports].sort((a, b) =>
        sortDirection === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      return { "All Reports": sorted };
    }

    if (viewMode === "author") {
      // Group by author
      const groups: Record<string, TripReport[]> = {};
      for (const report of resolvedReports) {
        const author = report.subject.name;
        if (!groups[author]) {
          groups[author] = [];
        }
        groups[author].push(report);
      }
      
      // Sort groups and reports within groups
      const sortedKeys = Object.keys(groups).sort((a, b) =>
        sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a)
      );
      
      const result: Record<string, TripReport[]> = {};
      for (const key of sortedKeys) {
        result[key] = groups[key].sort((a, b) => a.title.localeCompare(b.title));
      }
      return result;
    }

    // Default: group by substance
    const groups: Record<string, TripReport[]> = {};
    const combinationsReports: TripReport[] = [];

    for (const report of resolvedReports) {
      if (report.substances.length > 1) {
        combinationsReports.push(report);
      } else if (report.substances.length === 1) {
        const substance = report.substances[0].name;
        if (!groups[substance]) {
          groups[substance] = [];
        }
        groups[substance].push(report);
      }
    }

    // Sort groups
    const sortedKeys = Object.keys(groups).sort((a, b) =>
      sortDirection === "asc" ? a.localeCompare(b) : b.localeCompare(a)
    );

    const result: Record<string, TripReport[]> = {};
    for (const key of sortedKeys) {
      result[key] = groups[key].sort((a, b) => a.title.localeCompare(b.title));
    }

    // Add combinations at the end
    if (combinationsReports.length > 0) {
      result["Combinations"] = combinationsReports.sort((a, b) =>
        a.title.localeCompare(b.title)
      );
    }

    return result;
  }, [resolvedReports, viewMode, sortDirection]);

  const handleViewModeClick = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setViewMode(mode);
      setSortDirection("asc");
    }
  };

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title="Trip Reports"
        icon="lucide:file-signature"
        description="A collection of high-quality, consistently formatted trip reports documenting subjective experiences with various substances. These reports serve as anecdotal accounts supporting the documented effects in our Subjective Effect Index."
      />

      {/* View mode selector */}
      <Tabs value={viewMode} className="mt-6 mb-8 flex justify-center">
        <TabsList className="flex-wrap h-auto bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-1">
          {VIEW_MODES.map(({ key, label, icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              onClick={() => handleViewModeClick(key)}
              className="gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 text-[0.9375rem] font-medium text-white/60"
            >
              <Icon icon={icon} size={18} />
              {label}
              {viewMode === key && (
                <span className="text-xs opacity-70">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {isLoading && (
        <div className="mt-12 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          <p className="text-sm text-white/60">Loading trip reports...</p>
        </div>
      )}

      {/* Reports list */}
      {!isLoading && Object.entries(groupedReports).map(([groupName, groupReports]) => (
        <div key={groupName} className="mt-8">
          {viewMode !== "title" && (
            <h2 className="mb-4 text-lg font-semibold text-fuchsia-300">
              {groupName}
            </h2>
          )}
          <div className="space-y-3">
            {groupReports.map((report) => (
              <ReportCard
                key={report.slug}
                report={report}
                onClick={() => onSelectReport(report.slug)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {!isLoading && resolvedReports.length === 0 && (
        <div className="mt-12 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <p className="text-white/60">No reports found.</p>
          {showConvexDebug && (
            <div className="mt-4 space-y-1 text-xs text-white/45">
              <p>Convex enabled: yes</p>
              <p>Convex URL: {convexUrl ?? "unset"}</p>
              <p>Reports returned: 0</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
});

function TripReportsUnavailable() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title="Trip Reports"
        icon="lucide:file-signature"
        description="A collection of high-quality, consistently formatted trip reports documenting subjective experiences with various substances. These reports serve as anecdotal accounts supporting the documented effects in our Subjective Effect Index."
      />
      <div className="mt-12 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
        <p className="text-sm text-white/70">Trip reports are unavailable in this deployment.</p>
        <p className="mt-2 text-xs text-white/50">
          Connect a Convex deployment to enable reports.
        </p>
      </div>
    </main>
  );
}
