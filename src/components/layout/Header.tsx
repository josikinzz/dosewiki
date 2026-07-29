import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { Icon } from "../common/Icon";
import { SiteWordmark } from "../common/SiteWordmark";
import type {
  AppView,
  RouteChromeModel,
  RouteChromeNavChild,
  RouteChromeNavItem,
} from "../../types/navigation";
import { Button } from "@/components/ui/button";
import { icons } from "@/utils/iconNames";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

/**
 * The fragment of a child href that points at a place in the page the reader is already on,
 * or `null` when it points elsewhere.
 *
 * Fragment children are tab addresses (`/effects#sensory`), and the page reads them from
 * `hashchange`. Next resolves a hash-only navigation inside its own router state — it
 * rewrites the URL with `history.pushState`, which fires no event — so routing such a click
 * would change the URL and nothing else. Handing it to the browser instead performs a real
 * fragment navigation: one history entry, one `hashchange`, page notified.
 */
function sameDocumentFragment(href: string): string | null {
  const hashIndex = href.indexOf("#");

  if (hashIndex < 0) {
    return null;
  }

  const path = href.slice(0, hashIndex);
  const fragment = href.slice(hashIndex + 1);

  if (fragment.length === 0 || (path.length > 0 && path !== window.location.pathname)) {
    return null;
  }

  return fragment;
}

/** A click the browser should be left to handle its own way (new tab, new window, download). */
function isModifiedClick(event: ReactMouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * One link inside a nav dropdown or mobile accordion.
 *
 * Children are addressed by href, not by view, so they may be fragments, query strings or
 * other sites; the external ones get a real `target="_blank"` anchor and say so to screen
 * readers rather than relying on the icon alone.
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
  const body = (
    <>
      <span>{child.label}</span>
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
        aria-label={`${child.label} (opens in a new tab)`}
        onClick={onSelect}
      >
        {body}
      </a>
    );
  }

  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    onSelect();

    if (isModifiedClick(event)) {
      return;
    }

    const fragment = sameDocumentFragment(child.href);

    if (fragment === null) {
      // A different page: let the router navigate, and the page will read the fragment as it
      // mounts.
      return;
    }

    event.preventDefault();

    if (window.location.hash === `#${fragment}`) {
      // Already the fragment in the URL, so there is nothing for the browser to navigate to
      // — but the reader has asked for this tab, and the page may have been moved off it by
      // its own controls since. Announce it rather than letting the click look dead.
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      return;
    }

    window.location.hash = fragment;
  };

  return (
    <Link
      href={child.href}
      role={role}
      tabIndex={tabIndex}
      className={className}
      onClick={handleClick}
    >
      {body}
    </Link>
  );
}

const DESKTOP_SUBMENU_LINK_CLASS =
  "theme-header-nav-link flex min-h-10 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";

/**
 * A top-level desktop nav item: a plain link when the flavor declares no children, a
 * disclosure button plus dropdown when it does.
 *
 * Click/tap toggles — deliberately not hover-only, which no touch device can use. Every
 * parent in the Effect Index tree has a child pointing at its own href (Effects → Index,
 * Trip Reports → Trip Reports), which is what makes turning the parent into a button safe.
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
  const navIcon = resolveRouteChromeIcon(item.icon);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
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
      <Link
        href={item.href}
        scroll={false}
        data-active={item.active}
        className={className}
        aria-current={item.active ? "page" : undefined}
      >
        <Icon icon={navIcon} size={22} className="theme-header-nav-icon shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  }

  const panelId = `header-nav-${item.id}-menu`;
  const buttonId = `header-nav-${item.id}-button`;

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
      buttonRef.current?.focus();
    }
  };

  /** Escape closes and hands focus back to the button, per the menu-button pattern. */
  const handleEscape = (event: ReactKeyboardEvent<HTMLElement>): boolean => {
    if (event.key !== "Escape" || !isOpen) {
      return false;
    }
    // Stopped so one Escape does not also dismiss the surrounding mobile sheet.
    event.stopPropagation();
    close(true);

    return true;
  };

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (handleEscape(event)) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt("last");
    } else if (event.key === "Tab") {
      // Tabbing past the button must not leave an orphaned panel hanging over the page.
      onOpenChange(null);
    }
  };

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (handleEscape(event)) {
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
    <div className="relative">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        data-active={item.active}
        className={className}
        aria-haspopup="true"
        aria-expanded={isOpen}
        // Only referenced while the panel exists: a dangling IDREF is an ARIA validity error.
        aria-controls={isOpen ? panelId : undefined}
        aria-current={item.active ? "true" : undefined}
        onClick={() => (isOpen ? close(false) : onOpenChange(item.id))}
        onKeyDown={handleButtonKeyDown}
      >
        <Icon icon={navIcon} size={22} className="theme-header-nav-icon shrink-0" />
        <span>{item.label}</span>
        <Icon
          icon={icons.chevronDown}
          size={14}
          className={`theme-header-nav-icon shrink-0 transition-transform duration-150 ${
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
          aria-labelledby={buttonId}
          onKeyDown={handlePanelKeyDown}
          // theme-mobile-nav-panel is what paints a panel as part of the dark Effect Index
          // chrome rather than as a light popover; it is the header's panel surface, not a
          // mobile-only class.
          className={`theme-overlay-surface theme-mobile-nav-panel absolute top-[calc(100%+0.5rem)] z-50 flex w-56 flex-col gap-0.5 rounded-2xl border p-2 shadow-xl ring-1 ring-dose-divider backdrop-blur-sm ${
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
  "theme-header-nav-link theme-mobile-nav-link flex min-h-10 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";

/**
 * A top-level item in the mobile sheet. With children it becomes an expander rather than a
 * link, which is how the original site behaved on touch: tapping the parent opened the
 * group instead of navigating away from the menu.
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
  const navIcon = resolveRouteChromeIcon(item.icon);
  const label = item.mobileLabel ?? item.label;
  const submenu = item.submenu;

  if (!submenu) {
    return (
      <Link
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
      </Link>
    );
  }

  const submenuId = `mobile-nav-${item.id}-submenu`;

  return (
    <div>
      <button
        type="button"
        data-active={item.active}
        className={`${className} w-full text-left`}
        aria-expanded={isExpanded}
        aria-controls={isExpanded ? submenuId : undefined}
        aria-current={item.active ? "true" : undefined}
        onClick={() => onToggle(item.id)}
      >
        <Icon icon={navIcon} size={iconSize} className="theme-header-nav-icon shrink-0" />
        <span>{label}</span>
        <Icon
          icon={icons.chevronDown}
          size={16}
          className={`theme-header-nav-icon ml-auto shrink-0 transition-transform duration-150 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

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

const GlobalSearch = dynamic(
  () => import("../common/GlobalSearch").then((mod) => mod.GlobalSearch),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="theme-public-skeleton-surface h-11 w-full rounded-full border"
      />
    ),
  },
);

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

  return (
    <header className="app-header theme-header-surface backdrop-blur-sm backdrop-safe">
      <div
        data-nosnippet
        className={
          forceMobileNav
            ? "mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4"
            : "mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4"
        }
      >
        <Button
          asChild
          variant="ghost"
          className="group/brand flex h-11 w-11 items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:w-auto xl:pl-0 xl:pr-4"
        >
          <Link href={model.headerLogo.href} scroll={false}>
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <DoseWikiLogo
              width={40}
              height={40}
              className="safari-svg-gpu h-10 w-10"
              draggable={false}
            />
          </span>
          <span className="theme-text-primary hidden items-center text-2xl font-display font-bold tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04] xl:inline-flex">
            <SiteWordmark />
          </span>
          </Link>
        </Button>

        <div
          className={
            forceMobileNav
              ? "flex min-h-[44px] min-w-0 flex-1 items-center"
              : "flex min-h-[44px] min-w-0 flex-1 items-center lg:w-full lg:max-w-2xl lg:justify-self-center"
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
                className={`theme-header-nav-link relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                  item.active
                    ? "ring-1 ring-dose-card-border"
                    : ""
                }`}
              />
            ))}
          </nav>

          <div className="theme-divider mx-2 h-6 w-px" />

          {aboutItem && (
            <DesktopNavItem
              item={aboutItem}
              // Last item in the bar: its panel is anchored to the right edge so it cannot
              // run off the viewport.
              align="right"
              isOpen={openMenuId === aboutItem.id}
              onOpenChange={setOpenMenuId}
              className={`theme-header-nav-link flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                aboutItem.active
                  ? "ring-1 ring-dose-card-border"
                  : ""
              }`}
            />
          )}
        </div>

        <div className={forceMobileNav ? "relative ml-auto flex-shrink-0" : "relative ml-auto flex-shrink-0 lg:hidden"}>
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            data-open={isMenuOpen}
            className="theme-icon-button theme-mobile-menu-toggle h-11 w-11 rounded-2xl"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            <Icon
              icon={isMenuOpen ? "lucide:x" : "lucide:menu"}
              size={28}
              className="!h-7 !w-7"
            />
            <span className="sr-only">Toggle navigation</span>
          </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="theme-overlay-surface theme-mobile-nav-panel absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-xl ring-1 ring-dose-divider backdrop-blur-sm"
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
                    className={`theme-header-nav-link theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                      item.active
                        ? "ring-1 ring-dose-card-border"
                        : ""
                    }`}
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
                  className={`theme-header-nav-link theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    aboutItem.active
                      ? "ring-1 ring-dose-card-border"
                      : ""
                  }`}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
