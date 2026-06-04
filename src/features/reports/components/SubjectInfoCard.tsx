import { memo } from "react";
import { type IconName } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import {
  PublicContentSection,
  PublicFactTile,
  PublicMetadataList,
  type PublicMetadataListItem,
} from "@/components/layout/PublicContentPrimitives";
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
    <PublicContentSection
      layout="card"
      delay={delay}
      heading="Context"
      icon="lucide:user"
    >

      {/* Trip date displayed prominently if available */}
      {hasTripDate && (
        <PublicPill icon="lucide:calendar" tone="neutral" className="mb-4">
          {subject.trip_date}
        </PublicPill>
      )}

      {/* Info tiles grid */}
      {visibleFields.length > 0 && (
        <PublicMetadataList
          items={
            visibleFields.map(({ key, label, icon }) => ({
              key,
              label,
              icon,
              value: subject[key],
            })) satisfies PublicMetadataListItem[]
          }
        />
      )}

      {/* PDF tracker link */}
      {subject.pdf_url && (
        <div className="relative mt-4 pt-3 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-fuchsia-400/20 before:to-transparent">
          <PublicFactTile
            icon="lucide:external-link"
            label="Tracker PDF"
            value="Subjective Effect Tracker PDF"
            href={subject.pdf_url}
          />
        </div>
      )}
    </PublicContentSection>
  );
});
