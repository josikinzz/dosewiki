import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ExplainerFrame } from "../_components/ExplainerFrame";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How dose.wiki articles are made",
    description:
      "An honest, detailed walkthrough of the dose.wiki content pipeline: scraping, quote extraction, AI synthesis, citations, and human expert review.",
    pathname: "/docs/how",
  });
}

export default function DocsHowPage() {
  return (
    <ExplainerFrame
      src="/docs/how.html"
      title="How dose.wiki articles are made"
    />
  );
}
