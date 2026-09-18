import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

export const dynamicParams = true;

export async function generateStaticParams() {
  // Pure redirect shell: the target derives from the slug alone, so there is
  // nothing worth prerendering per effect. A hit renders on demand and stays
  // in the static cache.
  return [];
}

type LegacyEffectRedirectProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export default async function LegacyEffectRedirectPage({ params }: LegacyEffectRedirectProps) {
  const { effectSlug } = await params;
  redirect(getLegacyRedirectTarget("legacy-effect", { effectSlug }));
}
