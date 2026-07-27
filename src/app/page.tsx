import type { Metadata } from "next";
import { env } from "node:process";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { HomeExperience } from "./_components/HomeExperience";

export function generateMetadata(): Metadata {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  return {
    title: "dose.wiki",
    description:
      "An open encyclopedic database for the study of psychopharmacology",
    robots: isConstructionMode
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}

// Icons resolve through the shared route-chrome map so the homepage nav stays in
// sync with the header/footer chrome and section pages — single source of truth.
const quickLinks = [
  {
    href: "/substances",
    label: "Substances",
    icon: resolveRouteChromeIcon("substances"),
  },
  {
    href: "/effects",
    label: "Effects",
    icon: resolveRouteChromeIcon("effects"),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: resolveRouteChromeIcon("reports"),
  },
  {
    href: "/about",
    label: "About",
    icon: resolveRouteChromeIcon("about"),
  },
] as const;

export default function HomePage() {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  return <HomeExperience quickLinks={quickLinks} isConstructionMode={isConstructionMode} />;
}
