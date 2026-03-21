import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { IconBadge } from "@/components/common/IconBadge";
import type { TripReportSubject } from "@/types/tripReport";

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
      <h2 className="theme-text-primary mb-4 flex items-center gap-3 text-lg font-semibold">
        <IconBadge icon="lucide:user" label="Context" />
        Context
      </h2>

      {/* Trip date displayed prominently if available */}
      {hasTripDate && (
        <div className="theme-public-card-subtle mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
          <Icon icon="lucide:calendar" className="h-4 w-4 text-[color:var(--theme-accent-soft)]" />
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
                className="theme-public-card-subtle rounded-xl border p-3 transition hover:border-[color:var(--theme-card-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_76%,transparent)]"
              >
                <span className="theme-text-faint flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                  <Icon icon={iconName} className="h-3.5 w-3.5 text-[color:var(--theme-accent-soft)]" />
                  {label}
                </span>
                <p className="theme-text-primary mt-1.5 text-sm">{value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF tracker link */}
      {subject.pdf_url && (
        <div className="relative mt-4 pt-3 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent_0%,var(--theme-divider)_20%,var(--theme-divider)_80%,transparent_100%)]">
          <a
            href={subject.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[color:var(--theme-accent-soft)] transition-colors hover:text-[color:var(--theme-accent-strong)]"
          >
            <Icon icon="lucide:external-link" className="h-4 w-4" />
            Subjective Effect Tracker PDF
          </a>
        </div>
      )}
    </SectionCard>
  );
});
