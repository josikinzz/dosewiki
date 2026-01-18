import { useState } from "react";
import { type IconName } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";

// R2 CDN base URL for EffectIndex assets
const R2_CDN_BASE = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev";

/**
 * Rewrite old /img/gallery/ URLs to R2 CDN URLs.
 */
function rewriteImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  
  // Already a full URL - return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  
  // Rewrite /img/gallery/ paths to R2 CDN
  if (url.startsWith("/img/gallery/")) {
    const filename = url.replace("/img/gallery/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }
  
  // Rewrite /img/ paths (without gallery)
  if (url.startsWith("/img/")) {
    const filename = url.replace("/img/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }
  
  // Unknown format - don't show
  return undefined;
}

interface EffectHeroProps {
  name: string;
  tags: string[];
  summary?: string;
  socialMediaImage?: string;
  onNavigate?: (path: string) => void;
}

/**
 * Hero section for effect articles.
 */
export function EffectHero({ 
  name, 
  tags, 
  summary,
  socialMediaImage,
  onNavigate,
}: EffectHeroProps) {
  const [imageError, setImageError] = useState(false);
  
  // Rewrite social media image URL if needed
  const rewrittenImageUrl = rewriteImageUrl(socialMediaImage);

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
      {/* Title with icon */}
      <div className="flex items-center gap-3 mb-4">
        <IconBadge 
          icon={getEffectIcon()} 
          label={name}
          size={28}
          className="h-12 w-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 ring-1 ring-fuchsia-400/30"
        />
        <h1 className="font-display text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
          {name}
        </h1>
      </div>

      {/* Josie Kins Attribution - left aligned under title */}
      <div className="mb-6">
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
          className="group flex items-center gap-2 rounded-full bg-white/[0.04] pl-2 pr-3 py-1.5 ring-1 ring-white/10 hover:ring-fuchsia-400/30 hover:bg-white/[0.06] transition cursor-pointer"
        >
          <img
            src="/profile-avatars/josie/avatar.webp"
            alt="Josie Kins"
            className="h-5 w-5 rounded-full object-cover ring-1 ring-white/20 group-hover:ring-fuchsia-400/50 transition"
          />
          <span className="text-xs text-white/50 group-hover:text-white/70 transition">
            Subjective Effect Index created by <span className="font-semibold text-fuchsia-200">Josie Kins</span>, 2011
          </span>
        </button>
      </div>

      {/* Social media image (if present, valid URL, and loads successfully) */}
      {rewrittenImageUrl && !imageError && (
        <div className="mb-6 max-w-sm">
          <div className="rounded-xl overflow-hidden border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 p-1">
            <img
              src={rewrittenImageUrl}
              alt={name}
              className="w-full h-auto rounded-lg"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <p className="text-sm text-white/70 leading-relaxed max-w-2xl">
          {summary}
        </p>
      )}
    </div>
  );
}
