import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

/**
 * The safety banner that sits above a substance article's <h1>.
 *
 * Deliberately dumb: it renders the strings it is handed and decides nothing.
 * Whether a banner appears at all is an editorial act recorded in
 * `warningBannerPresets.enabledSlugs` and resolved by `resolveEnabledBanners`
 * in `src/data/substanceWarningBanners.ts`. There is no path from a substance's
 * classification to this component, by construction.
 *
 * Two cells and no rule between them. The vertical hairline the first cut drew
 * between the glyph and the body was rejected outright: the tone surface
 * already groups the two, so the divider only chopped the card in half.
 *
 * Tone drives two things and no more: the card surface (the shared
 * `.theme-interaction-{danger,unsafe,caution}` classes in
 * `src/styles/utilities-theme.css`) and the root `color`, which is the tone's
 * badge ink. Everything tonal downstream — the glyph, the bullet dots —
 * inherits that `currentColor`, which is why `SafetyBannerPoints` needs no tone
 * prop. Prose opts back out explicitly (`text-dose-text`,
 * `text-dose-text-secondary`).
 *
 * No "use client": `src/app/dev/kit/registry/render.test.tsx` pushes every kit
 * example through `renderToStaticMarkup`, and the article mount is a server
 * component.
 */
const safetyBannerVariants = cva(
  "grid w-full gap-x-4 gap-y-3 overflow-hidden rounded-2xl p-4 max-[560px]:grid-cols-1",
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

type SafetyBannerTone = NonNullable<VariantProps<typeof safetyBannerVariants>["variant"]>;

/**
 * The severity chip. `theme-interaction-severity-badge-*` is the same class the
 * interactions table uses, and it is already paired to the tone cards in both
 * themes: nested inside `.theme-interaction-<tone>` it swaps its fill to
 * `--theme-field-on-panel-surface` (utilities-theme.css:4255, mirrored in
 * theme-light-mode.css:1231), i.e. one step deeper than the card it sits on,
 * with the tone's ink on top. That recess is what makes the label read as a
 * chip rather than as loose small caps — and it costs no new token.
 */
const TONE_CHIP_CLASS: Record<SafetyBannerTone, string> = {
  danger: "theme-interaction-severity-badge-danger",
  unsafe: "theme-interaction-severity-badge-unsafe",
  caution: "theme-interaction-severity-badge-caution",
};

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
    const tone: SafetyBannerTone = variant ?? "danger";

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
        data-safety-banner={tone}
        className={cn(
          safetyBannerVariants({ variant }),
          // The glyph column is `auto`, so an icon-less banner would otherwise
          // shrink-wrap its prose into a phantom gutter. `icon` is editor-typed
          // free text and can legitimately be blank mid-edit.
          icon ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
          dimmed && "opacity-60 saturate-50",
          className,
        )}
        {...props}
      >
        {icon ? <Icon icon={icon} className="shrink-0 self-start" size={44} /> : null}
        <div className="flex min-w-0 flex-col items-start gap-2">
          {severityLabel ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em]",
                TONE_CHIP_CLASS[tone],
              )}
            >
              {severityLabel}
            </span>
          ) : null}
          {children}
        </div>
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

const POINT_TEXT_CLASS = "text-[13px] leading-relaxed text-dose-text-secondary";

/**
 * The mechanism text.
 *
 * A single point is a paragraph with no marker. Bullets are a consequence of
 * having written more than one thing, never a requirement — a one-item list is
 * a bullet pointing at nothing, and editors asked for it to stop.
 *
 * The multi-point marker is a `bg-current` dot on a `list-none` list, never a
 * `border-left` accent stripe, which the brief bans outright (§9). The dot
 * inherits the root's tone ink while the sentence overrides to prose colour;
 * 76ch is the brief's measure for the only real prose in the banner.
 */
function SafetyBannerPoints({ points, className }: SafetyBannerPointsProps) {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return <p className={cn("max-w-[76ch]", POINT_TEXT_CLASS, className)}>{points[0]}</p>;
  }

  return (
    <ul className={cn("flex max-w-[76ch] list-none flex-col gap-1.5", className)}>
      {points.map((point) => (
        <li key={point} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
          <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 rounded-full bg-current" />
          <span className={POINT_TEXT_CLASS}>{point}</span>
        </li>
      ))}
    </ul>
  );
}

export { SafetyBanner, SafetyBannerTitle, SafetyBannerPoints, safetyBannerVariants };
