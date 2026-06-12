import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]";

const surfaceVariants = cva("relative border", {
  variants: {
    variant: {
      card:
        "theme-card-surface border-[color:var(--theme-card-border)] shadow-[0_10px_30px_-12px_var(--theme-shadow-soft)] backdrop-blur backdrop-safe",
      public: "theme-public-card backdrop-blur-sm backdrop-safe",
      subtle: "theme-public-card-subtle",
      index:
        "theme-public-card-subtle shadow-[0_16px_34px_-22px_var(--theme-shadow-soft)] backdrop-blur-md backdrop-safe",
      indexDim:
        "theme-index-card-dim shadow-[0_16px_34px_-22px_var(--theme-shadow-soft)] backdrop-blur-md backdrop-safe",
      state: "theme-state-card theme-card-surface overflow-hidden",
      muted:
        "theme-public-card-subtle",
      danger:
        "border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)] shadow-[0_14px_36px_-22px_var(--theme-danger-ring)]",
      articleHero:
        "theme-article-hero overflow-hidden shadow-2xl ring-1 ring-[var(--theme-frosted-panel-border)]",
      moleculePanel:
        "theme-molecule-panel overflow-hidden shadow-[0_18px_40px_-24px_var(--theme-shadow-strong)]",
      none: "border-transparent",
    },
    padding: {
      none: "p-0",
      xs: "p-3",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
      xl: "p-6 sm:p-8",
    },
    radius: {
      none: "rounded-none",
      md: "rounded-lg",
      lg: "rounded-xl",
      xl: "rounded-2xl",
      index: "rounded-2xl",
      state: "rounded-[2rem]",
      compactState: "rounded-[1.75rem]",
    },
  },
  defaultVariants: {
    variant: "card",
    padding: "lg",
    radius: "xl",
  },
});

const interactiveSurfaceVariants = cva(
  cn(
    "transition-[transform,border-color,background-color,box-shadow,color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    focusRing,
  ),
  {
    variants: {
      variant: {
        card:
          "hover:border-[color:var(--theme-card-border-strong)] hover:shadow-[0_18px_50px_-12px_var(--theme-shadow-strong)]",
        public: "theme-public-card-interactive",
        index:
          "theme-public-card-hover-quiet hover:-translate-y-px hover:shadow-xl hover:shadow-[color:color-mix(in_srgb,var(--theme-accent)_18%,transparent)]",
        result:
          "theme-public-card-hover-quiet group overflow-hidden hover:-translate-y-px hover:shadow-[0_22px_45px_-28px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]",
        danger:
          "hover:border-[color:var(--theme-danger-border-strong)] hover:bg-[color:var(--theme-danger-bg-strong)] hover:shadow-[0_18px_46px_-25px_var(--theme-danger-ring)]",
        quiet:
          "hover:border-[color:var(--theme-card-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_76%,transparent)]",
      },
      selected: {
        true: "border-[color:var(--theme-card-border-strong)] bg-[color:color-mix(in_srgb,var(--theme-accent)_14%,var(--theme-surface-muted))] shadow-inner shadow-[color:color-mix(in_srgb,var(--theme-accent)_22%,transparent)]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "card",
      selected: false,
    },
  },
);

type SurfaceVariantProps = VariantProps<typeof surfaceVariants>;
type InteractiveSurfaceVariantProps = VariantProps<typeof interactiveSurfaceVariants>;

export type SurfaceProps = React.HTMLAttributes<HTMLDivElement> &
  SurfaceVariantProps & {
    asChild?: boolean;
  };

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ asChild = false, className, variant, padding, radius, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        className={cn(surfaceVariants({ variant, padding, radius }), className)}
        {...props}
      />
    );
  },
);
Surface.displayName = "Surface";

export type InteractiveSurfaceProps = Omit<SurfaceProps, "variant"> &
  InteractiveSurfaceVariantProps & {
    surfaceVariant?: SurfaceVariantProps["variant"];
  };

export const InteractiveSurface = React.forwardRef<HTMLDivElement, InteractiveSurfaceProps>(
  (
    {
      className,
      variant = "card",
      surfaceVariant,
      padding,
      radius,
      selected,
      ...props
    },
    ref,
  ) => (
    <Surface
      ref={ref}
      variant={surfaceVariant ?? (variant === "result" ? "card" : variant === "quiet" ? "subtle" : variant)}
      padding={padding}
      radius={radius}
      className={cn(interactiveSurfaceVariants({ variant, selected }), className)}
      {...props}
    />
  ),
);
InteractiveSurface.displayName = "InteractiveSurface";

export type EmptyStateSurfaceProps = SurfaceProps & {
  tone?: "neutral" | "danger";
};

export const EmptyStateSurface = React.forwardRef<HTMLDivElement, EmptyStateSurfaceProps>(
  ({ className, tone = "neutral", variant, ...props }, ref) => (
    <Surface
      ref={ref}
      variant={variant ?? (tone === "danger" ? "danger" : "state")}
      className={cn("text-center", className)}
      {...props}
    />
  ),
);
EmptyStateSurface.displayName = "EmptyStateSurface";

export type ContentCardProps = SurfaceProps;

export const ContentCard = React.forwardRef<HTMLDivElement, ContentCardProps>(
  ({ variant = "public", padding = "lg", radius = "xl", ...props }, ref) => (
    <Surface ref={ref} variant={variant} padding={padding} radius={radius} {...props} />
  ),
);
ContentCard.displayName = "ContentCard";

export type InteractiveContentCardProps = InteractiveSurfaceProps;

export const InteractiveContentCard = React.forwardRef<HTMLDivElement, InteractiveContentCardProps>(
  ({ variant = "public", padding = "lg", radius = "xl", ...props }, ref) => (
    <InteractiveSurface ref={ref} variant={variant} padding={padding} radius={radius} {...props} />
  ),
);
InteractiveContentCard.displayName = "InteractiveContentCard";

export type NestedContentCardProps = SurfaceProps;

export const NestedContentCard = React.forwardRef<HTMLDivElement, NestedContentCardProps>(
  ({ variant = "subtle", padding = "md", radius = "lg", ...props }, ref) => (
    <Surface ref={ref} variant={variant} padding={padding} radius={radius} {...props} />
  ),
);
NestedContentCard.displayName = "NestedContentCard";

export type StatusStateProps = EmptyStateSurfaceProps;

export const StatusState = React.forwardRef<HTMLDivElement, StatusStateProps>(
  ({ padding = "none", radius = "state", ...props }, ref) => (
    <EmptyStateSurface ref={ref} padding={padding} radius={radius} {...props} />
  ),
);
StatusState.displayName = "StatusState";

export type DangerCalloutProps = SurfaceProps;

export const DangerCallout = React.forwardRef<HTMLDivElement, DangerCalloutProps>(
  ({ variant = "danger", padding = "lg", radius = "xl", ...props }, ref) => (
    <Surface ref={ref} variant={variant} padding={padding} radius={radius} {...props} />
  ),
);
DangerCallout.displayName = "DangerCallout";

export { surfaceVariants, interactiveSurfaceVariants };
