import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { CopyrightDisclaimerPage } from "@/features/effect-index/pages/CopyrightDisclaimerPage";

const METADATA = {
  title: "Copyright Disclaimer",
  description:
    "The licence covering Effect Index material, and how to request that artwork be removed or reattributed to its original creator.",
  route: { family: "copyrightDisclaimer" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-copyright-disclaimer-description", "copyright-disclaimer-body-effect-index"]);

  return buildPublicPageMetadata({
    ...METADATA,
    description: copy.text("seo-copyright-disclaimer-description") || METADATA.description,
  });
}

export default async function CopyrightDisclaimerRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-copyright-disclaimer-description", "copyright-disclaimer-body-effect-index"]);

  return (
    <CopyrightDisclaimerPage
      disclaimer={copy.text("copyright-disclaimer-body-effect-index")}
    />
  );
}
