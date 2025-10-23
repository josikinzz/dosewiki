import type { HeroBadge, MoleculeAsset } from "../../types/content";

interface HeroProps {
  title: string;
  subtitle?: string;
  aliases?: string[];
  placeholder: string;
  moleculeAsset?: MoleculeAsset;
  moleculeAssets?: MoleculeAsset[];
  badges?: HeroBadge[];
  badgeVariant?: "default" | "compact";
  onCategorySelect?: (categoryKey: string) => void;
}

export function Hero({
  title,
  subtitle,
  aliases = [],
  placeholder: _placeholder,
  moleculeAsset,
  moleculeAssets,
  badges = [],
  badgeVariant = "default",
  onCategorySelect,
}: HeroProps) {
  const isCompactBadges = badgeVariant === "compact";
  const displayedAssets = (moleculeAssets?.length ? moleculeAssets : moleculeAsset ? [moleculeAsset] : []).slice(0, 3);
  const hasMolecule = displayedAssets.length > 0;

  const handleBadgeClick = (badge: HeroBadge) => {
    if (badge.categoryKey && onCategorySelect) {
      onCategorySelect(badge.categoryKey);
    }
  };

  const badgeWrapperClasses = isCompactBadges
    ? "mt-4 flex flex-wrap justify-center gap-3 gap-fallback-wrap-3"
    : "mt-6 flex flex-wrap justify-center gap-4 gap-fallback-wrap-4";
  const badgeIconClasses = isCompactBadges
    ? "h-4 w-4 text-fuchsia-200"
    : "h-5 w-5 text-fuchsia-200";
  const badgeLabelClasses = isCompactBadges
    ? "text-sm font-medium tracking-tight"
    : "font-medium tracking-wide";
  const baseBadgeClasses = isCompactBadges
    ? "inline-flex items-center gap-1.5 gap-fallback-row-tight rounded-full bg-gradient-to-tr from-white/12 to-white/6 px-3.5 py-1.5 text-sm text-white/90 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20"
    : "inline-flex items-center gap-2 gap-fallback-row-2 rounded-full bg-gradient-to-tr from-white/10 to-white/5 px-5 py-2.5 text-base text-white/90 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20";
  const interactiveBadgeClasses = isCompactBadges
    ? `${baseBadgeClasses} transition hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400`
    : `${baseBadgeClasses} transition hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400`;

  const heroImageGroupClasses =
    "relative flex w-full flex-wrap items-center justify-center gap-6 md:gap-8";

  const heroSectionClasses = hasMolecule
    ? "mx-auto max-w-6xl px-4 pb-6 pt-14 text-center"
    : "mx-auto max-w-6xl px-4 pb-4 pt-10 text-center";

  return (
    <section className={heroSectionClasses}>
      <div className="flex flex-col items-center gap-6">
        {hasMolecule && (
          <div className={heroImageGroupClasses}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 mx-auto my-auto h-full max-h-[280px] w-full max-w-[720px] rounded-full bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.18),rgba(15,10,31,0)_72%)] blur-[85px]"
            />
            {displayedAssets.map((asset, index) => (
              <img
                key={`${asset.filename}-${asset.matchedValue}-${index}`}
                src={asset.url}
                alt={`${asset.matchedValue || title} molecule diagram`}
                className="relative z-[1] pointer-events-none h-auto w-[62vw] max-w-[220px] object-contain drop-shadow-[0_26px_50px_rgba(8,4,24,0.75)]"
              />
            ))}
          </div>
        )}
        <h1 className="text-4xl font-extrabold tracking-tight text-fuchsia-300 drop-shadow-[0_1px_0_rgba(255,255,255,0.1)] md:text-6xl">
          {title}
        </h1>
        {aliases.length > 0 && (
          <p className="max-w-2xl text-center text-base text-white/80 md:text-lg">
            {aliases.join(" · ")}
          </p>
        )}
        {badges.length > 0 && (
          <div className={badgeWrapperClasses}>
            {badges.map((badge) => {
              const Icon = badge.icon;
              const isInteractive = Boolean(badge.categoryKey && onCategorySelect);

              const content = (
                <>
                  <Icon className={badgeIconClasses} aria-hidden="true" focusable="false" />
                  <span className={badgeLabelClasses}>{badge.label}</span>
                </>
              );

              return isInteractive ? (
                <button
                  key={`${badge.label}-${badge.categoryKey}`}
                  type="button"
                  onClick={() => handleBadgeClick(badge)}
                  className={interactiveBadgeClasses}
                >
                  {content}
                </button>
              ) : (
                <span
                  key={badge.label}
                  className={baseBadgeClasses}
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
