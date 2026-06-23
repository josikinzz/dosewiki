import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";

interface TextSectionProps {
  title: string;
  content: string;
  icon?: IconName;
}

/**
 * Prose section (introduction or conclusion) of a trip report, typeset as
 * open article text rather than boxed in a card.
 */
export const TextSection = memo(function TextSection({
  title,
  content,
  icon,
}: TextSectionProps) {
  if (!content || content.trim().length === 0) {
    return null;
  }

  const resolvedIcon: IconName = icon ?? "lucide:book-open-text";

  return (
    <section>
      <h2 className="theme-accent-heading flex items-center gap-2.5 text-xl font-bold tracking-tight">
        <Icon icon={resolvedIcon} size={22} />
        {title}
      </h2>
      <p className="theme-text-secondary mt-4 whitespace-pre-line text-[0.9375rem] leading-[1.75]">
        {content}
      </p>
    </section>
  );
});
