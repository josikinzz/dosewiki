"use client";

import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/react";
import { customIcons } from "./customIcons";
import iconData from "./iconData.generated.json";

// Every icon name that appears as a literal in the repo is bundled offline in
// `iconData.generated.json` (built by `npm run generate:icon-data`, which
// extracts exactly the used names from the `@iconify-json/*` devDependencies —
// ~150KB raw / ~41KB gzip for the whole site, versus the ~568KB that bundling
// the full lucide collection alone used to cost). Registering the data at
// module scope means `getIconData` resolves synchronously on both server and
// client, so with the `ssr` prop below every bundled glyph is in the
// server-rendered HTML and never waits on a network request.
//
// Names outside the bundle — editor-authored strings stored in Convex (warning
// banner presets, index-layout `iconKey`s) and /dev picker experiments — keep
// the old behaviour: `@iconify/react` fetches them from the Iconify API at
// runtime, rotating in its two backup hosts after 750ms of silence.
for (const collection of iconData.collections as unknown as IconifyJSON[]) {
  addCollection(collection);
}

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

  // `ssr` makes the initial render resolve icon data synchronously instead of
  // waiting for an effect. Bundled icons therefore paint immediately (and
  // identically) on server and client; unbundled ones render the same empty
  // placeholder on both, then load over the network after hydration.
  return (
    <IconifyIcon
      ssr
      icon={icon}
      className={className}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
