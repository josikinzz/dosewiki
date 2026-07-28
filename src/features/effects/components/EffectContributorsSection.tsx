import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { resolveContributorHref, type ContributorDirectory } from "@server/contributorDirectory";

interface EffectContributorsSectionProps {
  contributors: string[];
  contributorDirectory?: ContributorDirectory;
}

/**
 * Contributors section for effect articles.
 * Compact inline list of contributor names.
 */
export function EffectContributorsSection({
  contributors,
  contributorDirectory = [],
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
      <span className="mr-1 font-medium">Contributors:</span>
      {contributors.map((contributor, index) => {
        const href = resolveContributorHref(contributor, contributorDirectory);

        return (
          <span key={contributor} className="inline">
            {href ? (
              <Link
                href={href}
                className="theme-accent-heading rounded-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
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
