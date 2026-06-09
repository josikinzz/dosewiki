"use client";

import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import { icons as lucideIcons } from "@iconify-json/lucide";
import { customIcons } from "./customIcons";

addCollection(lucideIcons);

export type IconName = string; // e.g., "lucide:search", "mdi:home", "custom:benzene"

interface IconProps {
  icon: IconName;
  className?: string;
  size?: number | string;
}

export function Icon({ icon, className, size = 24 }: IconProps) {
  // Handle custom icons with "custom:" prefix
  if (icon.startsWith("custom:")) {
    const customKey = icon.slice(7); // Remove "custom:" prefix
    const CustomIcon = customIcons[customKey];
    if (CustomIcon) {
      return (
        <CustomIcon
          className={className}
          width={size}
          height={size}
          aria-hidden="true"
        />
      );
    }
  }

  return (
    <IconifyIcon
      icon={icon}
      className={className}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
