import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

/**
 * The Effect Index homepage panel shell, ported from the old site's
 * `components/home/Panel.vue`. It is the distinctive piece of that page and every panel is
 * this one shape: a faintly washed header band carrying a title with an italic subtitle
 * beneath it and the section icon pushed to the far right, a white content area, and an
 * optional quiet "For more, see …" footer band.
 *
 * TYPOGRAPHY NOTE — do not "fix" this by reaching for the site's heading classes.
 * `theme-accent-heading` and the `--theme-section-heading` text utility are both rewritten under
 * `html[data-visual-style="pro"]` into the uppercase, tracked-out, teal section-head voice
 * (see src/styles/pro-theme.css). That voice is correct for in-article section heads
 * and for the effects-index column cards; it is wrong here. Verified against the live
 * original: these panel titles are MIXED CASE, regular weight, dark grey ink. The uppercase
 * tracked-out treatment belongs to the sub-group labels *inside* a panel's content
 * (`HomePanelGroupLabel`), which are teal. So the title styling below is spelled out
 * explicitly and deliberately names none of those classes.
 */

const PANEL_BAND_CLASS = "bg-dose-surface-muted";

interface HomePanelProps {
  title: string;
  /** Italic subtitle under the title. The sponsor panel is the one panel without one. */
  description?: string;
  icon: IconName;
  /** The quiet footer line. Omitted entirely when absent — no empty band. */
  stub?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Replaces the content area's default padding. Passed by the panels whose content is
   * edge-to-edge (the sponsor image, the replication carousel) or supplies its own row
   * padding (the effect groups, reports and article lists).
   */
  contentClassName?: string;
}

export function HomePanel({
  title,
  description,
  icon,
  stub,
  children,
  className,
  contentClassName,
}: HomePanelProps) {
  return (
    <section
      className={cn(
        "theme-public-card flex flex-col overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 border-b border-dose-border px-3 py-2",
          PANEL_BAND_CLASS,
        )}
      >
        <div className="min-w-0">
          <h2 className="theme-text-primary text-xl font-normal leading-tight">{title}</h2>
          {description ? (
            <p className="theme-text-muted mt-0.5 text-[0.8125rem] italic leading-snug">
              {description}
            </p>
          ) : null}
        </div>
        <Icon icon={icon} size={26} className="theme-text-faint mt-0.5 shrink-0" />
      </div>

      <div className={contentClassName ?? "px-3 py-3"}>{children}</div>

      {stub ? (
        <div
          className={cn(
            "theme-text-muted border-t border-dose-border px-3 py-1.5 text-[0.9375rem]",
            PANEL_BAND_CLASS,
          )}
        >
          {stub}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A sub-group label inside a panel's content ("VISUAL EFFECTS"). This is the one place on
 * the panel that *does* take the uppercase, tracked-out, teal voice — see the note above.
 */
export function HomePanelGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[0.8125rem] font-normal uppercase leading-none tracking-[0.16em] text-dose-accent">
      {children}
    </h3>
  );
}

/**
 * Link treatment for panel content. Teal at `--theme-accent` rather than the deeper
 * `--theme-accent-strong` that `theme-accent-emphasis` resolves to, because #3d9991 is the
 * shade the original reserved for links and the effects index already uses here.
 */
export const homePanelLinkClassName =
  "text-dose-accent transition-colors hover:text-dose-accent-strong hover:underline hover:decoration-1 hover:underline-offset-2 theme-focus-ring";

/** A row inside a list-shaped panel: own padding, hairline rule, quiet hover wash. */
export const homePanelRowClassName =
  "border-b border-dose-border px-3 py-3 last:border-b-0 transition-colors hover:bg-dose-surface-muted";
