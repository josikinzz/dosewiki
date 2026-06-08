import type { Metadata } from "next";
import type { IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import { HomeExperience } from "./_components/HomeExperience";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

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
    icon: icons.subjectiveEffectIndex,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: icons.fileSignature,
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
