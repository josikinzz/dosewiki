import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Icon, type IconName } from "@/components/common/Icon";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  toWarningBannerBlocks,
} from "@/data/substanceWarningBanners";
import { cn } from "@/lib/utils";

/**
 * The safety banner that sits above a substance article's <h1>.
 *
 * Deliberately dumb: it renders the strings it is handed and decides nothing.
 * Whether a banner appears is an editorial act recorded as an explicit slug
 * list or the sitewide `allSubstances` scope, then resolved by
 * `resolveEnabledBanners`. Classification never reaches this component.
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
  "grid w-full gap-x-4 gap-y-3 overflow-hidden rounded-card p-4 max-[560px]:block",
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
    /**
     * The glyph's pixel size. One site-wide editor setting (stored on the
     * `safety-banner-display` siteConfig document, edited in the Banner Studio
     * toolbar) threaded down to every banner on the site — deliberately NOT a
     * per-banner or per-preset choice, so every warning a reader meets is the
     * same weight. Absent renders at `SAFETY_BANNER_ICON_SIZE_DEFAULT`.
     *
     * A prop rather than a cva variant on purpose: the value is a stored number
     * with no fixed steps, `src/components/ui/ownership.test.ts` keeps this
     * primitive's variants tone-only, and a `size` variant group would invite
     * exactly the per-banner sizing this replaces.
     */
    iconSize?: number;
  };

const SafetyBanner = React.forwardRef<HTMLDivElement, SafetyBannerProps>(
  ({ className, variant, role, icon, iconSize, children, ...props }, ref) => {
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
          className,
        )}
        {...props}
      >
        {icon ? (
          // Centred down the glyph column rather than pinned to the first line:
          // at 44px against two or three lines of prose a top-aligned glyph
          // reads as having slipped upward. Below 560px the grid gives way to
          // block flow and the glyph floats left so the prose wraps around it
          // instead of stacking under it.
          <Icon
            icon={icon}
            className="shrink-0 self-center max-[560px]:float-left max-[560px]:mb-1 max-[560px]:mr-3"
            size={iconSize ?? SAFETY_BANNER_ICON_SIZE_DEFAULT}
          />
        ) : null}
        {/* Flex only above 560px: a flex container is a BFC that shoves itself
            below the float wholesale, so mobile drops to block flow (space-y
            standing in for gap) to let line boxes wrap the glyph. */}
        <div className="flex min-w-0 flex-col items-start gap-2 [overflow-wrap:anywhere] max-[560px]:block max-[560px]:space-y-2">{children}</div>
      </div>
    );
  },
);
SafetyBanner.displayName = "SafetyBanner";

export type SafetyBannerTitleProps = React.HTMLAttributes<HTMLParagraphElement> & {
  /** The chip word. Rendered inline, on the headline's own row. */
  severityLabel?: string;
  tone?: SafetyBannerTone;
};

/**
 * The severity chip and the headline, on one row.
 *
 * The chip lives here rather than in `SafetyBanner` so that "same row as the
 * headline" is structural instead of a layout coincidence — stacked in the
 * banner's flex column they drifted onto separate lines, which is what editors
 * were looking at when they asked for one line.
 *
 * A <p>, not a heading. The banner renders above the article's <h1>, so a
 * heading here would put a safety claim ahead of the substance name in the
 * document outline and in every screen-reader heading list.
 */
const SafetyBannerTitle = React.forwardRef<HTMLParagraphElement, SafetyBannerTitleProps>(
  ({ className, severityLabel, tone = "danger", children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 font-display text-[15px] font-semibold leading-snug text-dose-text",
        className,
      )}
      {...props}
    >
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
    </p>
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
 * Bullets are opt-in: a line is a paragraph unless the editor opened it with a
 * markdown marker. Inferring a list from line count gave editors bullets they
 * never asked for and no way to refuse, so `toWarningBannerBlocks` owns the rule
 * and this component only renders what it returns.
 *
 * The list marker is a `bg-current` dot on a `list-none` list, never a
 * `border-left` accent stripe, which the brief bans outright (§9). The dot
 * inherits the root's tone ink while the sentence overrides to prose colour.
 * The prose runs the full card width — no measure cap — so the banner text
 * wraps only where the card itself does.
 */
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
