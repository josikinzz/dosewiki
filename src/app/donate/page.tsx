import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { DonatePage } from "@/features/effect-index/pages/DonatePage";

const METADATA = {
  title: "Donate",
  description:
    "Support the Effect Index project through Patreon, the merchandise store, PayPal or Ethereum, covering hosting costs and subjective effect documentation.",
  route: { family: "donate" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-donate-description", "donate-intro-effect-index"]);

  return buildPublicPageMetadata({
    ...METADATA,
    description: copy.text("seo-donate-description") || METADATA.description,
  });
}

export default async function DonateRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-donate-description", "donate-intro-effect-index"]);

  return (
    <DonatePage
      intro={copy.text("donate-intro-effect-index")}
    />
  );
}
