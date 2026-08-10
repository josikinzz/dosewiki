import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

type LegacyChemicalClassPageProps = {
  params: Promise<{ classKey: string }>;
};

export default async function LegacyChemicalClassPage({ params }: LegacyChemicalClassPageProps) {
  const { classKey } = await params;
  redirect(getLegacyRedirectTarget("legacy-chemical", { classKey }));
}
