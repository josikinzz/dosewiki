import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { DonatePage } from "@/features/effect-index/pages/DonatePage";

const METADATA = {
  title: "Donate",
  description:
    "Support the Effect Index project through Patreon, the merchandise store, PayPal or Ethereum, covering hosting costs and subjective effect documentation.",
  route: { family: "donate" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();

  return buildPublicPageMetadata(METADATA);
}

export default function DonateRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <DonatePage />;
}
