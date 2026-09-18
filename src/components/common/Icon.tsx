"use client";

import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/react";
import { customIcons } from "./customIcons";
import iconData from "./iconData.generated.json";
import { getSpriteReference, useIconSpriteAvailable } from "./IconSprite";
import registerEditorIcons from "./iconData.editor";

// The producer keeps the public catalog separate from editor-only literals.
// Both catalogs register synchronously, but the public artifact replaces the
// editor bridge before compilation and cannot aggregate its private glyphs.
// Authored names outside these catalogs retain Iconify's existing fallback.
//
// Names outside the bundle — editor-authored strings stored in Postgres (warning
// banner presets, index-layout `iconKey`s) and /dev picker experiments — keep
// the old behaviour: `@iconify/react` fetches them from the Iconify API at
// runtime, rotating in its two backup hosts after 750ms of silence.
for (const collection of iconData.collections as unknown as IconifyJSON[]) {
  addCollection(collection);
}
registerEditorIcons();

export type IconName = string; // e.g., "lucide:search", "mdi:home", "custom:benzene"

interface IconProps {
  icon: IconName;
  className?: string;
  size?: number | string;
}

export function Icon({ icon, className, size = 24 }: IconProps) {
  const spriteAvailable = useIconSpriteAvailable();

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

  // Inside an `IconSpriteScope` the handful of glyphs a page repeats dozens
  // of times reference one shared `<symbol>` instead of inlining their paths
  // on every occurrence. The element keeps the same tag, classes, sizing and
  // accessibility attributes Iconify emits, so styling and tests see no
  // difference; only the markup inside the `<svg>` shrinks to one `<use>`.
  const sprite = spriteAvailable ? getSpriteReference(icon) : null;
  if (sprite) {
    const prefix = icon.slice(0, icon.indexOf(":"));
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        aria-hidden="true"
        role="img"
        className={className ? `iconify iconify--${prefix} ${className}` : `iconify iconify--${prefix}`}
        width={size}
        height={size}
        viewBox={sprite.viewBox}
      >
        <use href={`#${sprite.id}`} />
      </svg>
    );
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
