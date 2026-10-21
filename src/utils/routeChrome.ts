import { glossaryLanguage } from "@/features/language-glossary/languageGlossary";
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig, type SiteNavId } from "@/config/siteFlavor";
import { formatMessage, msg, type Translate } from "@/i18n/messages";
import type {
  AppView,
  RouteChromeModel,
  RouteChromeNavChild,
  RouteChromeNavGroup,
  RouteChromeNavItem,
} from "@/types/navigation";
import { parsePath, viewToPath } from "./routing";
import { slugify } from "./slug";

const IDENTITY_TRANSLATE: Translate = (text, values) => formatMessage(text, values);

const DEFAULT_VIEW: AppView = { type: "home" };
const DEFAULT_SUBSTANCE_SLUG = "lsd";
const HOME_VIEW: AppView = { type: "home" };
const SUBSTANCES_VIEW: AppView = { type: "substances" };
const EFFECTS_VIEW: AppView = { type: "effects" };
const REPLICATIONS_VIEW: AppView = { type: "replications" };
const REPORTS_VIEW: AppView = { type: "reports" };
const ABOUT_VIEW: AppView = { type: "about" };

function routeLabel(value: string): string {
  return value.replace(/-/g, " ");
}

export function getRouteChromePageTitle(
  t: Translate,
  view: AppView,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): string {
  switch (view.type) {
    case "glossary":
      return view.directory ? t("Language glossaries") : view.locale ? `${glossaryLanguage(view.locale)?.name ?? view.locale} ${t("glossary")}` : t("Glossary");
    case "home":
      return t(config.homeTitle);
    case "substances":
      return t("Substance Index");
    case "substance":
      return t("{{name}} - Substance Profile", { name: routeLabel(view.slug) });
    case "category":
      return t("{{name}} Category", { name: view.categoryKey });
    case "mantras":
      return t("Mantra Vision Mandala");
    case "effects":
      return t("Subjective Effects Index");
    case "effect":
      return t("{{name}} - Subjective Effect", { name: routeLabel(view.effectSlug) });
    case "effect-category":
      return t("{{name}} Effects", { name: routeLabel(view.categorySlug) });
    case "replications":
      return t("Replications");
    case "mechanism":
      return t("{{name}} Mechanism", { name: routeLabel(view.mechanismSlug) });
    case "classification":
      return view.classification === "chemical"
        ? t("{{name}} Chemical Class", { name: routeLabel(view.slug) })
        : t("{{name}} Psychoactive Class", { name: routeLabel(view.slug) });
    case "search":
      return t('Search Results for "{{query}}"', { query: view.query });
    case "about":
      return t(config.aboutTitle);
    case "contributor":
      return t("Contributor Profile");
    case "reports":
      return t("Experience Reports");
    case "report-submit":
      return t("Submit a Trip Report");
    case "report":
      return t("Trip Report");
    case "dev":
      return t("Developer Tools - {{tab}}", { tab: view.tab });
    default:
      return t(config.homeTitle);
  }
}

function getRouteChromeActiveGroup(view: AppView): RouteChromeNavGroup {
  switch (view.type) {
    case "substances":
    case "substance":
    case "category":
    case "mechanism":
    case "classification":
      return "substances";
    case "effects":
    case "effect":
    case "effect-category":
      return "effects";
    case "replications":
      return "replications";
    case "reports":
    case "report-submit":
    case "report":
      return "reports";
    case "about":
      return "about";
    case "dev":
      return "dev";
    default:
      return "none";
  }
}

const NAV_ITEM_DEFINITIONS: Record<SiteNavId, Omit<RouteChromeNavItem, "active">> = {
  substances: {
    id: "substances",
    label: msg("Substances"),
    href: viewToPath(SUBSTANCES_VIEW),
    view: SUBSTANCES_VIEW,
    group: "substances",
    icon: "substances",
  },
  effects: {
    id: "effects",
    label: msg("Effects"),
    href: viewToPath(EFFECTS_VIEW),
    view: EFFECTS_VIEW,
    group: "effects",
    icon: "effects",
  },
  replications: {
    id: "replications",
    label: msg("Replications"),
    href: viewToPath(REPLICATIONS_VIEW),
    view: REPLICATIONS_VIEW,
    group: "replications",
    icon: "replications",
  },
  reports: {
    id: "reports",
    label: msg("Reports"),
    href: viewToPath(REPORTS_VIEW),
    view: REPORTS_VIEW,
    group: "reports",
    icon: "reports",
  },
  about: {
    id: "about",
    label: msg("About"),
    mobileLabel: msg("About"),
    href: viewToPath(ABOUT_VIEW),
    view: ABOUT_VIEW,
    group: "about",
    icon: "about",
  },
};

function navChildId(parentId: SiteNavId, label: string): string {
  return `${parentId}-${slugify(label)}`;
}

function buildSubmenu(
  id: SiteNavId,
  href: string,
  config: SiteFlavorConfig,
): readonly RouteChromeNavChild[] | undefined {
  const children = config.navMenus[id]?.children;

  if (!children || children.length === 0) {
    return undefined;
  }

  const [onlyChild] = children;

  if (children.length === 1 && onlyChild !== undefined && onlyChild.href === href) {
    return undefined;
  }

  return children.map((child) => ({
    id: navChildId(id, child.label),
    label: child.label,
    href: child.href,
    external: child.external === true,
  }));
}

function navItem(
  id: SiteNavId,
  config: SiteFlavorConfig,
  activeGroup: RouteChromeNavGroup,
): RouteChromeNavItem {
  const item = NAV_ITEM_DEFINITIONS[id];
  const menu = config.navMenus[id];
  const submenu = buildSubmenu(id, item.href, config);

  return {
    ...item,
    label: menu?.label ?? item.label,
    mobileLabel: menu?.label ?? item.mobileLabel,
    active: item.group === activeGroup,
    ...(submenu ? { submenu } : {}),
  };
}

function buildNavItems(
  ids: readonly SiteNavId[],
  config: SiteFlavorConfig,
  activeGroup: RouteChromeNavGroup,
): RouteChromeNavItem[] {
  return ids.map((id) => navItem(id, config, activeGroup));
}

export function getRouteChromeModel(
  pathname?: string | null,
  searchQuery?: string | null,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
  t: Translate = IDENTITY_TRANSLATE,
): RouteChromeModel {
  const currentView = parsePath(pathname ?? undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW);
  const resolvedCurrentView =
    currentView.type === "search" && searchQuery != null
      ? ({ type: "search", query: searchQuery } satisfies AppView)
      : currentView;
  const activeGroup = getRouteChromeActiveGroup(resolvedCurrentView);

  return {
    currentView: resolvedCurrentView,
    pageTitle: getRouteChromePageTitle(t, resolvedCurrentView, config),
    activeGroup,
    headerLogo: {
      href: viewToPath(HOME_VIEW),
      view: HOME_VIEW,
    },
    primaryNavItems: buildNavItems(config.primaryNavIds, config, activeGroup),
    secondaryNavItems: buildNavItems(config.secondaryNavIds, config, activeGroup),
    footerNavItems: [],
    footerExternalNavItems: [],
  };
}
