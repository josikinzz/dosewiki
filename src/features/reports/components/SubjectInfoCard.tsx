import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import {
  PublicContentSection,
} from "@/components/layout/PublicContentPrimitives";
import type { TripReportSubject } from "@/types/tripReport";

interface SubjectInfoCardProps {
  subject: TripReportSubject;
}

interface FieldConfig {
  key: keyof TripReportSubject;
  label: string;
  icon: IconName;
}

const FIELD_CONFIG: FieldConfig[] = [
  { key: "age", label: "Age", icon: "lucide:user-circle" },
  { key: "gender", label: "Gender", icon: "lucide:user" },
  { key: "height", label: "Height", icon: "lucide:ruler" },
  { key: "weight", label: "Weight", icon: "lucide:scale" },
  { key: "medications", label: "Medications", icon: "lucide:pill" },
  { key: "setting", label: "Setting", icon: "lucide:map-pin" },
];

/**
 * Displays trip report subject/author context information as compact metadata rows.
 */
export const SubjectInfoCard = memo(function SubjectInfoCard({ subject }: SubjectInfoCardProps) {
  // Filter to non-empty fields
  const visibleFields = FIELD_CONFIG.filter(({ key }) => {
    const value = subject[key];
    return value && value.toString().trim().length > 0;
  });

  // Check for trip date separately (shown in header area)
  const hasTripDate = subject.trip_date && subject.trip_date.trim().length > 0;

  if (visibleFields.length === 0 && !hasTripDate && !subject.pdf_url) {
    return null;
  }

  return (
    <PublicContentSection
      layout="plain"
      heading="Context"
      icon="lucide:user"
      className="space-y-4"
    >
      {/* Trip date displayed prominently if available */}
      {hasTripDate && (
        <PublicPill icon="lucide:calendar" tone="neutral">
          {subject.trip_date}
        </PublicPill>
      )}

      {/* Info rows */}
      {visibleFields.length > 0 && (
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          {visibleFields.map(({ key, label, icon }) => (
            <div
              key={key}
              className="min-w-0 border-t border-dose-divider pt-3"
            >
              <dt className="theme-text-faint flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                <Icon icon={icon} className="theme-icon-accent h-3.5 w-3.5 shrink-0" />
                {label}
              </dt>
              <dd className="theme-text-primary mt-1.5 min-w-0 break-words text-sm">
                {subject[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* PDF tracker link */}
      {subject.pdf_url && (
        <div className="border-t border-dose-divider pt-3">
          <a
            href={subject.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-link-muted inline-flex min-h-11 items-center gap-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
          >
            <Icon icon="lucide:external-link" className="h-4 w-4" />
            Subjective Effect Tracker PDF
          </a>
        </div>
      )}
    </PublicContentSection>
  );
});
