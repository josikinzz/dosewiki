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

let loadedAppearancePanel: AppearancePanelComponent | null = null;
let appearancePanelRequest: Promise<AppearancePanelComponent> | null = null;

function loadAppearancePanel(): Promise<AppearancePanelComponent> {
  appearancePanelRequest ??= import("./AppearancePanel").then(
    (module) => {
      loadedAppearancePanel = module.AppearancePanel;
      return module.AppearancePanel;
    },
    (error: unknown) => {
      appearancePanelRequest = null;
      throw error;
    },
  );
  return appearancePanelRequest;
}

export type AppearanceCogRows = AppearanceAxesRows & {
  showMoreSettings: boolean;
};

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
  alignOffset?: number;
  sideOffset?: number;
}) {
  const t = useT();
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [AppearancePanel, setAppearancePanel] = useState<AppearancePanelComponent | null>(
    () => loadedAppearancePanel,
  );
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

  if (!showColorScheme && !showSurface && !showAccent && !showFont && !showMoreSettings) {
    return null;
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={appearanceTriggerRef}
          aria-label={t("Appearance settings")}
          title={t("Appearance settings")}
          data-appearance-cog=""
          onPointerEnter={preloadPanel}
          onPointerDown={preloadPanel}
          onFocus={preloadPanel}
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
        className="theme-chrome-dark theme-appearance-popover w-[min(18rem,calc(100vw-1.5rem))] max-w-none p-0 data-[state=open]:[animation-duration:180ms] data-[state=closed]:[animation-duration:120ms] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none"
        align="end"
        sideOffset={sideOffset ?? 0}
        alignOffset={alignOffset ?? 0}
        collisionPadding={12}
        aria-label={t("Appearance settings")}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Escape") {
            event.stopPropagation();
          }
        }}
      >
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
