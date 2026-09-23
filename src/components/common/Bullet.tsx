import { cn } from "@/lib/utils";

type BulletColor =
  | "accent"
  | "danger"
  /** @deprecated Use accent. */
  | "fuchsia"
  /** @deprecated Use danger. */
  | "rose";

interface BulletProps {
  color?: BulletColor;
  className?: string;
}

const colorClasses = {
  accent: "bg-dose-accent",
  danger: "bg-dose-danger",
  fuchsia: "bg-dose-accent",
  rose: "bg-dose-danger",
} satisfies Record<BulletColor, string>;

export function Bullet({ color = "accent", className }: BulletProps) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full flex-shrink-0",
        colorClasses[color],
        className
      )}
      aria-hidden="true"
    />
  );
}
