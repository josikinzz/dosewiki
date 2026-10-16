"use client";

import type { CSSProperties } from "react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";
import dosewikiLogoAssetImport from "../../assets/dosewiki-logo.svg";

type LogoAsset = string | { src: string };

interface DoseWikiLogoProps {
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
