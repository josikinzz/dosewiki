import Image from "next/image";
import type { ComponentProps } from "react";

import type { AppImage } from "@/components/common/AppImage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { moleculeImageUrlForAppearance } from "@/data/mappings/moleculeOverrideUrl";
import type { ColorScheme } from "@/theme";

type MoleculeImageProps = Omit<ComponentProps<typeof AppImage>, "src" | "unoptimized"> & {
  src: string;
  onLoad?: ComponentProps<typeof Image>["onLoad"];
};

const COLOR_SCHEMES: readonly ColorScheme[] = ["dark", "light"];

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
