import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export interface EditorSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Heading icon — pass an `IconName` for the standard accent glyph, or a node for custom adornment. */
  icon?: IconName | ReactNode;
  /** Section heading text. Omit to render a header-less free-floating block. */
  title?: ReactNode;
  /** Optional supporting line shown beneath the heading. */
  description?: ReactNode;
  /** Trailing controls (pills, buttons) aligned to the end of the heading row, after the hairline. */
  actions?: ReactNode;
  /** Entrance-animation stagger in seconds (mirrors the article section rhythm). */
  delay?: number;
  /** Disable the fade-and-rise entrance animation. */
  animate?: boolean;
  /**
   * Heading tag for the section title. Defaults to `h2` (top-level dev/public
   * sections); drop to `h3`/`h4` when the section is nested inside an
   * already-headed region so the document outline stays ordered.
   */
  headingLevel?: "h2" | "h3" | "h4";
  headerClassName?: string;
}

/**
 * Free-floating dev-tools section. Mirrors the public `ArticleSection` /
 * `SectionHeader` DNA — an accent icon + heading followed by a gradient
 * hairline — but tuned for the denser editor surface (compact heading,
 * optional description, optional trailing actions).
 *
 * Cards are the exception, not the rule: reach for a `Surface`/`ContentCard`
 * only for genuinely distinct sub-panels (scroll wells, selectable rows,
 * danger callouts, previews), never as a default wrapper around a section.
 */
export function EditorSection({
  icon,
  title,
  description,
  actions,
  delay = 0,
  animate = true,
  headingLevel: Heading = "h2",
  className,
  headerClassName,
  children,
  style,
  ...props
}: EditorSectionProps) {
  const hasHeader = Boolean(icon || title || description || actions);
  const mergedStyle: CSSProperties | undefined =
    delay > 0
      ? { ...style, "--theme-section-card-delay": `${delay}s` } as CSSProperties
      : style;

  return (
    <section
      className={cn(animate && "theme-section-card-enter", "space-y-4", className)}
      style={mergedStyle}
      {...props}
    >
      {hasHeader ? (
        <div className={cn("space-y-1.5", headerClassName)}>
          {/* flex-wrap + min-w-0 let long titles and wide actions drop to a new
              line on narrow viewports instead of overflowing the page; on
              desktop everything still fits one row with the hairline filling
              the middle. The hairline keeps a small min-width so a stub stays
              visible beside the title even when the actions wrap. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {title ? (
              <Heading className="theme-accent-heading flex min-w-0 items-center gap-2.5 text-lg font-semibold">
                {typeof icon === "string" ? (
                  <Icon icon={icon as IconName} className="theme-icon-accent h-5 w-5 shrink-0" size={20} />
                ) : (
                  icon ?? null
                )}
                {title}
              </Heading>
            ) : null}
            <div className="theme-gradient-divider h-px min-w-6 flex-1" />
            {actions ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          {description ? <p className="theme-text-faint text-sm">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
