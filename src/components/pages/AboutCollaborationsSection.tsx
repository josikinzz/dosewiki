import type { ReactNode } from "react";

import { AppImage } from "../common/AppImage";
import { ExpandIndicator } from "../common/ExpandButton";
import { Icon } from "../common/Icon";
import { Button } from "@/components/ui/button";
import type { CommunityLogo } from "@/data/content/aboutCommunity";
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import { LogoTile } from "./AboutCommunitySection";
import { CollaborationDetails } from "./CollaborationDetails.client";

type CollaborationLink = { icon: string; label: string; href: string };

type Collaboration = {
  key: "tripsit" | "protestkit" | "piru";
  name: string;
  logo: CommunityLogo;
  links: readonly CollaborationLink[];
};

export const ABOUT_COLLABORATIONS: readonly Collaboration[] = [
  {
    key: "piru",
    name: "Piru",
    logo: { src: "/about/piru/icon.avif", fit: "cover" },
    links: [
      { icon: "lucide:globe", label: "kagerou.glass/piru", href: "https://kagerou.glass/piru/" },
      { icon: "lucide:download", label: msg("Get Piru for iOS & Android"), href: "https://kagerou.glass/get/piru?from=dosewiki" },
    ],
  },
  {
    key: "tripsit",
    name: "TripSit",
    logo: { src: "/about/community/tripsit.webp", fit: "wide" },
    links: [{ icon: "lucide:globe", label: "tripsit.me", href: "https://tripsit.me" }],
  },
  {
    key: "protestkit",
    name: "PRO Test Kit",
    logo: { src: "/about/community/protestkit.webp" },
    links: [{ icon: "lucide:globe", label: "protestkit.eu", href: "https://protestkit.eu" }],
  },
];

const PIRU_SCREENSHOTS = [
  { src: "/about/piru/journal-timeline.avif", alt: msg("Piru's journal timeline with LSD and MDMA effect curves") },
  { src: "/about/piru/session-notes.avif", alt: msg("A Piru session with its summary and timestamped trip notes") },
  { src: "/about/piru/substance-mdma.avif", alt: msg("A Piru substance page crediting dose.wiki for dose and duration") },
] as const;

function PiruScreenshots() {
  return (
    <ul className="grid max-w-sm grid-cols-3 gap-3">
      {PIRU_SCREENSHOTS.map((shot) => (
        <li key={shot.src}>
          <AppImage
            src={shot.src}
            alt={t(shot.alt)}
            width={720}
            height={1564}
            unoptimized
            className="h-auto w-full rounded-[1rem] border border-dose-border"
          />
        </li>
      ))}
    </ul>
  );
}

export function AboutCollaborationsSection({
  summaries,
  bodies,
}: {
  summaries: readonly string[];
  bodies: Partial<Record<Collaboration["key"], ReactNode>>;
}) {
  return (
    <ul className="flex flex-col">
      {ABOUT_COLLABORATIONS.map((partner, index) => (
        <li key={partner.key}>
          {index > 0 ? <div role="presentation" className="theme-horizontal-divider h-px" /> : null}
          <CollaborationDetails id={`collaboration-${partner.key}`} className="group/collab">
            <summary className="theme-focus-ring flex cursor-pointer list-none items-center gap-4 rounded-card py-3 [&::-webkit-details-marker]:hidden [&::marker]:content-['']">
              <LogoTile logo={partner.logo} size="lg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="theme-text-primary font-semibold transition-colors group-hover/collab:text-dose-accent">
                  {partner.name}
                </span>
                {summaries[index] ? (
                  <span className="theme-text-faint text-sm">{t(summaries[index])}</span>
                ) : null}
              </span>
              <ExpandIndicator
                isExpanded={false}
                variant="card"
                className="theme-text-muted shrink-0 group-open/collab:[&>svg:last-child]:rotate-180"
              />
            </summary>
            <div className="flex flex-col gap-4 pb-5 pt-1 sm:pl-[3.75rem]">
              <div className="max-w-[65ch] [&_p]:text-[0.95rem] [&_p]:leading-7">{bodies[partner.key]}</div>
              {partner.key === "piru" ? <PiruScreenshots /> : null}
              <div className="flex flex-wrap gap-2">
                {partner.links.map((link) => (
                  <Button key={link.href} asChild variant="glass" size="pill">
                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                      <Icon icon={link.icon} size={16} />
                      {t(link.label)}
                      <Icon icon="lucide:arrow-up-right" size={14} className="theme-text-faint" />
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </CollaborationDetails>
        </li>
      ))}
    </ul>
  );
}
