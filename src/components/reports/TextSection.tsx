import { memo } from "react";
import type { IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";

interface TextSectionProps {
  title: string;
  content: string;
  icon?: IconName;
  delay?: number;
}

/**
 * Displays a text section (introduction or conclusion) in a trip report.
 */
export const TextSection = memo(function TextSection({
  title,
  content,
  icon,
  delay = 0,
}: TextSectionProps) {
  if (!content || content.trim().length === 0) {
    return null;
  }

  const resolvedIcon: IconName = icon ?? (title === "Introduction" ? "lucide:sunrise" : "lucide:moon");

  return (
    <SectionCard delay={delay}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={resolvedIcon} label={title} />
        {title}
      </h2>

      <p className="text-sm md:text-base leading-relaxed text-white/80 whitespace-pre-line">
        {content}
      </p>
    </SectionCard>
  );
});
