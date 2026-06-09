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
  const logoStyle = {
    ...style,
    WebkitMaskImage: `url(${logoSource})`,
    maskImage: `url(${logoSource})`,
  } as CSSProperties;

  return (
    <span
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : alt}
      aria-hidden={ariaHidden}
      data-intrinsic-width={width}
      data-intrinsic-height={height}
      className={["theme-dosewiki-logo", className].filter(Boolean).join(" ")}
      draggable={draggable}
      style={logoStyle}
    />
  );
}
