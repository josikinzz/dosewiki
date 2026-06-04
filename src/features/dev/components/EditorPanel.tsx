import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export type EditorPanelVariant =
  | "default"
  | "subtle"
  | "inset"
  | "danger"
  | "toolbar"
  | "empty";

export interface EditorPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: EditorPanelVariant;
}

const editorPanelVariantClasses: Record<EditorPanelVariant, string> = {
  default:
    "theme-text-primary border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)] shadow-xl",
  subtle:
    "theme-text-primary border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)]",
  inset:
    "theme-text-primary border-[color:var(--editor-panel-border)] bg-[var(--editor-field-bg)] shadow-inner",
  danger:
    "border-rose-400/30 bg-rose-500/10 text-rose-100",
  toolbar:
    "theme-text-primary border-[color:var(--editor-toolbar-separator)] bg-[var(--editor-panel-bg-subtle)]",
  empty:
    "theme-text-muted border-dashed border-[color:var(--editor-panel-border)] bg-transparent",
};

export const EditorPanel = forwardRef<HTMLDivElement, EditorPanelProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <Surface
      ref={ref}
      variant="none"
      padding="none"
      radius="lg"
      className={cn(
        "overflow-hidden",
        editorPanelVariantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);

EditorPanel.displayName = "EditorPanel";

export interface EditorPanelHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: ReactNode;
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

function EditorHeaderIcon({ icon }: { icon: IconName | ReactNode }) {
  if (typeof icon === "string") {
    return (
      <span className="theme-icon-accent flex size-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)]">
        <Icon icon={icon} size={18} />
      </span>
    );
  }

  return <>{icon}</>;
}

export function EditorPanelHeader({
  eyebrow,
  icon,
  title,
  description,
  meta,
  actions,
  className,
  children,
  ...props
}: EditorPanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--editor-panel-border)] px-4 py-4 sm:px-5",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? <EditorHeaderIcon icon={icon} /> : null}
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            typeof eyebrow === "string" || typeof eyebrow === "number" ? (
              <Badge variant="secondary" className="w-fit">
                {eyebrow}
              </Badge>
            ) : (
              eyebrow
            )
          ) : null}
          <div className="space-y-1">
            <h2 className="theme-text-primary text-base font-semibold leading-6">
              {title}
            </h2>
            {description ? (
              <div className="theme-text-muted max-w-3xl text-sm leading-6">
                {description}
              </div>
            ) : null}
          </div>
          {meta ? (
            <div className="theme-text-faint flex flex-wrap items-center gap-2 text-xs">
              {meta}
            </div>
          ) : null}
          {children}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export interface EditorPanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  density?: "default" | "compact";
}

export function EditorPanelBody({
  density = "default",
  className,
  ...props
}: EditorPanelBodyProps) {
  return (
    <div
      className={cn(
        density === "compact" ? "p-3 sm:p-4" : "p-4 sm:p-5",
        className,
      )}
      {...props}
    />
  );
}
