import { SmartLink } from "../common/SmartLink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { GlobalSearch } from "../common/GlobalSearch";
import { Icon } from "../common/Icon";
import { SiteWordmark } from "../common/SiteWordmark";
import { SiteVersionBadge } from "../common/SiteVersionBadge";
import { AppearanceControls } from "@/features/appearance/AppearanceControls";
import type {
  AppView,
  RouteChromeModel,
  RouteChromeNavChild,
  RouteChromeNavItem,
} from "../../types/navigation";
import { Button } from "@/components/ui/button";
import { icons } from "@/utils/iconNames";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { useT } from "@/i18n/client";

function NavChildLink({
  child,
  className,
  role,
  tabIndex,
  onSelect,
}: {
  child: RouteChromeNavChild;
  className: string;
  role?: "menuitem";
  tabIndex?: number;
  onSelect: () => void;
}) {
  const t = useT();
  const label = t(child.label);
  const body = (
    <>
      <span>{label}</span>
      {child.external && (
        <Icon
          icon={icons.externalLink}
          size={13}
          className="theme-header-nav-icon ml-auto shrink-0 opacity-70"
        />
      )}
    </>
  );

  if (child.external) {
    return (
      <a
        href={child.href}
        target="_blank"
        rel="noreferrer noopener"
        role={role}
        tabIndex={tabIndex}
        className={className}
        aria-label={t("{{label}} (opens in a new tab)", { label })}
        onClick={onSelect}
      >
        {body}
      </a>
    );
  }


  return (
    <SmartLink
      href={child.href}
      role={role}
      tabIndex={tabIndex}
      className={className}
      onClick={onSelect}
    >
      {body}
    </SmartLink>
  );
}

const DESKTOP_SUBMENU_LINK_CLASS =
  "theme-header-nav-link theme-focus-ring flex min-h-10 items-center gap-2 rounded-control border border-transparent px-3 py-2 text-sm font-medium";

const DESKTOP_NAV_LINK_CLASS =
  "theme-header-nav-link theme-focus-ring relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-3 py-2 text-sm font-medium";

const NAV_PANEL_CLASS =
  "theme-overlay-surface theme-mobile-nav-panel theme-overlay-enter absolute top-[calc(100%+0.5rem)] rounded-card border p-2 shadow-[var(--theme-elevation-xl)] backdrop-blur-[var(--frost-blur)]";

const CHROME_ICON_SIZE = 20;

const CHEVRON_TRANSITION_CLASS =
  "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] motion-reduce:transition-none";

const DESKTOP_DISCLOSURE_CLASS =
  "theme-header-nav-link theme-focus-ring -ml-1.5 flex h-11 w-9 shrink-0 items-center justify-center rounded-full border border-transparent";

function DesktopNavItem({
  item,
  className,
  align,
  isOpen,
  onOpenChange,
}: {
  item: RouteChromeNavItem;
  className: string;
  align: "left" | "right";
  isOpen: boolean;
  onOpenChange: (id: string | null) => void;
}) {
  const t = useT();
  const navIcon = resolveRouteChromeIcon(item.icon);
  const chevronRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<"first" | "last" | null>(null);
  const submenu = item.submenu;

  const menuLinks = useCallback(
    () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []),
    [],
  );

  const focusAt = useCallback(
    (index: number) => {
      const links = menuLinks();
      if (links.length === 0) {
        return;
      }
      links[((index % links.length) + links.length) % links.length]?.focus();
    },
    [menuLinks],
  );

  useEffect(() => {
    if (!isOpen || pendingFocusRef.current === null) {
      return;
    }
    const links = menuLinks();
    (pendingFocusRef.current === "first" ? links[0] : links[links.length - 1])?.focus();
    pendingFocusRef.current = null;
  }, [isOpen, menuLinks]);

  if (!submenu) {
    return (
      <SmartLink
        href={item.href}
        scroll={false}
        data-active={item.active}
        className={className}
        aria-current={item.active ? "page" : undefined}
      >
        <Icon icon={navIcon} size={CHROME_ICON_SIZE} className="theme-header-nav-icon shrink-0" />
        <span>{t(item.label)}</span>
      </SmartLink>
    );
  }

  const panelId = `header-nav-${item.id}-menu`;
  const labelId = `header-nav-${item.id}-label`;

  const openAt = (edge: "first" | "last") => {
    if (isOpen) {
      focusAt(edge === "first" ? 0 : menuLinks().length - 1);
      return;
    }
    pendingFocusRef.current = edge;
    onOpenChange(item.id);
  };

  const close = (returnFocus: boolean) => {
    onOpenChange(null);
    if (returnFocus) {
      chevronRef.current?.focus();
    }
  };

  const handleEscape = (
    event: ReactKeyboardEvent<HTMLElement>,
    returnFocus: boolean,
  ): boolean => {
    if (event.key !== "Escape" || !isOpen) {
      return false;
    }
    event.stopPropagation();
    close(returnFocus);

    return true;
  };

  const handleChevronKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (handleEscape(event, true)) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt("last");
    } else if (event.key === "Tab") {
      onOpenChange(null);
    }
  };

  const handleLabelKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
    if (handleEscape(event, false)) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt("last");
    }
  };

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (handleEscape(event, true)) {
      return;
    }

    const links = menuLinks();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(links.length - 1);
        break;
      case "Tab":
        onOpenChange(null);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative flex items-center">
      <SmartLink
        href={item.href}
        scroll={false}
        data-active={item.active}
        className={className}
        aria-current={item.active ? "page" : undefined}
        onKeyDown={handleLabelKeyDown}
      >
        <Icon icon={navIcon} size={CHROME_ICON_SIZE} className="theme-header-nav-icon shrink-0" />
        <span id={labelId}>{t(item.label)}</span>
      </SmartLink>

      <button
        ref={chevronRef}
        type="button"
        data-active={item.active}
        className={DESKTOP_DISCLOSURE_CLASS}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={t("Show {{label}} submenu", { label: t(item.label) })}
        onClick={() => (isOpen ? close(false) : onOpenChange(item.id))}
        onKeyDown={handleChevronKeyDown}
      >
        <Icon
          icon={icons.chevronDown}
          size={14}
          className={`theme-header-nav-icon shrink-0 ${CHEVRON_TRANSITION_CLASS} ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          tabIndex={-1}
          aria-labelledby={labelId}
          onKeyDown={handlePanelKeyDown}
          className={`${NAV_PANEL_CLASS} z-50 flex w-56 flex-col gap-0.5 ${
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          }`}
        >
          {submenu.map((child) => (
            <NavChildLink
              key={child.id}
              child={child}
              role="menuitem"
              tabIndex={-1}
              className={DESKTOP_SUBMENU_LINK_CLASS}
              onSelect={() => onOpenChange(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const MOBILE_SUBMENU_LINK_CLASS =
  "theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex min-h-10 items-center gap-2 rounded-control border border-transparent px-3 py-2 text-sm font-medium";

const MOBILE_NAV_LINK_CLASS =
  "theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex min-h-11 items-center gap-2.5 rounded-control border border-transparent px-3 py-2 text-sm font-medium";

const MOBILE_DISCLOSURE_CLASS =
  "theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-transparent";

function MobileNavItem({
  item,
  className,
  iconSize,
  isExpanded,
  onToggle,
  onNavigate,
  showActiveIndicator = false,
}: {
  item: RouteChromeNavItem;
  className: string;
  iconSize: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onNavigate: () => void;
  showActiveIndicator?: boolean;
}) {
  const t = useT();
  const navIcon = resolveRouteChromeIcon(item.icon);
  const label = t(item.mobileLabel ?? item.label);
  const submenu = item.submenu;

  if (!submenu) {
    return (
      <SmartLink
        href={item.href}
        scroll={false}
        onClick={onNavigate}
        data-active={item.active}
        className={className}
        aria-current={item.active ? "page" : undefined}
      >
        <Icon icon={navIcon} size={iconSize} className="theme-header-nav-icon shrink-0" />
        <span>{label}</span>
        {showActiveIndicator && item.active && (
          <div className="theme-header-nav-indicator ml-auto h-1.5 w-1.5 rounded-full" />
        )}
      </SmartLink>
    );
  }

  const submenuId = `mobile-nav-${item.id}-submenu`;

  return (
    <div>
      <div className="flex items-center">
        <SmartLink
          href={item.href}
          scroll={false}
          onClick={onNavigate}
          data-active={item.active}
          className={`${className} min-w-0 flex-1`}
          aria-current={item.active ? "page" : undefined}
        >
          <Icon icon={navIcon} size={iconSize} className="theme-header-nav-icon shrink-0" />
          <span>{label}</span>
          {showActiveIndicator && item.active && (
            <div className="theme-header-nav-indicator ml-auto h-1.5 w-1.5 rounded-full" />
          )}
        </SmartLink>

        <button
          type="button"
          data-active={item.active}
          className={MOBILE_DISCLOSURE_CLASS}
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? submenuId : undefined}
          aria-label={t("Show {{label}} submenu", { label })}
          onClick={() => onToggle(item.id)}
        >
          <Icon
            icon={icons.chevronDown}
            size={16}
            className={`theme-header-nav-icon shrink-0 ${CHEVRON_TRANSITION_CLASS} ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isExpanded && (
        <div
          id={submenuId}
          className="ml-5 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-dose-divider pl-2"
        >
          {submenu.map((child) => (
            <NavChildLink
              key={child.id}
              child={child}
              className={MOBILE_SUBMENU_LINK_CLASS}
              onSelect={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const BRAND_LIFT_CLASS =
  "transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] group-hover/brand:scale-[1.03] group-focus-visible/brand:scale-[1.03] motion-reduce:transition-none";

const MENU_GLYPH_TRANSITION_CLASS =
  "transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)] motion-reduce:transition-none";

interface HeaderProps {
  model: RouteChromeModel;
  onNavigate: (view: AppView) => void;
  onReplaceNavigate?: (view: AppView) => void;
  onLiveNavigate?: (view: AppView) => void;
  liveSearchClearView?: AppView | null;
  forceMobileNav?: boolean;
}

export function Header({
  model,
  onNavigate,
  onReplaceNavigate,
  onLiveNavigate,
  liveSearchClearView = null,
  forceMobileNav = false,
}: HeaderProps) {
  const t = useT();
  const aboutItem = model.secondaryNavItems.find((item) => item.id === "about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedMobileIds, setExpandedMobileIds] = useState<readonly string[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopNavRef = useRef<HTMLDivElement | null>(null);

  const toggleMobileGroup = (id: string) => {
    setExpandedMobileIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    setIsMenuOpen(false);
    setOpenMenuId(null);
  }, [model.currentView]);

  useEffect(() => {
    if (!isMenuOpen) {
      setExpandedMobileIds([]);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (openMenuId === null) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!desktopNavRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuPanelRef.current &&
        !menuPanelRef.current.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <header className="app-header theme-chrome-dark theme-header-surface backdrop-blur-[var(--frost-blur)] backdrop-safe">
      <div
        data-nosnippet
        className={
          forceMobileNav
            ? "flex w-full items-center gap-3 px-4 py-3 min-[1600px]:px-6 gap-fallback-row-4"
            : "flex w-full items-center gap-3 px-4 py-3 min-[1600px]:px-6 gap-fallback-row-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4"
        }
      >
        <Button
          asChild
          variant="ghost"
          className="group/brand flex h-11 w-auto items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:pl-0"
        >
          <SmartLink href={model.headerLogo.href} scroll={false} eager>
          <span className={`relative inline-flex items-center justify-center ${BRAND_LIFT_CLASS}`}>
            <DoseWikiLogo
              width={40}
              height={40}
              className="safari-svg-gpu h-10 w-10"
              draggable={false}
            />
            <SiteVersionBadge variant="logoOverlay" />
          </span>
          <span className="hidden flex-col items-start justify-center gap-0.5 xl:flex">
            <span className={`theme-text-primary inline-flex items-center text-2xl font-display font-bold leading-none tracking-tight ${BRAND_LIFT_CLASS}`}>
              <SiteWordmark />
            </span>
            <SiteVersionBadge variant="header" />
          </span>
          </SmartLink>
        </Button>

        <div
          className={
            forceMobileNav
              ? "flex min-h-11 min-w-0 flex-1 items-center"
              : "flex min-h-11 min-w-0 flex-1 items-center lg:w-full lg:max-w-none"
          }
        >
          <GlobalSearch
            currentView={model.currentView}
            onNavigate={onNavigate}
            onReplaceNavigate={onReplaceNavigate}
            onLiveNavigate={onLiveNavigate}
            containerClassName="min-w-0 w-full"
            compact
            liveResultsMode
            liveSearchClearView={liveSearchClearView}
          />
        </div>

        <div
          ref={desktopNavRef}
          className={forceMobileNav ? "hidden" : "ml-auto hidden flex-shrink-0 items-center gap-2 lg:ml-0 lg:flex"}
        >
          <nav className="flex items-center gap-0.5">
            {model.primaryNavItems.map((item) => (
              <DesktopNavItem
                key={item.id}
                item={item}
                align="left"
                isOpen={openMenuId === item.id}
                onOpenChange={setOpenMenuId}
                className={DESKTOP_NAV_LINK_CLASS}
              />
            ))}
          </nav>

          {aboutItem && (
            <DesktopNavItem
              item={aboutItem}
              align="right"
              isOpen={openMenuId === aboutItem.id}
              onOpenChange={setOpenMenuId}
              className={DESKTOP_NAV_LINK_CLASS}
            />
          )}

          <div className="theme-divider mx-2 h-6 w-px" />

          <AppearanceControls iconSize={CHROME_ICON_SIZE} />
        </div>

        <div className={forceMobileNav ? "ml-auto flex flex-shrink-0 items-center gap-2" : "ml-auto flex flex-shrink-0 items-center gap-2 lg:hidden"}>
          <AppearanceControls iconSize={CHROME_ICON_SIZE} alignOffset={-52} sideOffset={20} />
          <div className="relative">
            <Button
              ref={menuButtonRef}
              variant="quiet"
              size="icon"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              data-open={isMenuOpen}
              className="theme-header-icon-button h-11 w-11 rounded-xl [&_svg]:size-5"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
            >
              <span aria-hidden="true" className="relative h-5 w-5">
                <Icon
                  icon="lucide:menu"
                  size={CHROME_ICON_SIZE}
                  className={`absolute inset-0 ${MENU_GLYPH_TRANSITION_CLASS} ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
                />
                <Icon
                  icon="lucide:x"
                  size={CHROME_ICON_SIZE}
                  className={`absolute inset-0 ${MENU_GLYPH_TRANSITION_CLASS} ${isMenuOpen ? "opacity-100" : "opacity-0"}`}
                />
              </span>
              <span className="sr-only">{t("Toggle navigation")}</span>
            </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className={`${NAV_PANEL_CLASS} right-0 w-64 origin-top-right`}
            >
              <nav className="flex flex-col gap-0.5">
                {model.primaryNavItems.map((item) => (
                  <MobileNavItem
                    key={item.id}
                    item={item}
                    iconSize={CHROME_ICON_SIZE}
                    showActiveIndicator
                    isExpanded={expandedMobileIds.includes(item.id)}
                    onToggle={toggleMobileGroup}
                    onNavigate={() => setIsMenuOpen(false)}
                    className={MOBILE_NAV_LINK_CLASS}
                  />
                ))}
              </nav>

              <div className="theme-gradient-divider my-2 h-px" />

              {aboutItem && (
                <MobileNavItem
                  item={aboutItem}
                  iconSize={CHROME_ICON_SIZE}
                  isExpanded={expandedMobileIds.includes(aboutItem.id)}
                  onToggle={toggleMobileGroup}
                  onNavigate={() => setIsMenuOpen(false)}
                  className={MOBILE_NAV_LINK_CLASS}
                />
              )}
            </div>
          )}
          </div>

        </div>
      </div>
    </header>
  );
}
