import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FileSignature, LayoutList, User, FlaskConical } from "lucide-react";
import { PageHeader } from "../layout/PageHeader";
import { ReportCard } from "../reports/ReportCard";
import type { TripReport, ReportViewMode } from "../../types/tripReport";
import { getConvexUrl, isConvexEnabled } from "../../lib/convex";

interface TripReportsPageProps {
  onSelectReport: (slug: string) => void;
}

const VIEW_MODES: { key: ReportViewMode; label: string; icon: typeof LayoutList }[] = [
  { key: "substance", label: "Substance", icon: FlaskConical },
  { key: "title", label: "Title", icon: LayoutList },
  { key: "author", label: "Author", icon: User },
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
        icon={FileSignature}
        description="A collection of high-quality, consistently formatted trip reports documenting subjective experiences with various substances. These reports serve as anecdotal accounts supporting the documented effects in our Subjective Effect Index."
      />

      {/* View mode selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {VIEW_MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleViewModeClick(key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              viewMode === key
                ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {viewMode === key && (
              <span className="text-xs opacity-70">
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            )}
          </button>
        ))}
      </div>

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
        icon={FileSignature}
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
