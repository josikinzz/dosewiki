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
  // On a phone the icon is gone: at title size it read as decoration that
  // cost a full line above the fold. At sm and up it is a glyph in the text
  // run, one em tall on the cap line, leading the first word.
  // `prominentMobileIcon` instead stacks it centred above the title at hero
  // size on a phone.
  // Icon fonts pad their 24-unit viewBox by 1-3 units on each side, so the
  // glyph's box already carries air before the first letter; the margin only
  // tops it up to about half a word space. The fade keeps the glyph as a
  // letter of the word rather than a second thing competing with the title.
  const iconClassName = cn(
    "theme-accent-heading align-[-0.12em] opacity-70 sm:mb-0 sm:mr-[0.02em] sm:inline-block sm:h-[1em] sm:w-[1em]",
    prominentMobileIcon
      ? cn("mb-3 block h-[2em] w-[2em]", isLeft ? undefined : "mx-auto")
      : "hidden",
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
