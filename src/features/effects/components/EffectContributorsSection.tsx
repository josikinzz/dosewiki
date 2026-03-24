import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { getContributorPath } from "@/utils/contributors";
import { isPlainLeftClick } from "@/utils/navigation";

interface EffectContributorsSectionProps {
  contributors: string[];
  onNavigate?: (path: string) => void;
}

/**
 * Contributors section for effect articles.
 * Compact inline list of contributor names.
 */
export function EffectContributorsSection({
  contributors,
  onNavigate,
}: EffectContributorsSectionProps) {
  if (contributors.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-white/50">
      <Icon icon="lucide:users" size={14} className="shrink-0 text-white/40" />
      <span className="mr-1 font-medium text-white/50">Contributors:</span>
      {contributors.map((contributor, index) => {
        const path = getContributorPath(contributor);

        return (
          <span key={contributor} className="inline">
            <Link
              href={path}
              onClick={(event) => {
                if (!onNavigate || !isPlainLeftClick(event)) {
                  return;
                }
                event.preventDefault();
                onNavigate(path);
              }}
              className="text-fuchsia-300 hover:text-fuchsia-200 transition-colors"
            >
              {contributor}
            </Link>
            {index < contributors.length - 1 && (
              <span className="text-white/25 ml-1">&middot;</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
