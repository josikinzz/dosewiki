import Link from "next/link";
import { IconBadge } from "@/components/common/IconBadge";
import { SectionCard } from "@/components/common/SectionCard";
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
    <SectionCard delay={0.4}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:users" label="Contributors" />
        Contributors
      </h2>
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
    </SectionCard>
  );
}
