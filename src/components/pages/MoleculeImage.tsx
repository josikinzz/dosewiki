import Image from "next/image";
import type { ComponentProps } from "react";

import type { AppImage } from "@/components/common/AppImage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { moleculeImageUrlForAppearance } from "@/data/mappings/moleculeOverrideUrl";
import type { ColorScheme } from "@/theme";

type MoleculeImageProps = Omit<ComponentProps<typeof AppImage>, "src" | "unoptimized"> & {
  src: string;
};

const COLOR_SCHEMES: readonly ColorScheme[] = ["dark", "light"];

/**
 * Molecule SVGs carry element colours in their bytes, so their URL, not CSS,
 * must follow the reader's colour scheme. The scheme is only known on the
 * client, and a `src` chosen after hydration paints the wrong molecule first
 * and swaps it. Both colourways are rendered instead and the root's
 * pre-painted `data-theme` selects one (utilities-theme.css); the non-default
 * variant is lazy so it is never fetched while hidden. Toggling the scheme
 * switches instantly with no remount.
 *
 * Every source here is a local `/api/molecules/` SVG, which the next/image
 * optimizer rejects, so the optimizer is bypassed unconditionally.
 */
export function MoleculeImage({ src, priority = false, loading, ...props }: MoleculeImageProps) {
  return COLOR_SCHEMES.map((scheme) => {
    const isDefaultScheme = scheme === SITE_FLAVOR_CONFIG.defaultColorScheme;
    return (
      <Image
        key={scheme}
        {...props}
        src={moleculeImageUrlForAppearance(src, scheme)}
        data-molecule-colorway={`pro-${scheme}`}
        priority={isDefaultScheme && priority}
        loading={isDefaultScheme ? (priority ? undefined : loading) : "lazy"}
        unoptimized
      />
    );
  });
}
