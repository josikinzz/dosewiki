import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

export const dynamicParams = true;

export async function generateStaticParams() {
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
