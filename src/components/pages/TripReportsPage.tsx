import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FileSignature, LayoutList, User, FlaskConical } from "lucide-react";
import { PageHeader } from "../layout/PageHeader";
import { ReportCard } from "../reports/ReportCard";
import type { TripReport, ReportViewMode } from "../../types/tripReport";

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
  const [viewMode, setViewMode] = useState<ReportViewMode>("substance");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Fetch reports from Convex
  const reports = useQuery(api.tripReports.getAll) ?? [];

  // Group and sort reports based on view mode
  const groupedReports = useMemo(() => {
    if (viewMode === "title") {
      // Sort by title
      const sorted = [...reports].sort((a, b) =>
        sortDirection === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      return { "All Reports": sorted };
    }

    if (viewMode === "author") {
      // Group by author
      const groups: Record<string, TripReport[]> = {};
      for (const report of reports) {
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

    for (const report of reports) {
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
  }, [reports, viewMode, sortDirection]);

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
      {reports.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          <p className="text-sm text-white/60">Loading trip reports...</p>
        </div>
      )}

      {/* Reports list */}
      {Object.entries(groupedReports).map(([groupName, groupReports]) => (
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
      {reports.length > 0 && Object.keys(groupedReports).length === 0 && (
        <div className="mt-12 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <p className="text-white/60">No reports found.</p>
        </div>
      )}
    </main>
  );
});
