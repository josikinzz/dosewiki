import { memo } from "react";
import { Icon, type IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { TripReportSubject } from "../../types/tripReport";

interface SubjectInfoCardProps {
  subject: TripReportSubject;
  delay?: number;
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
 * Displays trip report subject/author context information as a tile grid.
 */
export const SubjectInfoCard = memo(function SubjectInfoCard({ subject, delay = 0 }: SubjectInfoCardProps) {
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
    <SectionCard delay={delay}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:user" label="Context" />
        Context
      </h2>

      {/* Trip date displayed prominently if available */}
      {hasTripDate && (
        <div className="mb-4 flex items-center gap-2 text-sm text-white/70">
          <Icon icon="lucide:calendar" className="h-4 w-4 text-fuchsia-200" />
          <span>{subject.trip_date}</span>
        </div>
      )}

      {/* Info tiles grid */}
      {visibleFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleFields.map(({ key, label, icon: iconName }) => {
            const value = subject[key];
            return (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/40 hover:bg-white/8"
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  <Icon icon={iconName} className="h-3.5 w-3.5 text-fuchsia-200/70" />
                  {label}
                </span>
                <p className="mt-1.5 text-sm text-white/90">{value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF tracker link */}
      {subject.pdf_url && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <a
            href={subject.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-fuchsia-200 hover:text-fuchsia-100 transition-colors"
          >
            <Icon icon="lucide:external-link" className="h-4 w-4" />
            Subjective Effect Tracker PDF
          </a>
        </div>
      )}
    </SectionCard>
  );
});
