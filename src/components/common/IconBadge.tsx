import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type IconBadgeTone = "accent" | "neutral" | "success" | "warning" | "danger";
type IconBadgeSize = "sm" | "md";

interface IconBadgeProps {
  icon: IconName;
  label?: string;
  tone?: IconBadgeTone;
  size?: IconBadgeSize | number;
  className?: string;
}

const badgeSizeClasses: Record<IconBadgeSize, string> = {
  sm: "h-7 w-7 rounded-lg",
  md: "h-8 w-8 rounded-xl",
};

const iconSizes: Record<IconBadgeSize, number> = {
  sm: 16,
  md: 20,
};

const toneClasses: Record<IconBadgeTone, string> = {
  accent: "theme-icon-badge",
  neutral: "theme-icon-muted",
  success: "",
  warning: "",
  danger: "",
};

export function IconBadge({ icon, label, tone = "accent", size = "md", className }: IconBadgeProps) {
  const normalizedSize = typeof size === "number" ? "md" : size;
  const iconSize = typeof size === "number" ? size : iconSizes[size];

  return (
    <span
      className={cn(
        "theme-status-orb",
        badgeSizeClasses[normalizedSize],
        toneClasses[tone],
        className,
      )}
      data-tone={tone}
      data-size={normalizedSize}
    >
      <span className="theme-status-orb-core">
        <Icon icon={icon} size={iconSize} className="theme-status-orb-icon" />
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
