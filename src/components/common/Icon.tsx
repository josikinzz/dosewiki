"use client";

import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/react";
import { customIcons } from "./customIcons";
import iconData from "./iconData.generated.json";
import { getSpriteReference, useIconSpriteAvailable } from "./IconSprite";
import registerEditorIcons from "./iconData.editor";

for (const collection of iconData.collections as unknown as IconifyJSON[]) {
  addCollection(collection);
}
registerEditorIcons();

export type IconName = string;

interface IconProps {
  icon: IconName;
  className?: string;
  size?: number | string;
}

export function Icon({ icon, className, size = 24 }: IconProps) {
  const spriteAvailable = useIconSpriteAvailable();

  if (icon.startsWith("custom:")) {
    const customKey = icon.slice(7);
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
