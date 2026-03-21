import { getPublicDataOverview, getPublicEffects } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Effects · ${overview.effectCount} records`,
    description: `Browse ${overview.effectCount} subjective effect entries in dose.wiki.`,
    pathname: "/effects",
  });
}

export default async function EffectsPage() {
  const effects = await getPublicEffects();

  return <EffectsIndexPage effectHrefPrefix="/effects/" effects={effects.map((effect) => ({ slug: effect.slug, name: effect.name, tags: effect.tags }))} />;
}
