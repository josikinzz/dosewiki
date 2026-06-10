import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ExplainerFrame } from "../_components/ExplainerFrame";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How dose.wiki is built",
    description:
      "An educational tour of the dose.wiki codebase: its architecture, data pipeline, and the systems that power the public site.",
    pathname: "/docs/code",
  });
}

export default function DocsCodePage() {
  return (
    <ExplainerFrame
      src="/docs/code.html"
      title="How dose.wiki is built"
    />
  );
}
