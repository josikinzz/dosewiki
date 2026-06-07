import Link from "next/link";
import { type IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import {
  PublicAttributionSection,
  PublicDetailHero,
} from "@/components/layout/PublicContentPrimitives";

interface EffectHeroProps {
  name: string;
  tags: string[];
  summary?: string;
}

/**
 * Hero section for effect articles.
 */
export function EffectHero({
  name,
  tags,
  summary,
}: EffectHeroProps) {
  // Get icon based on primary tag
  const getEffectIcon = (): IconName => {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    
    if (tagSet.has("visual")) return "lucide:eye";
    if (tagSet.has("auditory")) return "lucide:ear";
    if (tagSet.has("cognitive")) return "fluent:thinking-24-regular";
    if (tagSet.has("physical")) return "lucide:activity";
    if (tagSet.has("tactile")) return "lucide:hand";
    if (tagSet.has("multisensory")) return "lucide:cog";
    if (tagSet.has("smell and taste")) return "lucide:utensils";
    if (tagSet.has("geometric")) return "lucide:shapes";
    if (tagSet.has("hallucinatory state")) return "custom:elf";
    
    return icons.subjectiveEffectIndex;
  };

  return (
    <PublicDetailHero
      kind="effect"
      title={name}
      icon={getEffectIcon()}
      iconLabel={name}
      titleClassName="text-4xl sm:text-5xl md:text-6xl"
      summary={summary}
      tags={tags}
      attribution={
        <PublicAttributionSection
          align="start"
          avatarSrc="/profile-avatars/josie/avatar.webp"
          avatarAlt="Josie Kins"
          avatarHref="/contributors/josie"
          className="[&>div]:rounded-full [&>div]:py-1.5 [&>div]:pl-1.5 [&>div]:pr-4"
        >
          <span className="theme-text-faint tracking-wide transition group-hover:opacity-90">
            Subjective Effect Index created by{" "}
            <Link
              href="/contributors/josie"
              className="theme-accent-heading font-semibold transition hover:opacity-90"
            >
              Josie Kins
            </Link>
            , 2011
          </span>
        </PublicAttributionSection>
      }
    />
  );
}
