import type { AppView } from "@/types/navigation";

export type DevRouteFilter = {
  param: string;
  values: readonly string[];
  segments?: Readonly<Record<string, string>>;
};

/** Public URL vocabulary only. Tool labels, roles, data needs and implementations stay private. */
export const DEV_ROUTE_FILTERS: Readonly<Record<string, DevRouteFilter>> = {
  "article-feedback": { param: "source", values: ["article", "site"], segments: { "site-feedback": "site" } },
  writing: { param: "kind", values: ["article", "blog"], segments: { blog: "blog" } },
  contributors: { param: "scope", values: ["all", "me"], segments: { profile: "me", profiles: "me" } },
};

export function devHref(view: Extract<AppView, { type: "dev" }>): string {
  const slug = view.slug?.trim();
  const pathname = slug ? `/dev/${view.tab}/${slug}` : `/dev/${view.tab}`;
  const filter = view.filter && Object.prototype.hasOwnProperty.call(DEV_ROUTE_FILTERS, view.tab)
    ? DEV_ROUTE_FILTERS[view.tab] : undefined;
  return filter ? `${pathname}?${filter.param}=${encodeURIComponent(view.filter ?? "")}` : pathname;
}
