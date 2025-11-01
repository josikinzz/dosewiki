import { Leaf, MessageSquarePlus } from "lucide-react";

import type { HeroBadge, MoleculeAsset, NameVariant } from "../../types/content";

interface HeroProps {
  title: string;
  subtitle?: string;
  aliases?: string[];
  nameVariants?: NameVariant[];
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
  nameVariants = [],
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
  const heroVariants = nameVariants.filter(
    (variant) => variant.kind === "botanical" || variant.kind === "alternative",
  );
  const heroVariantLines = heroVariants
    .map((variant) => {
      const Icon = variant.kind === "botanical" ? Leaf : MessageSquarePlus;
      const values = variant.values
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (values.length === 0) {
        return null;
      }

      return {
        key: variant.kind,
        Icon,
        values,
      };
    })
    .filter((entry): entry is { key: string; Icon: typeof Leaf; values: string[] } => Boolean(entry));
  const hasHeroVariantLines = heroVariantLines.length > 0;

  const handleBadgeClick = (badge: HeroBadge) => {
    if (badge.categoryKey && onCategorySelect) {
      onCategorySelect(badge.categoryKey);
    }
  };

  const defaultLineClasses = "max-w-2xl text-center font-display text-base text-white/80 md:text-lg";
  const variantLineClasses = "flex flex-wrap items-center justify-center gap-2 text-center font-display text-sm text-white/80 md:text-base";
  const hasAliases = aliases.length > 0;
  const shouldShowSubtitle = Boolean(subtitle) && !hasHeroVariantLines && !hasAliases;

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

  const isSingleMolecule = displayedAssets.length === 1;
  const heroImageGroupClasses = isSingleMolecule
    ? "relative flex w-[60vw] items-center justify-center md:w-[300px] md:max-w-[300px]"
    : "relative flex w-full flex-wrap items-center justify-center gap-6 md:gap-8";
  const heroGlowClasses = isSingleMolecule
    ? "pointer-events-none absolute inset-0 mx-auto my-auto h-full w-full max-w-[88%] rounded-full bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.2),rgba(15,10,31,0)_70%)] blur-[70px]"
    : "pointer-events-none absolute inset-0 mx-auto my-auto h-full max-h-[280px] w-full max-w-[720px] rounded-full bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.18),rgba(15,10,31,0)_72%)] blur-[85px]";

  const heroSectionClasses = hasMolecule
    ? "mx-auto max-w-6xl px-4 pb-6 pt-14 text-center"
    : "mx-auto max-w-6xl px-4 pb-4 pt-10 text-center";

  return (
    <section className={heroSectionClasses}>
      <div className="flex flex-col items-center gap-6">
        {hasMolecule && (
          <div className={heroImageGroupClasses}>
            <div aria-hidden="true" className={heroGlowClasses} />
            {isSingleMolecule ? (
              <img
                src={displayedAssets[0].url}
                alt={`${displayedAssets[0].matchedValue || title} molecule diagram`}
                className="relative z-[1] pointer-events-none h-auto w-full object-contain drop-shadow-[0_32px_60px_rgba(8,4,24,0.8)]"
              />
            ) : (
              displayedAssets.map((asset, index) => (
                <img
                  key={`${asset.filename}-${asset.matchedValue}-${index}`}
                  src={asset.url}
                  alt={`${asset.matchedValue || title} molecule diagram`}
                  className="relative z-[1] pointer-events-none h-auto w-[62vw] max-w-[220px] object-contain drop-shadow-[0_26px_50px_rgba(8,4,24,0.75)]"
                />
              ))
            )}
          </div>
        )}
        <h1 className="text-4xl font-extrabold tracking-tight text-fuchsia-300 drop-shadow-[0_1px_0_rgba(255,255,255,0.1)] md:text-6xl">
          {title}
        </h1>
        {hasHeroVariantLines ? (
          <div className="flex flex-col items-center gap-2">
            {heroVariantLines.map((line) => (
              <p key={line.key} className={variantLineClasses}>
                <line.Icon className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
                <span className="flex flex-wrap items-center justify-center gap-2 text-white/80">
                  {line.values.map((value, index) => (
                    <span key={`${line.key}-${value}-${index}`} className="flex items-center gap-2">
                      <span className="italic">{value}</span>
                      {index < line.values.length - 1 ? (
                        <span className="text-white/65">·</span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </p>
            ))}
          </div>
        ) : hasAliases ? (
          <p className={defaultLineClasses}>{aliases.join(" · ")}</p>
        ) : shouldShowSubtitle ? (
          <p className={defaultLineClasses}>{subtitle}</p>
        ) : null}
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
