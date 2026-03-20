import { redirect } from "next/navigation";

type LegacyEffectRedirectProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export default async function LegacyEffectRedirectPage({ params }: LegacyEffectRedirectProps) {
  const { effectSlug } = await params;
  redirect(`/effects/${effectSlug}`);
}
