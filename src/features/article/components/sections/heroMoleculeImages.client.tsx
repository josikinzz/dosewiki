"use client";

import type { SyntheticEvent } from "react";
import { MoleculeImage } from "@/components/pages/MoleculeImage";

function revealLoadedMolecule(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.classList.add("theme-hero-molecule-arrive");
}

interface DesktopMoleculeImageProps {
  alt: string;
  placement: "top" | "below-title";
  src: string;
}

export function DesktopMoleculeImage({
  alt,
  placement,
  src,
}: DesktopMoleculeImageProps) {
  return (
    <div
      data-hero-molecule-layout={placement}
      className={`mb-3 hidden w-48 md:float-right md:block md:w-64${placement === "below-title" ? " mt-4" : ""}`}
    >
      <MoleculeImage
        src={src}
        alt={alt}
        width={256}
        height={256}
        priority
        sizes="(min-width: 768px) 16rem, 0px"
        onLoad={revealLoadedMolecule}
        className="theme-molecule-image h-48 w-48 object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)] md:h-64 md:w-64"
      />
    </div>
  );
}

export function MobileMoleculeImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex justify-center my-5 md:hidden">
      <MoleculeImage
        src={src}
        alt={alt}
        width={288}
        height={288}
        priority
        sizes="(max-width: 767px) min(85vw, 18rem), 0px"
        onLoad={revealLoadedMolecule}
        className="theme-molecule-image h-auto w-72 max-w-[85%] object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)]"
      />
    </div>
  );
}
