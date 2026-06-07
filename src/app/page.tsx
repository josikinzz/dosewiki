import type { Metadata } from "next";
import logoAssetImport from "../assets/dosewiki-logo.svg?inline";
import type { IconName } from "@/components/common/Icon";
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

const logoAsset = logoAssetImport as string | { src: string };
const logoSource =
  typeof logoAsset === "string"
    ? logoAsset.trim().startsWith("<svg")
      ? `data:image/svg+xml;utf8,${encodeURIComponent(logoAsset)}`
      : logoAsset
    : logoAsset.src;

export default function HomePage() {
  return <HomeExperience logoSource={logoSource} quickLinks={quickLinks} />;
}
