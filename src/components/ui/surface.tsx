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
        "border-white/10 bg-white/[0.02] shadow-lg shadow-black/20 backdrop-blur-md backdrop-safe",
      state: "theme-state-card overflow-hidden border-white/10 bg-white/[0.045]",
      muted:
        "border-white/10 bg-white/5 text-white/70",
      danger:
        "border-red-400/30 bg-red-500/10 shadow-[0_14px_36px_-22px_rgba(239,68,68,0.55)]",
      articleHero:
        "theme-article-hero overflow-hidden shadow-2xl ring-1 ring-white/5",
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
      index: "rounded-[20px]",
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
    "transition-[transform,border-color,background-color,box-shadow,color] duration-200",
    focusRing,
  ),
  {
    variants: {
      variant: {
        card:
          "hover:border-[color:var(--theme-card-border-strong)] hover:shadow-[0_18px_50px_-12px_var(--theme-shadow-strong)]",
        public: "theme-public-card-interactive",
        index:
          "hover:-translate-y-0.5 hover:border-fuchsia-500/20 hover:bg-white/[0.04] hover:shadow-xl hover:shadow-fuchsia-500/5",
        result:
          "group overflow-hidden border-white/10 bg-white/[0.045] hover:-translate-y-0.5 hover:shadow-[0_22px_45px_-28px_rgba(217,70,239,0.6)]",
        danger:
          "hover:border-red-300/50 hover:bg-red-500/15 hover:shadow-[0_18px_46px_-25px_rgba(239,68,68,0.65)]",
        quiet:
          "hover:border-[color:var(--theme-card-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_76%,transparent)]",
      },
      selected: {
        true: "border-fuchsia-400/50 bg-fuchsia-500/15 shadow-inner shadow-fuchsia-500/20",
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

export { surfaceVariants, interactiveSurfaceVariants };
