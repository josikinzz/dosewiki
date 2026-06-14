"use client";

import { useCallback } from "react";
import { IconBadge } from "../common/IconBadge";
import { Button } from "@/components/ui/button";

/** A few representative structures shown as a preview strip. */
const PREVIEW_SLUGS = ["lsd", "2c-b", "psilocin", "mdma", "ketamine", "caffeine"] as const;

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function MoleculeDownloadPack({ moleculeCount = 572 }: { moleculeCount?: number }) {
  const handleZip = useCallback(() => {
    triggerDownload("/dosewiki-molecules.zip", "dosewiki-molecules.zip");
  }, []);
  const handleJson = useCallback(() => {
    triggerDownload("/dosewiki-molecules.json", "dosewiki-molecules.json");
  }, []);

  return (
    <div className="theme-card-surface flex min-w-0 flex-col gap-5 rounded-2xl border p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <IconBadge icon="lucide:hexagon" className="theme-public-card-icon theme-accent-emphasis" />
        <div className="min-w-0">
          <h3 className="theme-accent-heading font-display text-lg font-semibold leading-tight">
            Molecule art pack
          </h3>
          <p className="theme-text-faint mt-1 text-sm leading-relaxed">
            All {moleculeCount.toLocaleString()} substance structures as consistent, element
            colour-coded SVGs — uniform line weight, class-standard orientation, transparent
            background. Generated from SMILES with RDKit.
          </p>
        </div>
      </div>

      {/* Preview strip */}
      <ul
        className="theme-control-pill grid grid-cols-6 gap-2 rounded-xl p-3"
        aria-hidden="true"
      >
        {PREVIEW_SLUGS.map((slug) => (
          <li key={slug} className="flex items-center justify-center">
            <img
              src={`/molecules/${slug}.svg`}
              alt=""
              loading="lazy"
              className="theme-molecule-image h-12 w-12 object-contain sm:h-14 sm:w-14"
              draggable={false}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={handleZip}
          className="theme-control-pill theme-text-primary h-12 flex-1 justify-start gap-3 rounded-full"
        >
          <IconBadge icon="lucide:download" className="theme-public-card-icon theme-accent-emphasis" />
          <div className="flex flex-col items-start text-xs">
            <span className="text-sm font-semibold text-dose-accent-strong">SVG pack (.zip)</span>
            <span className="theme-text-faint">{moleculeCount.toLocaleString()} molecule files</span>
          </div>
        </Button>
        <Button
          onClick={handleJson}
          className="theme-control-pill theme-text-primary h-12 flex-1 justify-start gap-3 rounded-full"
        >
          <IconBadge icon="lucide:braces" className="theme-public-card-icon theme-accent-emphasis" />
          <div className="flex flex-col items-start text-xs">
            <span className="text-sm font-semibold text-dose-accent-strong">molecules.json</span>
            <span className="theme-text-faint">SMILES + metadata manifest</span>
          </div>
        </Button>
      </div>
    </div>
  );
}
