import { cn } from "@/lib/utils";

interface BulletProps {
  color?: "fuchsia" | "rose";
  className?: string;
}

export function Bullet({ color = "fuchsia", className }: BulletProps) {
  const colorClass = color === "rose" ? "bg-rose-400" : "bg-dose-accent";

  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full flex-shrink-0",
        colorClass,
        className
      )}
      aria-hidden="true"
    />
  );
}
