import type { Metadata } from "next";
import type { IconName } from "@/components/common/Icon";
import { HomeExperience } from "./_components/HomeExperience";

const SUBSTANCE_INDEX_ICON = "lucide:atom" satisfies IconName;

export const metadata: Metadata = {
  title: "dose.wiki",
  description:
    "A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.",
};

const quickLinks: Array<{
  href: string;
  label: string;
  icon: IconName;
}> = [
  {
    href: "/substances",
    label: "Substances",
    icon: SUBSTANCE_INDEX_ICON,
  },
  {
    href: "/effects",
    label: "Effects",
    icon: "lucide:sparkles",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "lucide:file-signature",
  },
  {
    href: "/about",
    label: "About",
    icon: "lucide:info",
  },
];

export default function HomePage() {
  return <HomeExperience quickLinks={quickLinks} />;
}
