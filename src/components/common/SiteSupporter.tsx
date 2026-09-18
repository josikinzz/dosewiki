"use client";

/**
 * The supporter credit, currently rendered on the About page only.
 *
 * "Supported by", not "sponsored by": the named company pays the publication's
 * infrastructure bills and holds no ownership or editorial stake, so the link is an
 * ordinary external one — `rel="sponsored"` is for paid placements and would withhold
 * link equity from a supporter that is being credited, not advertised.
 *
 * This is an attribution claim, so it is flavor-owned: a publication with no supporter
 * declares `footer.supporter: null` and this renders nothing.
 *
 * It is a two-row lockup, not a sentence: a small tracked uppercase label over the mark.
 * Stacking is what lets the mark carry the credit — set on one line the two compete for
 * the same optical weight, and any mark large enough to be legible drags the label up
 * with it. Stacked, the label can stay small print while the mark roughly doubles it.
 *
 * Like {@link DoseWikiLogo}, the mark is not an `<img>`: it is a `<span>` with a
 * background colour and a CSS mask. `mask-mode` resolves to alpha for image sources, so
 * only the silhouette reaches the screen and one monochrome file reads correctly in both
 * themes. The height is fixed and `aspect-ratio` derives the width. The mark sits one
 * tone above the label so the eye lands on the supporter's name, not on "Supported by".
 */
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

interface SiteSupporterProps {
  /**
   * Cross-axis alignment of the two stacked rows. The About page centres it. Passing
   * this rather than letting a caller hand in `items-*` classes keeps the two rows from
   * disagreeing: Tailwind resolves competing `items-*` by stylesheet order, not by
   * class-list order.
   */
  align?: "start" | "center" | "end";
  className?: string;
  /** Injected for tests and the kit catalog; defaults to the ambient build-time flavor. */
  config?: SiteFlavorConfig;
  /** Mark height in `rem`. The width follows from the asset's aspect ratio. */
  markHeightRem?: number;
}

export function SiteSupporter({
  align = "start",
  className,
  config = SITE_FLAVOR_CONFIG,
  markHeightRem = 1.5,
}: SiteSupporterProps) {
  const t = useT();
  const supporter = config.footer.supporter;

  if (!supporter) {
    return null;
  }

  return (
    <a
      href={supporter.href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "theme-site-supporter inline-flex w-fit flex-col gap-1.5",
        align === "center" ? "items-center" : align === "end" ? "items-end" : "items-start",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="theme-site-supporter-label">{t(supporter.prefix)}</span>
      <span
        role="img"
        aria-label={supporter.alt}
        className="theme-site-supporter-mark"
        style={{
          height: `${markHeightRem}rem`,
          aspectRatio: supporter.markAspectRatio,
          WebkitMaskImage: `url(${supporter.markPath})`,
          maskImage: `url(${supporter.markPath})`,
        }}
      />
    </a>
  );
}
