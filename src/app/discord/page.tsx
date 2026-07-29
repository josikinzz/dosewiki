import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { DiscordPage } from "@/features/effect-index/pages/DiscordPage";

const METADATA = {
  title: "Discord Chat",
  description:
    "The official Effect Index Discord community: what it is for, how to join it, and the rules its members are expected to follow.",
  route: { family: "discord" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();

  return buildPublicPageMetadata(METADATA);
}

export default function DiscordRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <DiscordPage />;
}
