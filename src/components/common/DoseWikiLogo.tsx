import type { CSSProperties } from "react";

import logoAssetImport from "../../assets/dosewiki-logo.svg";

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

const logoAsset = logoAssetImport as LogoAsset;
const logoSource = typeof logoAsset === "string" ? logoAsset : logoAsset.src;

export function DoseWikiLogo({
  alt = "dose.wiki logo",
  ariaHidden = false,
  className,
  draggable = false,
  height,
  style,
  width,
}: DoseWikiLogoProps) {
  return (
    <img
      src={logoSource}
      alt={ariaHidden ? "" : alt}
      aria-hidden={ariaHidden}
      width={width}
      height={height}
      className={className}
      draggable={draggable}
      style={style}
    />
  );
}
