import type { Metadata } from "next";
import { env } from "node:process";
import { HomeExperience } from "./_components/HomeExperience";

export const metadata: Metadata = {
  title: "dose.wiki",
  description:
    "A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.",
};

const quickLinks = [
  {
    href: "/substances",
    label: "Substances",
    icon: "streamline-ultimate:science-molecule-strucutre-bold",
  },
  {
    href: "/effects",
    label: "Effects",
    icon: "tabler:spiral",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "hugeicons:content-writing",
  },
  {
    href: "/about",
    label: "About",
    icon: "lucide:info",
  },
] as const;

export default function HomePage() {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  return <HomeExperience quickLinks={quickLinks} isConstructionMode={isConstructionMode} />;
}
