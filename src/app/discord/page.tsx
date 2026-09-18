import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { DiscordPage } from "@/features/effect-index/pages/DiscordPage";

const METADATA = {
  title: "Discord Chat",
  description:
    "The official Effect Index Discord community: what it is for, how to join it, and the rules its members are expected to follow.",
  route: { family: "discord" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-discord-description", "discord-intro-effect-index", "discord-rules-effect-index"]);

  return buildPublicPageMetadata({
    ...METADATA,
    description: copy.text("seo-discord-description") || METADATA.description,
  });
}

export default async function DiscordRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-discord-description", "discord-intro-effect-index", "discord-rules-effect-index"]);

  return (
    <DiscordPage
      intro={copy.text("discord-intro-effect-index")}
      rules={copy.items("discord-rules-effect-index")}
    />
  );
}
