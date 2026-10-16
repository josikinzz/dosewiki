"use client";

import type { CSSProperties } from "react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";
import dosewikiLogoAssetImport from "../../assets/dosewiki-logo.svg";

type LogoAsset = string | { src: string };

interface DoseWikiLogoProps {
  /** Overrides the flavor's accessible label. Omit to get the flavored default. */
  alt?: string;
  ariaHidden?: boolean;
  className?: string;
  draggable?: boolean;
  height: number;
  style?: CSSProperties;
  width: number;
}

const dosewikiLogoAsset = dosewikiLogoAssetImport as LogoAsset;
const dosewikiLogoSource =
  typeof dosewikiLogoAsset === "string" ? dosewikiLogoAsset : dosewikiLogoAsset.src;

/**
 * The site mark.
 *
 * This is not an `<img>`: it is a `<span>` whose background is `--theme-logo-fill` and
 * whose CSS mask is the SVG. `mask-mode` resolves to alpha for image sources, so the
 * asset's own fill colours never reach the screen — only its silhouette does. A flavor
 * therefore only has to supply a different silhouette, not a recoloured file.
 *
 * dose.wiki's mark comes through the bundler (hashed, immutable URL); Effect Index's comes
 * from `public/`, which leaves the default flavor's emitted URL untouched.
 */
export function DoseWikiLogo({
  alt,
  ariaHidden = false,
  className,
  draggable = false,
  height,
  style,
  width,
}: DoseWikiLogoProps) {
  const t = useT();
  const logoSource = SITE_FLAVOR_CONFIG.logo.markPath ?? dosewikiLogoSource;
  const resolvedAlt = t(alt ?? SITE_FLAVOR_CONFIG.logo.alt);

  const logoStyle = {
    ...style,
    WebkitMaskImage: `url(${logoSource})`,
    maskImage: `url(${logoSource})`,
  } as CSSProperties;

  return (
    <span
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : resolvedAlt}
      aria-hidden={ariaHidden}
      data-intrinsic-width={width}
      data-intrinsic-height={height}
      className={["theme-dosewiki-logo", className].filter(Boolean).join(" ")}
      draggable={draggable}
      style={logoStyle}
    />
  );
}
