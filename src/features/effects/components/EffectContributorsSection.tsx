import { IconBadge } from "@/components/common/IconBadge";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";

/**
 * Map display names to profile slugs.
 * If a name is not in this map, it will be used as-is (lowercased).
 */
const CONTRIBUTOR_SLUG_MAP: Record<string, string> = {
  "Josie Kins": "josie",
  "Kaytwo": "kaytwo",
};

/**
 * Get the profile slug for a contributor name.
 */
function getProfileSlug(name: string): string {
  return CONTRIBUTOR_SLUG_MAP[name] ?? name.toLowerCase();
}

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

  const handleContributorClick = (name: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const slug = getProfileSlug(name);
    const path = `/contributors/${encodeURIComponent(slug)}`;
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <SectionCard delay={0.4}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:users" label="Contributors" />
        Contributors
      </h2>
      <div className="flex flex-wrap gap-2">
        {contributors.map((contributor) => (
          <Button
            key={contributor}
            variant="chip"
            size="chip"
            onClick={handleContributorClick(contributor)}
          >
            {contributor}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}
