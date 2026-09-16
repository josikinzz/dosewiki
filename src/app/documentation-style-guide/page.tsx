import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { DocumentationStyleGuidePage } from "@/features/effect-index/pages/DocumentationStyleGuidePage";

const METADATA = {
  title: "Documentation Style Guide",
  description:
    "The house style the Subjective Effect Index is written in: how subjective effects are described, how levels of intensity are introduced, and which words are preferred.",
  route: { family: "documentationStyleGuide" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-documentation-style-guide-description"]);

  return buildPublicPageMetadata({
    ...METADATA,
    description:
      copy.text("seo-documentation-style-guide-description") ||
      METADATA.description,
  });
}

export default function DocumentationStyleGuideRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <DocumentationStyleGuidePage />;
}
