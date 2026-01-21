import { type IconName } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";

interface EffectHeroProps {
  name: string;
  tags: string[];
  summary?: string;
  onNavigate?: (path: string) => void;
}

/**
 * Hero section for effect articles.
 */
export function EffectHero({
  name,
  tags,
  summary,
  onNavigate,
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
    <div className="mb-10">
      <div className="relative flex flex-col gap-6">
        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]" aria-hidden="true" />
        
        <div className="flex flex-col gap-6">
          {/* Title with icon */}
          <div className="flex items-center gap-4">
            <IconBadge 
              icon={getEffectIcon()} 
              label={name}
              size={32}
              className="h-14 w-14 shrink-0 rounded-[18px] bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 shadow-lg shadow-fuchsia-500/10 ring-1 ring-fuchsia-400/30"
            />
            <h1 className="font-display text-[2.5rem] font-bold tracking-tight text-fuchsia-300 sm:text-[3.2rem]">
              {name}
            </h1>
          </div>

          {/* Josie Kins Attribution - left aligned under title */}
          <div>
            <button
              type="button"
              onClick={() => {
                const path = "/contributors/josie";
                if (onNavigate) {
                  onNavigate(path);
                } else {
                  window.history.pushState({}, "", path);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }
              }}
              className="group flex items-center gap-2.5 rounded-full bg-white/[0.03] py-1.5 pl-1.5 pr-4 ring-1 ring-white/10 transition hover:bg-white/[0.06] hover:ring-fuchsia-400/30"
            >
              <img
                src="/profile-avatars/josie/avatar.webp"
                alt="Josie Kins"
                className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20 transition group-hover:ring-fuchsia-400/50"
              />
              <span className="text-xs tracking-wide text-white/50 transition group-hover:text-white/70">
                Subjective Effect Index created by <span className="font-semibold text-fuchsia-200/90">Josie Kins</span>, 2011
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-sm text-white/70 leading-relaxed max-w-2xl">
          {summary}
        </p>
      )}
    </div>
  );
}
