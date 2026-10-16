"use client";

import {
  SafetyBanner,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import { cn } from "@/lib/utils";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import { useT } from "@/i18n/client";

export interface SubstanceWarningBannersProps {
  banners: WarningBannerPreset[];
  iconSize?: number;
  className?: string;
}

export function SubstanceWarningBanners({
  banners,
  iconSize,
  className,
}: SubstanceWarningBannersProps) {
  const t = useT();
  if (banners.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {banners.map((preset) => (
        <SafetyBanner
          key={preset.key}
          variant={preset.tone}
          icon={preset.icon}
          iconSize={iconSize}
        >
          <SafetyBannerTitle severityLabel={t(preset.severityLabel)} tone={preset.tone}>
            {t(preset.headline)}
          </SafetyBannerTitle>
          <SafetyBannerPoints points={preset.points.map((point) => t(point))} />
        </SafetyBanner>
      ))}
    </div>
  );
}
