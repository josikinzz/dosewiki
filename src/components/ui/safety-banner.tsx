import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Icon, type IconName } from "@/components/common/Icon";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  toWarningBannerBlocks,
} from "@/data/substanceWarningBanners";
import { cn } from "@/lib/utils";

const safetyBannerVariants = cva(
  "grid w-full gap-x-4 gap-y-3 overflow-hidden rounded-card p-4 max-[560px]:block",
  {
    variants: {
      variant: {
        danger: "theme-interaction-danger text-dose-danger-badge",
        unsafe: "theme-interaction-unsafe text-dose-unsafe-badge",
        caution: "theme-interaction-caution text-dose-caution-badge",
      },
    },
    defaultVariants: {
      variant: "danger",
    },
  },
);

type SafetyBannerTone = NonNullable<VariantProps<typeof safetyBannerVariants>["variant"]>;

const TONE_CHIP_CLASS: Record<SafetyBannerTone, string> = {
  danger: "theme-interaction-severity-badge-danger",
  unsafe: "theme-interaction-severity-badge-unsafe",
  caution: "theme-interaction-severity-badge-caution",
};

export type SafetyBannerProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof safetyBannerVariants> & {
    icon?: IconName;
    iconSize?: number;
  };

const SafetyBanner = React.forwardRef<HTMLDivElement, SafetyBannerProps>(
  ({ className, variant, role, icon, iconSize, children, ...props }, ref) => {
    const tone: SafetyBannerTone = variant ?? "danger";

    const resolvedRole = role ?? (variant === "danger" ? "alert" : "status");

    return (
      <div
        ref={ref}
        role={resolvedRole}
        data-safety-banner={tone}
        className={cn(
          safetyBannerVariants({ variant }),
          icon ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
          className,
        )}
        {...props}
      >
        {icon ? (
          <Icon
            icon={icon}
            className="shrink-0 self-center max-[560px]:float-left max-[560px]:mb-1 max-[560px]:mr-3"
            size={iconSize ?? SAFETY_BANNER_ICON_SIZE_DEFAULT}
          />
        ) : null}
        <div className="flex min-w-0 flex-col items-start gap-2 [overflow-wrap:anywhere] max-[560px]:block max-[560px]:space-y-2">{children}</div>
      </div>
    );
  },
);
SafetyBanner.displayName = "SafetyBanner";

export type SafetyBannerTitleProps = React.HTMLAttributes<HTMLParagraphElement> & {
  severityLabel?: string;
  tone?: SafetyBannerTone;
};

const SafetyBannerTitle = React.forwardRef<HTMLParagraphElement, SafetyBannerTitleProps>(
  ({ className, severityLabel, tone = "danger", children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 font-display text-base font-semibold leading-snug text-dose-text",
        className,
      )}
      {...props}
    >
      {severityLabel ? (
        <span
          className={cn(
            "type-chip-label inline-flex h-5 items-center rounded-full px-2 leading-none",
            TONE_CHIP_CLASS[tone],
          )}
        >
          {severityLabel}
        </span>
      ) : null}
      {children}
    </p>
  ),
);
SafetyBannerTitle.displayName = "SafetyBannerTitle";

export type SafetyBannerPointsProps = {
  points: string[];
  className?: string;
};

const POINT_TEXT_CLASS = "text-sm leading-relaxed text-dose-text-secondary";

function SafetyBannerPoints({ points, className }: SafetyBannerPointsProps) {
  const blocks = toWarningBannerBlocks(points);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex w-full flex-col gap-2 max-[560px]:block max-[560px]:space-y-2", className)}>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={`p-${index}`} className={POINT_TEXT_CLASS}>
            {block.text}
          </p>
        ) : (
          <ul key={`l-${index}`} className="flex list-none flex-col gap-1.5">
            {block.items.map((item) => (
              <li key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[0.45rem] h-1.5 w-1.5 rounded-full bg-current"
                />
                <span className={POINT_TEXT_CLASS}>{item}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export { SafetyBanner, SafetyBannerTitle, SafetyBannerPoints, safetyBannerVariants };
