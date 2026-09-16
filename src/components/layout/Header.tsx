import { SmartLink } from "../common/SmartLink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { GlobalSearch } from "../common/GlobalSearch";
import { Icon } from "../common/Icon";
import { SiteWordmark } from "../common/SiteWordmark";
import { SiteVersionBadge } from "../common/SiteVersionBadge";
import { AppearanceControls } from "@/app/_components/AppearanceControls";
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


/**
 * One link inside a nav dropdown or mobile accordion.
 *
 * Children are addressed by href, not by view, so they may be routed subsections,
 * query strings, or other sites; external links open in a new tab and say so to
 * screen readers rather than relying on the icon alone.
 */
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
        // The icon alone does not announce that this leaves the site; the label is repeated
        // first so the accessible name still starts with the visible text.
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
  "theme-header-nav-link theme-focus-ring flex min-h-10 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium";

/**
 * The chevron's own hit target. A real button, sized 36×44 so it clears the 24px minimum on
 * its own rather than borrowing the label's area, tucked against the label with a negative
 * margin so the pair still reads as one nav item.
 */
const DESKTOP_DISCLOSURE_CLASS =
  "theme-header-nav-link theme-focus-ring -ml-1.5 flex h-11 w-9 shrink-0 items-center justify-center rounded-full border border-transparent";

/**
 * A top-level desktop nav item: a plain link when there is no submenu, and a label link plus
 * a separate disclosure chevron when there is.
 *
 * The split is the point. A parent that only opened a panel made its own destination
 * unreachable except through the panel; here the label navigates and the chevron discloses,
 * so `/effects` and its tabs are both one click away. The disclosure state, and every ARIA
 * attribute describing it, belongs to the chevron — the link goes somewhere, it does not
 * expand anything.
 *
 * Click/tap toggles: deliberately not hover-only, which no touch device can use.
 */
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

  // Focus cannot be moved into a panel that has not rendered yet, so opening records the
  // edge it wants and this effect delivers it once the panel is in the DOM.
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
        <Icon icon={navIcon} size={22} className="theme-header-nav-icon shrink-0" />
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

  /**
   * Escape closes the panel. Focus returns to the chevron when it came from inside the panel
   * or from the chevron itself — the control that owns the panel — but a reader who pressed
   * Escape while on the label keeps their place on the label.
   */
  const handleEscape = (
    event: ReactKeyboardEvent<HTMLElement>,
    returnFocus: boolean,
  ): boolean => {
    if (event.key !== "Escape" || !isOpen) {
      return false;
    }
    // Stopped so one Escape does not also dismiss the surrounding mobile sheet.
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
      // Tabbing past the chevron must not leave an orphaned panel hanging over the page.
      onOpenChange(null);
    }
  };

  /**
   * The label is a link, so Enter follows it and the arrows are free: they open the panel and
   * step into it, which keeps the shortcut the single combined control used to offer.
   */
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
        // Let focus leave naturally; the panel just should not be left hanging open.
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
        <Icon icon={navIcon} size={22} className="theme-header-nav-icon shrink-0" />
        <span id={labelId}>{t(item.label)}</span>
      </SmartLink>

      <button
        ref={chevronRef}
        type="button"
        data-active={item.active}
        className={DESKTOP_DISCLOSURE_CLASS}
        aria-haspopup="true"
        aria-expanded={isOpen}
        // Only referenced while the panel exists: a dangling IDREF is an ARIA validity error.
        aria-controls={isOpen ? panelId : undefined}
        // The chevron has no text of its own, and "Effects" is already taken by the link
        // beside it; naming the action keeps the two controls distinguishable in a list of
        // links and buttons. Static on purpose — aria-expanded carries the state.
        aria-label={t("Show {{label}} submenu", { label: t(item.label) })}
        onClick={() => (isOpen ? close(false) : onOpenChange(item.id))}
        onKeyDown={handleChevronKeyDown}
      >
        <Icon
          icon={icons.chevronDown}
          size={14}
          className={`theme-header-nav-icon shrink-0 transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          // Programmatically focusable only: focus lives on the roving menu items, but the
          // container itself must be focusable for the role to be valid.
          tabIndex={-1}
          // Named after the section, not after the chevron that opened it: "Effects" reads
          // better than "Show Effects submenu".
          aria-labelledby={labelId}
          onKeyDown={handlePanelKeyDown}
          // theme-mobile-nav-panel is what paints a panel as part of the dark Effect Index
          // chrome rather than as a light popover; it is the header's panel surface, not a
          // mobile-only class.
          className={`theme-overlay-surface theme-mobile-nav-panel theme-overlay-enter absolute top-[calc(100%+0.5rem)] z-50 flex w-56 flex-col gap-0.5 rounded-2xl border p-2 shadow-[var(--theme-elevation-xl)] ring-1 ring-dose-divider backdrop-blur-sm ${
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
  "theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex min-h-10 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium";

/** The mobile chevron's hit target: a full 44×44 square at the right edge of the row. */
const MOBILE_DISCLOSURE_CLASS =
  "theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent";

/**
 * A top-level item in the mobile sheet, split the same way as the desktop bar: the label
 * navigates, the chevron expands the group beneath it.
 *
 * The original site made touch parents pure expanders, but that leaves a top-level
 * destination reachable only by opening a menu. Two controls in the row keep both.
 */
function MobileNavItem({
  item,
  className,
  iconSize,
  isExpanded,
  onToggle,
  onNavigate,
  // The utility row (About) never carried the active dot the section rows have.
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
          // An accordion, not a popup: the group opens in place, so aria-expanded and
          // aria-controls describe it and aria-haspopup would be a false promise.
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? submenuId : undefined}
          aria-label={t("Show {{label}} submenu", { label })}
          onClick={() => onToggle(item.id)}
        >
          <Icon
            icon={icons.chevronDown}
            size={16}
            className={`theme-header-nav-icon shrink-0 transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isExpanded && (
        <div
          id={submenuId}
          className="ml-6 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-dose-divider pl-2"
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
  // At most one desktop dropdown is open at a time; the mobile sheet allows several groups
  // expanded at once, as the original's pullout did.
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

  // `theme-chrome-dark` pins the dark palette on this subtree, so the banner
  // stays dark chrome over a light page in every theme — the Effect Index
  // treatment, generalised. Nothing in the header portals out, so the one class
  // covers the nav panels, the mobile sheet and the search field.
  return (
    <header className="app-header theme-chrome-dark theme-header-surface backdrop-blur-sm backdrop-safe">
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
          <span className="relative inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <DoseWikiLogo
              width={40}
              height={40}
              className="safari-svg-gpu h-10 w-10"
              draggable={false}
            />
            <SiteVersionBadge variant="logoOverlay" />
          </span>
          {/* From xl the brand text is a two-row column beside the logo: wordmark on
              top, compact version pill underneath. Tight leading and a 9px pill keep
              the column inside the button's height so the header never grows. */}
          <span className="hidden flex-col items-start justify-center gap-[3px] xl:flex">
            <span className="theme-text-primary inline-flex items-center text-2xl font-display font-bold leading-none tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04]">
              <SiteWordmark />
            </span>
            <SiteVersionBadge variant="header" />
          </span>
          </SmartLink>
        </Button>

        <div
          className={
            forceMobileNav
              ? "flex min-h-[44px] min-w-0 flex-1 items-center"
              : "flex min-h-[44px] min-w-0 flex-1 items-center lg:w-full lg:max-w-none"
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
          <nav className="flex items-center gap-1">
            {model.primaryNavItems.map((item) => (
              <DesktopNavItem
                key={item.id}
                item={item}
                align="left"
                isOpen={openMenuId === item.id}
                onOpenChange={setOpenMenuId}
                className="theme-header-nav-link theme-focus-ring relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium"
              />
            ))}
          </nav>

          {aboutItem && (
            <DesktopNavItem
              item={aboutItem}
              // Last item in the bar: its panel is anchored to the right edge so it cannot
              // run off the viewport.
              align="right"
              isOpen={openMenuId === aboutItem.id}
              onOpenChange={setOpenMenuId}
              className="theme-header-nav-link theme-focus-ring flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium"
            />
          )}

          <div className="theme-divider mx-2 h-6 w-px" />

          {/* Desktop settings is a flat 22px glyph, matching the adjacent navigation
              icons; the divider alone marks the boundary after About. */}
          <AppearanceControls iconSize={22} />
        </div>

        <div className={forceMobileNav ? "ml-auto flex flex-shrink-0 items-center gap-2" : "ml-auto flex flex-shrink-0 items-center gap-2 lg:hidden"}>
          {/* Appearance settings stays left of the mobile menu so the familiar hamburger
              owns the top-right corner. This mount keeps the larger touch-context glyph,
              and lands its panel on the same insets the mobile nav sheet reaches: one
              button + one gap right (the sheet is right-0 inside the hamburger's
              wrapper), and the header's own 16px edge padding below the bar. */}
          <AppearanceControls alignOffset={-52} sideOffset={20} />
          <div className="relative">
            <Button
              ref={menuButtonRef}
              variant="quiet"
              size="icon"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              data-open={isMenuOpen}
              className="theme-header-icon-button h-11 w-11 rounded-xl"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
            >
              <span aria-hidden="true" className="relative h-7 w-7">
                <Icon
                  icon="lucide:menu"
                  size={28}
                  className={`absolute inset-0 !h-7 !w-7 transition-opacity duration-[180ms] ease-out motion-reduce:transition-none ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
                />
                <Icon
                  icon="lucide:x"
                  size={28}
                  className={`absolute inset-0 !h-7 !w-7 transition-opacity duration-[180ms] ease-out motion-reduce:transition-none ${isMenuOpen ? "opacity-100" : "opacity-0"}`}
                />
              </span>
              <span className="sr-only">{t("Toggle navigation")}</span>
            </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="theme-overlay-surface theme-mobile-nav-panel theme-overlay-enter absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-[var(--theme-elevation-xl)] ring-1 ring-dose-divider backdrop-blur-sm"
            >
              <nav className="flex flex-col gap-1">
                {model.primaryNavItems.map((item) => (
                  <MobileNavItem
                    key={item.id}
                    item={item}
                    iconSize={24}
                    showActiveIndicator
                    isExpanded={expandedMobileIds.includes(item.id)}
                    onToggle={toggleMobileGroup}
                    onNavigate={() => setIsMenuOpen(false)}
                    className="theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold"
                  />
                ))}
              </nav>

              <div className="theme-gradient-divider my-2 h-px" />

              {aboutItem && (
                <MobileNavItem
                  item={aboutItem}
                  iconSize={24}
                  isExpanded={expandedMobileIds.includes(aboutItem.id)}
                  onToggle={toggleMobileGroup}
                  onNavigate={() => setIsMenuOpen(false)}
                  className="theme-header-nav-link theme-focus-ring theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold"
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
