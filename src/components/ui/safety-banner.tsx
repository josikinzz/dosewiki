import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Icon, type IconName } from "@/components/common/Icon";
import type { WarningBannerLink } from "@/data/substanceWarningBanners";
import { cn } from "@/lib/utils";

import { focusRingClassName } from "./surface";

/**
 * The drug-class safety banner that sits above a substance article's <h1>.
 *
 * Deliberately dumb: it renders the strings it is handed and decides nothing.
 * Whether a banner appears at all is an editorial act recorded in
 * `warningBannerPresets.enabledSlugs` and resolved by `resolveEnabledBanners`
 * in `src/data/substanceWarningBanners.ts`. There is no path from a substance's
 * classification to this component, by construction.
 *
 * Tone drives two things and no more: the card surface (the shared
 * `.theme-interaction-{danger,unsafe,caution}` classes in
 * `src/styles/utilities-theme.css`) and the root `color`, which is the tone's
 * badge ink. Everything tonal downstream — the gutter glyph, the severity
 * label, the bullet dots, the link chips — inherits that `currentColor`, which
 * is why `SafetyBannerPoints` and `SafetyBannerLinks` need no tone prop. Prose
 * opts back out explicitly (`text-dose-text`, `text-dose-text-secondary`).
 *
 * No "use client": `src/app/dev/kit/registry/render.test.tsx` pushes every kit
 * example through `renderToStaticMarkup`, and the article mount is a server
 * component.
 */
const safetyBannerVariants = cva(
  "grid w-full grid-cols-[78px_minmax(0,1fr)] overflow-hidden rounded-2xl max-[560px]:grid-cols-1",
  {
    variants: {
      // Tonal names only. Feature-named variants are blocked by
      // src/components/ui/ownership.test.ts, and a "banner" tone would be
      // meaningless to the next consumer anyway.
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

export type SafetyBannerProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof safetyBannerVariants> & {
    icon?: IconName;
    severityLabel?: string;
    /**
     * Studio-only. The Banner Studio previews presets that are enabled nowhere,
     * and a full-strength preview of a banner no reader can see is a lie about
     * the state of the site (brief §5). Dimming makes "what it would look like"
     * un-mistakable for "what readers see".
     */
    dimmed?: boolean;
  };

const SafetyBanner = React.forwardRef<HTMLDivElement, SafetyBannerProps>(
  ({ className, variant, role, icon, severityLabel, dimmed, children, ...props }, ref) => {
    // Same rule as `Alert`: explicit role wins, otherwise tone decides. `danger`
    // asserts via role="alert" (implies aria-live="assertive"); the softer tones
    // announce politely via role="status" (implies aria-live="polite"), so
    // neither needs an explicit aria-live.
    const resolvedRole = role ?? (variant === "danger" ? "alert" : "status");

    return (
      <div
        ref={ref}
        role={resolvedRole}
        // Reflected like `ArticleInfoCard`'s `data-tone` and `StatusBadge`'s
        // `data-badge-tone`: gives consumer CSS and smoke tests a stable hook
        // that does not depend on the utility classes.
        data-safety-banner={variant ?? "danger"}
        className={cn(
          safetyBannerVariants({ variant }),
          dimmed && "opacity-60 saturate-50",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col items-center justify-center gap-1.5 border-r border-dose-divider px-2 py-4 text-center max-[560px]:flex-row max-[560px]:justify-start max-[560px]:gap-2 max-[560px]:border-r-0 max-[560px]:border-b max-[560px]:px-4 max-[560px]:py-2.5 max-[560px]:text-left">
          {icon ? <Icon icon={icon} size={22} /> : null}
          {severityLabel ? (
            <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.16em]">
              {severityLabel}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2.5 px-4 py-4">{children}</div>
      </div>
    );
  },
);
SafetyBanner.displayName = "SafetyBanner";

export type SafetyBannerTitleProps = React.HTMLAttributes<HTMLParagraphElement>;

/**
 * A <p>, not a heading. The banner renders above the article's <h1>, so a
 * heading here would put a safety claim ahead of the substance name in the
 * document outline and in every screen-reader heading list.
 */
const SafetyBannerTitle = React.forwardRef<HTMLParagraphElement, SafetyBannerTitleProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "font-display text-[15px] font-semibold leading-snug text-dose-text",
        className,
      )}
      {...props}
    />
  ),
);
SafetyBannerTitle.displayName = "SafetyBannerTitle";

export type SafetyBannerPointsProps = {
  points: string[];
  className?: string;
};

/**
 * Mechanism bullets. `list-none` with a dot glyph rather than a `border-left`
 * accent stripe, which the brief bans outright (§9). The dot is `bg-current`,
 * so it picks up the root's tone ink while the sentence overrides to prose
 * colour; 76ch is the brief's measure for the only real prose in the banner.
 */
function SafetyBannerPoints({ points, className }: SafetyBannerPointsProps) {
  if (points.length === 0) {
    return null;
  }

  return (
    <ul className={cn("flex max-w-[76ch] list-none flex-col gap-1.5", className)}>
      {points.map((point) => (
        <li key={point} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
          <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 rounded-full bg-current" />
          <span className="text-[13px] leading-relaxed text-dose-text-secondary">{point}</span>
        </li>
      ))}
    </ul>
  );
}

export type SafetyBannerLinksProps = {
  links: WarningBannerLink[];
  className?: string;
};

/**
 * Anchor chips into the article sections that expand the claim — a banner is a
 * hoist of below-fold content, never a dead end.
 *
 * `link.label` is rendered verbatim and is never derived from `sectionId`. The
 * label is a stored, editor-authored field precisely so an editor can write
 * "Dangerous combinations" over an anchor named `interactions` (brief §7b);
 * `WARNING_BANNER_SECTION_LABELS` is the authoring-time suggestion applied by
 * `normalizeLinks`, not a render-time lookup.
 */
function SafetyBannerLinks({ links, className }: SafetyBannerLinksProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {links.map((link) => (
        <a
          key={link.sectionId}
          href={`#${link.sectionId}`}
          className={cn(
            "inline-flex items-center rounded-full border border-dose-divider px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors hover:bg-dose-surface-muted",
            focusRingClassName,
          )}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

export { SafetyBanner, SafetyBannerTitle, SafetyBannerPoints, SafetyBannerLinks, safetyBannerVariants };
