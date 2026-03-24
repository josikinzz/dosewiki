import Link from "next/link";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Button } from "@/components/ui/button";
import { getContributorPath } from "@/utils/contributors";
import { isPlainLeftClick } from "@/utils/navigation";

interface EffectContributorsSectionProps {
  contributors: string[];
  onNavigate?: (path: string) => void;
}

/**
 * Contributors section for effect articles.
 */
export function EffectContributorsSection({
  contributors,
  onNavigate,
}: EffectContributorsSectionProps) {
  if (contributors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon="lucide:users" title="Contributors" />
      <div className="flex flex-wrap gap-2">
        {contributors.map((contributor) => {
          const path = getContributorPath(contributor);

          return (
            <Button
              key={contributor}
              asChild
              variant="chip"
              size="chip"
            >
              <Link
                href={path}
                onClick={(event) => {
                  if (!onNavigate || !isPlainLeftClick(event)) {
                    return;
                  }

                  event.preventDefault();
                  onNavigate(path);
                }}
              >
                {contributor}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
