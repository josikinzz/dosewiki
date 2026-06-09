import type { Metadata } from "next";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { HomeExperience } from "./_components/HomeExperience";

export const metadata: Metadata = {
  title: "dose.wiki",
  description:
    "A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.",
};

const homeRouteChrome = getRouteChromeModel("/");

const quickLinks = [...homeRouteChrome.primaryNavItems, ...homeRouteChrome.secondaryNavItems].map((item) => ({
  href: item.href,
  label: item.label,
  icon: resolveRouteChromeIcon(item.icon),
}));

export default function HomePage() {
  return <HomeExperience quickLinks={quickLinks} />;
}
