import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type StatusOrbTone = "accent" | "success" | "warning" | "danger" | "neutral";
type StatusOrbSize = "sm" | "md" | "lg";

const sizeClasses: Record<StatusOrbSize, string> = {
  sm: "h-12 w-12 text-base",
  md: "h-16 w-16 text-lg",
  lg: "h-20 w-20 text-xl",
};

const iconSizes: Record<StatusOrbSize, number> = {
  sm: 18,
  md: 22,
  lg: 28,
};

export interface StatusOrbProps {
  icon?: IconName;
  tone?: StatusOrbTone;
  size?: StatusOrbSize;
  loading?: boolean;
  className?: string;
}

export function StatusOrb({
  icon = "lucide:sparkles",
  tone = "accent",
  size = "md",
  loading = false,
  className,
}: StatusOrbProps) {
  return (
    <div
      className={cn("theme-status-orb", sizeClasses[size], className)}
      data-tone={tone}
      data-loading={loading ? "true" : undefined}
      aria-hidden="true"
    >
      <span className="theme-status-orb-ring theme-status-orb-ring--outer" />
      <span className="theme-status-orb-ring theme-status-orb-ring--inner" />
      <span className="theme-status-orb-core">
        <Icon icon={icon} size={iconSizes[size]} className="theme-status-orb-icon" />
      </span>
    </div>
  );
}
