import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
import { MantraVisionApp } from "@/features/mantras/MantraVisionApp";

export async function generateMetadata() {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "Mantra Vision Mandala",
    description:
      copy.text("seo-mantras-description") ||
      "A full-screen contemplative field of source-attributed Buddhist liberation-upon-seeing mantra forms rendered in Tibetan script with custom visualizations.",
    pathname: "/mantras",
    noIndex: true,
  });
}

export default function MantrasPage() {
  return <MantraVisionApp />;
}
