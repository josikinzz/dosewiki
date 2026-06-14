import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ExplainerFrame } from "../_components/ExplainerFrame";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How you can use dose.wiki",
    description:
      "Licensing and reuse for dose.wiki: our content and dataset are public domain (CC0), the code is MIT, and the trip reports, interaction, and reagent-test data keep their own terms.",
    pathname: "/docs/license",
  });
}

export default function DocsLicensePage() {
  return (
    <ExplainerFrame
      src="/docs/license.html"
      title="How you can use dose.wiki"
    />
  );
}
