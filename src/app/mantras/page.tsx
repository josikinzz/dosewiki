import type { Metadata } from "next";

import { buildPublicPageMetadata } from "@server/next/publicSite";
import { MantraVisionApp } from "@/features/mantras/MantraVisionApp";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Mantra Vision Mandala | ${SITE_FLAVOR_CONFIG.name}`,
  description:
    "A full-screen contemplative field of source-attributed Buddhist liberation-upon-seeing mantra forms rendered in Tibetan script with custom visualizations.",
  pathname: "/mantras",
  noIndex: true,
});

export default function MantrasPage() {
  return <MantraVisionApp />;
}
