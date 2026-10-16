import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export interface EditorSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  icon?: IconName | ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  delay?: number;
  animate?: boolean;
  headingLevel?: "h2" | "h3" | "h4" | "h5";
  headerClassName?: string;
}

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
          {description ? <p className="theme-text-faint max-w-[75ch] text-sm">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
