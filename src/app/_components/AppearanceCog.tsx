"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Icon } from "@/components/common/Icon";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setThemeLabOpen } from "@/features/theme-lab/themeLabStore";
import { cn } from "@/lib/utils";
import type { AppearanceAxesRows } from "./AppearanceAxes";
import { useT } from "@/i18n/client";

type AppearancePanelComponent = typeof import("./AppearancePanel").AppearancePanel;

/**
 * The panel stays a separate chunk so it costs nothing on first paint, but the popover
 * never opens around a missing panel. Opening before the chunk arrived used to paint
 * the 288x26 padded shell (a thin horizontal bar) for the length of the fetch, then
 * snap to full height. The chunk is now fetched once per page, on idle or on the first
 * pointer/focus intent at the cog, and the popover opens only once it can render the
 * panel in its final shape on the first frame.
 */
let loadedAppearancePanel: AppearancePanelComponent | null = null;
let appearancePanelRequest: Promise<AppearancePanelComponent> | null = null;

function loadAppearancePanel(): Promise<AppearancePanelComponent> {
  appearancePanelRequest ??= import("./AppearancePanel").then(
    (module) => {
      loadedAppearancePanel = module.AppearancePanel;
      return module.AppearancePanel;
    },
    (error: unknown) => {
      // A failed fetch (flaky mobile network) must not poison later attempts.
      appearancePanelRequest = null;
      throw error;
    },
  );
  return appearancePanelRequest;
}

/**
 * Which controls this instrument offers. The reader panel owns the reader preferences;
 * the cog adds the dev-only Theme Lab action that is not an appearance axis. The Fun/Pro
 * style axis is deliberately absent: it stays a Theme Lab authoring axis, not a reader
 * menu row.
 */
export type AppearanceCogRows = AppearanceAxesRows & {
  /** Opens the protected Theme Lab drawer when publication policy permits it. */
  showMoreSettings: boolean;
};

/**
 * One 44px trigger for every reader-facing appearance choice.
 *
 * The popover owns its compact, permanently dark shell. `AppearancePanel` supplies the
 * two-tab reader menu — Colour first, Font behind the type glyph — and the optional
 * dev-only Theme Lab action follows those reader preferences rather than competing
 * with them.
 */
export function AppearanceCog({
  className,
  iconSize = 28,
  alignOffset,
  sideOffset,
  showVisualStyle,
  showColorScheme,
  showAccent,
  showSurface,
  showFont,
  showMoreSettings,
}: AppearanceCogRows & {
  className?: string;
  iconSize?: number;
  /**
   * Shift along the alignment axis, passed straight to the popover content. The
   * mobile header mount uses it to land the panel's right edge on the same corner
   * inset the mobile nav sheet reaches — the trigger sits one button + one gap left
   * of the corner because the hamburger owns it.
   */
  alignOffset?: number;
  /** Shift away from the trigger along the side axis, straight through. */
  sideOffset?: number;
}) {
  const t = useT();
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [AppearancePanel, setAppearancePanel] = useState<AppearancePanelComponent | null>(
    () => loadedAppearancePanel,
  );
  // True while an open request waits on the panel chunk; a close request cancels it.
  const pendingOpenRef = useRef(false);

  const ensurePanel = useCallback(() => {
    if (loadedAppearancePanel) {
      return Promise.resolve(loadedAppearancePanel);
    }
    return loadAppearancePanel().then((panel) => {
      setAppearancePanel(() => panel);
      return panel;
    });
  }, []);

  const preloadPanel = useCallback(() => {
    ensurePanel().catch(() => {
      // Retried on the next intent or open request.
    });
  }, [ensurePanel]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        pendingOpenRef.current = false;
        setPopoverOpen(false);
        return;
      }
      if (loadedAppearancePanel) {
        setAppearancePanel(() => loadedAppearancePanel);
        setPopoverOpen(true);
        return;
      }
      pendingOpenRef.current = true;
      ensurePanel().then(
        () => {
          if (pendingOpenRef.current) {
            pendingOpenRef.current = false;
            setPopoverOpen(true);
          }
        },
        () => {
          pendingOpenRef.current = false;
        },
      );
    },
    [ensurePanel],
  );

  // Fetch the panel chunk once the page is idle, so a first tap opens instantly.
  useEffect(() => {
    if (loadedAppearancePanel) {
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preloadPanel, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(preloadPanel, 1500);
    return () => window.clearTimeout(handle);
  }, [preloadPanel]);

  // The panel anchors to one of two header mounts (desktop bar, mobile cluster) and the
  // bars trade places at the lg breakpoint. A panel left open across that crossing would
  // keep floating against an anchor the layout just hid — pinned to a corner its trigger
  // no longer occupies. When the open trigger's hit area collapses to zero, the panel
  // closes; the reader reopens it from the mount they can actually see.
  useEffect(() => {
    if (!popoverOpen) {
      return;
    }

    const closeIfTriggerHidden = () => {
      if (appearanceTriggerRef.current && appearanceTriggerRef.current.getBoundingClientRect().width === 0) {
        setPopoverOpen(false);
      }
    };

    window.addEventListener("resize", closeIfTriggerHidden);
    return () => window.removeEventListener("resize", closeIfTriggerHidden);
  }, [popoverOpen]);

  // A cog that opens an empty panel is worse than no cog. Effect Index with its style locked
  // and its accent locked still has day/night, so this is reached only by a build that offers
  // a reader nothing at all.
  if (!showColorScheme && !showSurface && !showAccent && !showFont && !showMoreSettings) {
    return null;
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={appearanceTriggerRef}
          // Names the panel, not the icon: "Appearance settings" tells a screen-reader user
          // what pressing this opens. Radix adds the expanded state and the panel's id.
          aria-label={t("Appearance settings")}
          title={t("Appearance settings")}
          data-appearance-cog=""
          // Intent ahead of the click: fetch the panel chunk if idle has not yet.
          onPointerEnter={preloadPanel}
          onPointerDown={preloadPanel}
          onFocus={preloadPanel}
          // The transparent 44px box preserves the touch target without drawing a
          // button around the glyph. Open turns the gear a quarter-turn — a state
          // cue that does not depend on colour, which matters here because the panel
          // this opens exists to change colour.
          className={cn(
            "group theme-header-icon-button theme-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            className,
          )}
        >
          <Icon
            icon="lucide:cog"
            size={iconSize}
            className="transition-transform duration-[180ms] ease-out group-hover:rotate-45 group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // The same 18rem composition serves pointer and touch layouts. Every row inside is
        // fluid and nowrap, so the panel keeps its height at this width, while the viewport
        // clamp keeps a 320px phone on-screen.
        // `theme-chrome-dark` pins the dark control palette even when the page is light.
        className="theme-chrome-dark theme-appearance-popover w-[min(18rem,calc(100vw-1.5rem))] max-w-none p-0 data-[state=open]:[animation-duration:180ms] data-[state=closed]:[animation-duration:120ms] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none"
        align="end"
        // Radix places the panel `sideOffset + arrow height` from the trigger, so 0 here
        // plus the 8px stem below lands the visible edge 8px under the cog — the same
        // gap the mobile nav panel keeps (`top-[calc(100%+0.5rem)]` in Header.tsx).
        sideOffset={sideOffset ?? 0}
        alignOffset={alignOffset ?? 0}
        collisionPadding={12}
        aria-label={t("Appearance settings")}
        /**
         * Escape belongs to this panel and stops here. Radix closes it from its own
         * capture-phase listener before this runs, so the dismissal is unaffected; stopping
         * propagation after it keeps the key from reaching anything else. Two kinds of
         * page-level handler would otherwise see it: a React `onKeyDown` above the cog,
         * because React routes portalled events up the *component* tree rather than the DOM
         * tree, and any `window` keydown listener, because React's own root listener sits
         * inside `<body>`. `Header.tsx` stops its
         * Escape for the same reason.
         */
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Escape") {
            event.stopPropagation();
          }
        }}
      >
        {/* The stem uses the same dark chrome fill as the panel. */}
        <PopoverArrow
          aria-hidden="true"
          width={16}
          height={8}
          className="theme-popover-arrow"
        />
        <div className="max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain p-3">
          {popoverOpen && AppearancePanel && <AppearancePanel
            showVisualStyle={showVisualStyle}
            showColorScheme={showColorScheme}
            showSurface={showSurface}
            showAccent={showAccent}
            showFont={showFont}
            surfaceLabel={t("Background")}
            footerAction={
              showMoreSettings ? (
                <button
                  type="button"
                  aria-label={t("Open Theme Lab")}
                  aria-haspopup="dialog"
                  aria-controls="theme-lab-panel"
                  onClick={() => {
                    setPopoverOpen(false);
                    setThemeLabOpen(true, appearanceTriggerRef.current);
                  }}
                  className="theme-focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-dose-text-muted transition-colors hover:bg-dose-surface-muted hover:text-dose-text-secondary [@media(pointer:coarse)]:h-11"
                >
                  <Icon icon="lucide:palette" size={14} />
                  <span>{t("Theme Lab")}</span>
                </button>
              ) : null
            }
          />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
