import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  className?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  prominentMobileIcon?: boolean;
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
  prominentMobileIcon = false,
  descriptionClassName,
  titleClassName,
  align = "center",
}: PageHeaderProps) {
  const isLeft = align === "left";
  // The icon is a glyph in the text run, one em tall and sitting on the
  // baseline like a capital, so the title wraps as ordinary text with the
  // icon leading the first word. A flex row instead put the icon in its own
  // column and, on a phone, left a wrapped title floating beside it.
  const iconClassName = cn(
    "theme-accent-heading inline-block align-[-0.12em]",
    prominentMobileIcon
      ? "mx-auto mb-3 block h-[2em] w-[2em] sm:mb-0 sm:mr-[0.3em] sm:inline-block sm:h-[1em] sm:w-[1em]"
      : "mr-[0.3em]",
  );
  const titleClasses = cn(
    "type-page-title theme-accent-heading block max-w-[22ch] break-words text-balance text-4xl sm:text-5xl md:text-6xl",
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
        {icon ? <IconComponent icon={icon} size="1em" className={iconClassName} /> : null}
        {title}
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
