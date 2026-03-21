import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { type IconName } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";

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
    
    return "lucide:sparkles";
  };

  return (
    <section className="theme-article-hero relative overflow-hidden rounded-2xl border p-6 shadow-2xl ring-1 ring-white/5">
      <div className="pointer-events-none absolute -left-14 -top-14 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[88px]" aria-hidden="true" />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-4 sm:gap-5">
          <IconBadge
            icon={getEffectIcon()}
            label={name}
            size={32}
            className="h-14 w-14 shrink-0 rounded-[18px] bg-gradient-to-br from-fuchsia-500/18 to-violet-500/18 shadow-lg shadow-fuchsia-500/8 ring-1 ring-fuchsia-400/22"
          />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-3">
              <h1 className="font-display text-[2.25rem] font-bold tracking-tight text-fuchsia-200 sm:text-[2.8rem]">
                {name}
              </h1>
              <Link
                href="/contributors/josie"
                className="group inline-flex max-w-full items-center gap-2.5 rounded-full bg-white/[0.025] py-1.5 pl-1.5 pr-4 ring-1 ring-white/10 transition hover:bg-white/[0.05] hover:ring-fuchsia-400/25"
              >
                <AppImage
                  src="/profile-avatars/josie/avatar.webp"
                  alt="Josie Kins"
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20 transition group-hover:ring-fuchsia-400/50"
                />
                <span className="text-xs tracking-wide text-white/56 transition group-hover:text-white/74">
                  Subjective Effect Index created by <span className="font-semibold text-fuchsia-200/90">Josie Kins</span>, 2011
                </span>
              </Link>
            </div>

            {summary ? (
              <p className="max-w-3xl text-sm leading-7 text-white/78 sm:text-[1rem]">
                {summary}
              </p>
            ) : null}

            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
