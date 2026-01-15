import { Icon, type IconName } from "./Icon";

interface IconBadgeProps {
  icon: IconName;
  label?: string;
  size?: number;
  className?: string;
}

export function IconBadge({ icon, label, size = 20, className }: IconBadgeProps) {
  const classes = [
    "inline-grid h-8 w-8 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15",
  ];

  if (className) {
    classes.push(className);
  }

  return (
    <span className={classes.join(" ")}>
      <Icon icon={icon} size={size} className="text-white" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
