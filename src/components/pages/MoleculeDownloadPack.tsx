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

// No default count: the value must come from the molecule mapping manifest so
// it tracks the real pipeline output instead of drifting as molecules are added.
export function MoleculeDownloadPack({ moleculeCount }: { moleculeCount: number }) {
  const handleZip = useCallback(() => {
    triggerDownload("/dosewiki-molecules.zip", "dosewiki-molecules.zip");
  }, []);

  return (
    <div className="theme-card-surface flex min-w-0 flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <IconBadge icon="lucide:hexagon" size="sm" className="theme-public-card-icon theme-accent-emphasis" />
        <div className="min-w-0">
          <h3 className="theme-accent-heading font-display text-base font-semibold leading-tight">
            Molecule art pack
          </h3>
          <p className="theme-text-faint mt-1 text-xs leading-5">
            All {moleculeCount.toLocaleString()} substance structures as consistent SVGs in
            two colourways — dose.wiki brand and standard textbook element colours — plus a
            SMILES + metadata manifest. Generated from SMILES with RDKit.
          </p>
        </div>
      </div>

      {/* Preview strip */}
      <ul
        className="theme-control-pill grid grid-cols-6 gap-1.5 rounded-xl p-2"
        aria-hidden="true"
      >
        {PREVIEW_SLUGS.map((slug) => (
          <li key={slug} className="flex items-center justify-center">
            <img
              src={`/molecules/${slug}.svg`}
              alt=""
              loading="lazy"
              className="theme-molecule-image h-10 w-10 object-contain"
              draggable={false}
            />
          </li>
        ))}
      </ul>

      <Button
        onClick={handleZip}
        className="theme-control-pill theme-text-primary h-10 w-full justify-start gap-2.5 rounded-full px-3"
      >
        <IconBadge icon="lucide:download" size="sm" className="theme-public-card-icon theme-accent-emphasis" />
        <span className="min-w-0 truncate text-sm">
          <span className="font-semibold text-dose-accent-strong">Molecule pack (.zip)</span>
          <span className="theme-text-faint text-xs"> — SVGs + manifest</span>
        </span>
      </Button>
    </div>
  );
}
