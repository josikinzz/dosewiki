import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  className?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  descriptionClassName?: string;
  /** Extra classes merged onto the `h1`, e.g. a page that wants a smaller title. */
  titleClassName?: string;
  /**
   * Horizontal alignment of the whole header.
   *
   * Centred is right for a landing page whose header is the only thing above
   * the fold. It is wrong as soon as the page reads as an article: a centred
   * title above left-aligned prose has no shared edge with anything below it,
   * and next to a table-of-contents rail it drifts into the middle of the page
   * with nothing to anchor it. Those pages pass "left".
   */
  align?: "center" | "left";
}

export const PageHeader = memo(function PageHeader({
  className,
  title,
  description,
  icon,
  descriptionClassName,
  titleClassName,
  align = "center",
}: PageHeaderProps) {
  const isLeft = align === "left";
  // The icon sits out of flow, hung off the left edge of the text run, so the
  // title centres on its letters alone and the glyph does not shift the
  // optical middle. It keeps the accent colour but at low opacity, so it
  // recedes into the background. The h1 carries symmetric side padding one
  // glyph wide so a title that fills a phone column still leaves room for
  // the hung icon without moving the text off centre.
  const iconClassName =
    "theme-accent-heading absolute right-full top-1/2 mr-[0.15em] block h-[1em] w-[1em] -translate-y-1/2 opacity-30";
  const titleClasses = cn(
    "type-page-title theme-accent-heading block max-w-[22ch] text-balance text-4xl wrap-normal! sm:text-5xl md:text-6xl",
    icon ? (isLeft ? "pl-[1.15em]" : "px-[1.15em]") : undefined,
    isLeft ? undefined : "mx-auto",
    titleClassName,
  );

  return (
    <header
      className={cn(
        "relative isolate mb-16 flex flex-col gap-5",
        isLeft ? "items-start text-left" : "text-center",
        className,
      )}
    >
      <h1 className={titleClasses}>
        {icon ? (
          <span className="relative inline-block">
            <IconComponent icon={icon} size="1em" className={iconClassName} />
            {title}
          </span>
        ) : (
          title
        )}
      </h1>
      {description ? (
        <div
          className={
            descriptionClassName ??
            cn(
              "type-lead type-reading-measure theme-accent-emphasis-scope theme-text-secondary text-balance",
              isLeft ? undefined : "mx-auto",
            )
          }
        >
          {description}
        </div>
      ) : null}
    </header>
  );
});
