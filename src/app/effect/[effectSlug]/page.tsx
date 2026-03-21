import { redirect } from "next/navigation";
import { getStaticEffectParams } from "@server/next/staticParams";

export async function generateStaticParams() {
  return await getStaticEffectParams();
}

type LegacyEffectRedirectProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export default async function LegacyEffectRedirectPage({ params }: LegacyEffectRedirectProps) {
  const { effectSlug } = await params;
  redirect(`/effects/${effectSlug}`);
}
