import { Icon as IconifyIcon } from "@iconify/react";

export type IconName = string; // e.g., "lucide:search", "mdi:home"

interface IconProps {
  icon: IconName;
  className?: string;
  size?: number | string;
}

export function Icon({ icon, className, size = 24 }: IconProps) {
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
