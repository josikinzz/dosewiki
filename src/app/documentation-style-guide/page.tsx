import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { DocumentationStyleGuidePage } from "@/features/effect-index/pages/DocumentationStyleGuidePage";

const METADATA = {
  title: "Documentation Style Guide",
  description:
    "The house style the Subjective Effect Index is written in: how subjective effects are described, how levels of intensity are introduced, and which words are preferred.",
  route: { family: "documentationStyleGuide" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();

  return buildPublicPageMetadata(METADATA);
}

export default function DocumentationStyleGuideRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <DocumentationStyleGuidePage />;
}
