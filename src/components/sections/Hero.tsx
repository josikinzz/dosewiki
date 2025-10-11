import dosewikiLogo from "../../assets/dosewiki-logo.svg";
import { HeroBadge } from "../../types/content";

interface HeroProps {
  title: string;
  subtitle?: string;
  aliases?: string[];
  placeholder: string;
  badges?: HeroBadge[];
  onCategorySelect?: (categoryKey: string) => void;
}

export function Hero({
  title,
  subtitle,
  aliases = [],
  placeholder,
  badges = [],
  onCategorySelect,
}: HeroProps) {
  const handleBadgeClick = (badge: HeroBadge) => {
    if (badge.categoryKey && onCategorySelect) {
      onCategorySelect(badge.categoryKey);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-14 text-center">
      <div className="flex flex-col items-center gap-6">
        <div
          className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#030112] via-[#07031a] to-[#110a24] text-4xl font-semibold tracking-[0.65em] text-white/35 shadow-[0_28px_65px_-36px_rgba(0,0,0,0.95)]"
          role="img"
          aria-label="Molecule placeholder image"
        >
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-[0.35em] text-white/65">
            molecule placeholder image
          </span>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#ffffff14,transparent_75%)]" aria-hidden="true" />
          <img
            src={dosewikiLogo}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 mx-auto my-auto h-44 w-44 scale-105 opacity-45 mix-blend-multiply saturate-0 brightness-75"
          />
          <span className="sr-only">{placeholder}</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-fuchsia-300 drop-shadow-[0_1px_0_rgba(255,255,255,0.1)] md:text-6xl">
          {title}
        </h1>
        {aliases.length > 0 && (
          <p className="max-w-2xl text-center text-base text-white/80 md:text-lg">
            {aliases.join(" · ")}
          </p>
        )}
        {badges.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {badges.map((badge) => {
              const Icon = badge.icon;
              const isInteractive = Boolean(badge.categoryKey && onCategorySelect);

              const content = (
                <>
                  <Icon className="h-5 w-5 text-fuchsia-200" aria-hidden="true" focusable="false" />
                  <span className="font-medium tracking-wide">{badge.label}</span>
                </>
              );

              return isInteractive ? (
                <button
                  key={`${badge.label}-${badge.categoryKey}`}
                  type="button"
                  onClick={() => handleBadgeClick(badge)}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/10 to-white/5 px-5 py-2.5 text-base text-white/90 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20 transition hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  {content}
                </button>
              ) : (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/10 to-white/5 px-5 py-2.5 text-base text-white/90 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20"
                >
                  {content}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
