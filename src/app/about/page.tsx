import { getPublicAboutData, getPublicDataOverview } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { LegacyPublicRouteClient } from "../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

export async function generateMetadata() {
  const about = await getPublicAboutData();

  return buildPageMetadata({
    title: "About dose.wiki",
    description:
      about.subtitle ||
      "Learn about the dose.wiki project.",
    pathname: "/about",
  });
}

export default async function AboutPage() {
  await Promise.all([getPublicAboutData(), getPublicDataOverview()]);
  return <LegacyPublicRouteClient view={{ type: "about" }} />;
}
