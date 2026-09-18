import Link from "next/link";
import { formatMessage, type Translate } from "@/i18n/messages";
import { Icon } from "@/components/common/Icon";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { resolveContributorHref, type ContributorDirectory } from "@server/contributorDirectory";

interface EffectContributorsSectionProps {
  contributors: string[];
  contributorDirectory?: ContributorDirectory;
  t?: Translate;
}

/**
 * Contributors section for effect articles.
 * Compact inline list of contributor names.
 */
export function EffectContributorsSection({
  contributors,
  contributorDirectory = [],
  t = formatMessage,
}: EffectContributorsSectionProps) {
  if (contributors.length === 0) {
    return null;
  }

  return (
    <PublicAttributionSection
      align="start"
      className="[&>div]:justify-start"
    >
      <Icon icon="lucide:users" size={14} className="theme-icon-muted shrink-0" />
      <span className="mr-1 font-medium">{t("Contributors:")}</span>
      {contributors.map((contributor, index) => {
        const href = resolveContributorHref(contributor, contributorDirectory);

        return (
          <span key={contributor} className="inline">
            {href ? (
              <Link
                href={href}
                className="theme-accent-heading theme-focus-ring rounded-sm transition hover:opacity-90"
              >
                {contributor}
              </Link>
            ) : (
              <span className="theme-text-secondary">{contributor}</span>
            )}
            {index < contributors.length - 1 && (
              <span className="theme-text-faint ml-1">&middot;</span>
            )}
          </span>
        );
      })}
    </PublicAttributionSection>
  );
}
