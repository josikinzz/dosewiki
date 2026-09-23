import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type PublicTone = "accent" | "neutral" | "success" | "warning" | "danger";
type PublicSize = "sm" | "md";

type PolymorphicProps<TElement extends ElementType> = {
  as?: TElement;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "className" | "children">;

// Accent is drawn with plain accent aliases rather than `theme-badge-surface`:
// the frosted appearance rule repaints that class in body text on every
// scheme, which left an accent pill indistinguishable from a neutral one.
const toneClasses: Record<PublicTone, string> = {
  accent: "border-dose-accent/35 bg-dose-accent/10 text-dose-accent-strong",
  neutral: "theme-badge-surface",
  success: "theme-badge-surface theme-status-badge",
  warning: "theme-badge-surface theme-status-badge",
  danger: "theme-badge-surface theme-status-badge",
};

const badgeToneAttrs: Record<PublicTone, string | undefined> = {
  accent: undefined,
  neutral: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
};

const sizeClasses: Record<PublicSize, string> = {
  sm: "h-5 gap-1 px-2",
  md: "h-6 gap-1.5 px-2.5",
};

export type PublicOverlineProps<TElement extends ElementType = "span"> =
  PolymorphicProps<TElement>;

export function PublicOverline<TElement extends ElementType = "span">({
  as,
  className,
  children,
  ...props
}: PublicOverlineProps<TElement>) {
  const Component = as ?? "span";

  return (
    <Component className={cn("theme-public-overline", className)} {...props}>
      {children}
    </Component>
  );
}

export type PublicPillProps<TElement extends ElementType = "span"> =
  PolymorphicProps<TElement> & {
    icon?: IconName;
    tone?: PublicTone;
    size?: PublicSize;
  };

export function PublicPill<TElement extends ElementType = "span">({
  as,
  className,
  children,
  icon,
  tone = "neutral",
  size = "md",
  ...props
}: PublicPillProps<TElement>) {
  const Component = as ?? "span";

  return (
    <Component
      className={cn(
        "type-chip-label inline-flex items-center rounded-full border transition-colors",
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
      data-tone={tone}
      data-badge-tone={badgeToneAttrs[tone]}
      data-size={size}
      {...props}
    >
      {icon ? <Icon icon={icon} size={size === "sm" ? 12 : 14} className="shrink-0 text-current" /> : null}
      {children}
    </Component>
  );
}

export type PublicNameChipProps<TElement extends ElementType = "span"> =
  PolymorphicProps<TElement> & {
    icon?: IconName;
    interactive?: boolean;
  };

export function PublicNameChip<TElement extends ElementType = "span">({
  as,
  className,
  children,
  icon,
  interactive,
  ...props
}: PublicNameChipProps<TElement>) {
  const Component = as ?? "span";
  const hasElementHitTarget = interactive && Component !== "span";

  return (
    <Component
      className={cn(
        "theme-name-chip inline-flex min-h-7 items-center gap-1.5 rounded-chip px-3.5 py-1 text-xs font-medium ring-1 ring-transparent transition",
        "theme-focus-ring",
        hasElementHitTarget ? TOUCH_HALO : undefined,
        interactive ? "theme-name-chip-interactive" : undefined,
        className,
      )}
      data-token="public-name-chip"
      {...props}
    >
      {icon ? <Icon icon={icon} size={14} className="shrink-0 text-current" /> : null}
      {children}
    </Component>
  );
}

export type PublicChipNavItem = {
  id: string;
  label: ReactNode;
  active?: boolean;
  count?: number;
  href?: string;
  icon?: IconName;
  tone?: PublicTone;
};

export interface PublicChipNavProps {
  items: PublicChipNavItem[];
  ariaLabel?: string;
  className?: string;
  onSelect?: (item: PublicChipNavItem) => void;
}

export function PublicChipNav({
  items,
  ariaLabel = "Filters",
  className,
  onSelect,
}: PublicChipNavProps) {
  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const tone = item.active ? (item.tone ?? "accent") : (item.tone ?? "neutral");
        // The accent tone alone reads as a tint in the light schemes, so the
        // active chip also takes a full-strength accent stroke.
        const chipClassName = cn(
          "theme-focus-ring",
          item.active && "border-dose-accent-strong",
          item.href || onSelect ? cn(TOUCH_HALO, "cursor-pointer hover:opacity-90") : undefined,
        );

        return item.href ? (
          <PublicPill
            key={item.id}
            as="a"
            href={item.href}
            icon={item.icon}
            tone={tone}
            aria-current={item.active && item.href ? "page" : undefined}
            className={chipClassName}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? <span className="theme-text-faint">{item.count}</span> : null}
          </PublicPill>
        ) : (
          <PublicPill
            key={item.id}
            as="button"
            type="button"
            icon={item.icon}
            tone={tone}
            aria-pressed={item.active}
            onClick={onSelect ? () => onSelect(item) : undefined}
            className={chipClassName}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? <span className="theme-text-faint">{item.count}</span> : null}
          </PublicPill>
        );
      })}
    </nav>
  );
}
