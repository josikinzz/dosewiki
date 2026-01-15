import { memo, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, FileSignature } from "lucide-react";
import {
  SubjectInfoCard,
  SubstancesCard,
  TimelineSection,
  TextSection,
  ReportHeroSection,
} from "../reports";
import type { TripReport } from "../../types/tripReport";
import { useLibrary } from "../../data/ArticlesProvider";
import { slugify } from "../../utils/slug";

interface TripReportDetailPageProps {
  slug: string;
  fromSubstanceSlug?: string;
  onBack: () => void;
}

/**
 * Detail page for a single trip report.
 */
export const TripReportDetailPage = memo(function TripReportDetailPage({
  slug,
  fromSubstanceSlug,
  onBack,
}: TripReportDetailPageProps) {
  // Fetch report from Convex
  const report = useQuery(api.tripReports.getBySlug, { slug }) as TripReport | null | undefined;
  
  // Get library data for substance matching
  const library = useLibrary();

  // Loading state
  if (report === undefined) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
        <BackButton 
          onClick={onBack} 
          fromSubstanceSlug={fromSubstanceSlug}
          report={undefined}
          substanceBySlug={library.substanceBySlug}
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          <p className="text-sm text-white/60">Loading report...</p>
        </div>
      </main>
    );
  }

  // Not found state
  if (report === null) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
        <BackButton 
          onClick={onBack} 
          fromSubstanceSlug={fromSubstanceSlug}
          report={null}
          substanceBySlug={library.substanceBySlug}
        />
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <FileSignature className="mx-auto h-12 w-12 text-white/20" />
          <p className="mt-4 text-lg font-semibold text-white">Report not found</p>
          <p className="mt-2 text-sm text-white/60">
            The report you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      {/* Back button */}
      <BackButton 
        onClick={onBack} 
        fromSubstanceSlug={fromSubstanceSlug}
        report={report}
        substanceBySlug={library.substanceBySlug}
      />

      {/* Hero section */}
      <ReportHeroSection report={report} />

      {/* Context and substances */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <SubjectInfoCard subject={report.subject} delay={0.05} />
        <SubstancesCard substances={report.substances} delay={0.1} />
      </div>

      {/* Introduction */}
      {report.introduction && (
        <div className="mt-6">
          <TextSection
            title="Introduction"
            content={report.introduction}
            delay={0.15}
          />
        </div>
      )}

      {/* Timeline sections */}
      <div className="mt-6 space-y-6">
        {report.onset.length > 0 && (
          <TimelineSection phase="onset" entries={report.onset} delay={0.2} />
        )}
        {report.peak.length > 0 && (
          <TimelineSection phase="peak" entries={report.peak} delay={0.25} />
        )}
        {report.offset.length > 0 && (
          <TimelineSection phase="offset" entries={report.offset} delay={0.3} />
        )}
      </div>

      {/* Conclusion */}
      {report.conclusion && (
        <div className="mt-6">
          <TextSection
            title="Conclusion / Aftermath"
            content={report.conclusion}
            delay={0.35}
          />
        </div>
      )}
    </main>
  );
});

/**
 * Styled back button matching the glass pill pattern from the style guide.
 * Conditionally displays "Back to SUBSTANCE_NAME" when navigating from a substance article,
 * or "Back to Reports" when coming from the reports index or other entry points.
 */
function BackButton({ 
  onClick, 
  fromSubstanceSlug,
  report,
  substanceBySlug,
}: { 
  onClick: () => void;
  fromSubstanceSlug?: string;
  report: TripReport | null | undefined;
  substanceBySlug: Map<string, { name: string }>;
}) {
  // Determine which substance to show in the button text
  const backToSubstance = useMemo(() => {
    // First priority: use the provided fromSubstanceSlug
    if (fromSubstanceSlug) {
      const substance = substanceBySlug.get(fromSubstanceSlug);
      if (substance) {
        return substance.name;
      }
    }
    
    // Fallback: try to match report substances to known articles
    if (report && report.substances.length > 0) {
      for (const reportSubstance of report.substances) {
        const substanceName = reportSubstance.name.trim().toLowerCase();
        
        // Try exact slug match first
        const slug = slugify(reportSubstance.name);
        const bySlug = substanceBySlug.get(slug);
        if (bySlug) {
          return bySlug.name;
        }
        
        // Try name matching against all substances
        for (const [substanceSlug, substanceRecord] of substanceBySlug.entries()) {
          const title = substanceRecord.name.toLowerCase();
          if (title === substanceName) {
            return substanceRecord.name;
          }
        }
      }
    }
    
    return null;
  }, [fromSubstanceSlug, report, substanceBySlug]);

  const buttonText = backToSubstance ? `Back to ${backToSubstance}` : "Back to Reports";

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400"
    >
      <ArrowLeft className="h-4 w-4" />
      {buttonText}
    </button>
  );
}
