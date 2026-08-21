"use client";

import type { ComponentProps } from "react";

import { AppImage } from "@/components/common/AppImage";
import { useTheme } from "@/context/ThemeContext";
import { moleculeImageUrlForAppearance } from "@/data/mappings/moleculeOverrideUrl";

type MoleculeImageProps = Omit<ComponentProps<typeof AppImage>, "src"> & {
  src: string;
};

/**
 * Molecule SVGs carry element colours in their bytes, so their URL—not CSS—must
 * follow the reader's colour scheme. Every public molecule image passes through
 * this client seam and updates immediately when the scheme changes.
 */
export function MoleculeImage({ src, ...props }: MoleculeImageProps) {
  const { colorScheme } = useTheme();
  const appearanceSrc = moleculeImageUrlForAppearance(src, colorScheme);

  return <AppImage {...props} src={appearanceSrc} />;
}
