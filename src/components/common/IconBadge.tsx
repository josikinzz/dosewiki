import type { LucideIcon } from "lucide-react";

interface IconBadgeProps {
  icon: LucideIcon;
  label?: string;
  size?: number;
  className?: string;
}

export function IconBadge({ icon: Icon, label, size = 18, className }: IconBadgeProps) {
  const classes = [
    "inline-grid h-8 w-8 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15",
  ];

  if (className) {
    classes.push(className);
  }

  return (
    <span className={classes.join(" ")}>
      <Icon className="text-white" size={size} aria-hidden="true" focusable="false" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
