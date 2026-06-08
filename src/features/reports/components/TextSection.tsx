import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";

interface TextSectionProps {
  title: string;
  content: string;
  icon?: IconName;
}

/**
 * Displays a text section (introduction or conclusion) in a trip report.
 */
export const TextSection = memo(function TextSection({
  title,
  content,
  icon,
}: TextSectionProps) {
  if (!content || content.trim().length === 0) {
    return null;
  }

  const resolvedIcon: IconName = icon ?? (title === "Introduction" ? "lucide:sunrise" : "lucide:moon");

  return (
    <PublicContentSection
      layout="card"
      heading={title}
      icon={resolvedIcon}
      className="space-y-4"
    >
      <p className="theme-text-secondary whitespace-pre-line text-sm leading-relaxed md:text-base">
        {content}
      </p>
    </PublicContentSection>
  );
});
