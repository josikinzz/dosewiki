import { buildItemListSchema } from "@/utils/seo/structuredData";
import type {
  CategoryDetail,
  CategoryDetailGroup,
  DosageCategoryGroup,
  DrugListEntry,
  MechanismDetail,
  MechanismQualifierDetail,
} from "@/data/builders/library";
import type { PublicEffectPreview } from "@server/data/publicData.shared";
import {
  buildSiteUrl,
  getPublicRoutePath,
  PUBLIC_SITE,
  type PublicRouteIdentity,
  type PublicSiteIdentity,
} from "./publicSite";

const ITEM_LIST_LIMIT = 100;

type ItemListSchemaInput = Parameters<typeof buildItemListSchema>[0];
type ItemListSchema = ReturnType<typeof buildItemListSchema>;

function pageUrl(route: PublicRouteIdentity, site: PublicSiteIdentity): string {
  return buildSiteUrl(getPublicRoutePath(route), site);
}

function substanceUrl(slug: string, site: PublicSiteIdentity): string {
  return buildSiteUrl(getPublicRoutePath({ family: "substance", params: { slug } }), site);
}

function effectUrl(effectSlug: string, site: PublicSiteIdentity): string {
  return buildSiteUrl(getPublicRoutePath({ family: "effect", params: { effectSlug } }), site);
}

function uniqueDrugItems(
  groups: Array<CategoryDetailGroup | DosageCategoryGroup>,
  site: PublicSiteIdentity,
): ItemListSchemaInput["items"] {
  const seen = new Set<string>();
  const items: ItemListSchemaInput["items"] = [];

  for (const group of groups) {
    for (const drug of group.drugs) {
      if (seen.has(drug.slug)) {
        continue;
      }

      seen.add(drug.slug);
      items.push(drugToItem(drug, site));

      if (items.length >= ITEM_LIST_LIMIT) {
        return items;
      }
    }
  }

  return items;
}

function drugToItem(drug: DrugListEntry, site: PublicSiteIdentity): ItemListSchemaInput["items"][number] {
  return {
    name: drug.name,
    url: substanceUrl(drug.slug, site),
  };
}

export function buildCategoryItemListSchema(
  detail: CategoryDetail,
  route: PublicRouteIdentity,
  site: PublicSiteIdentity = PUBLIC_SITE,
): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(route, site),
    name: `${site.name} ${detail.definition.name} substances`,
    description: `Browse ${detail.total} substances grouped under ${detail.definition.name}.`,
    items: uniqueDrugItems(detail.groups, site),
  });
}

export function buildMechanismItemListSchema(
  detail: MechanismDetail,
  route: PublicRouteIdentity,
  site: PublicSiteIdentity = PUBLIC_SITE,
): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(route, site),
    name: `${site.name} ${detail.definition.name} substances`,
    description: `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.`,
    items: uniqueDrugItems(detail.qualifiers.flatMap((qualifier) => qualifier.groups), site),
  });
}

export function buildMechanismQualifierItemListSchema(
  mechanism: MechanismDetail,
  qualifier: MechanismQualifierDetail,
  route: PublicRouteIdentity,
  site: PublicSiteIdentity = PUBLIC_SITE,
): ItemListSchema {
  const qualifierLabel = qualifier.label || "general";

  return buildItemListSchema({
    url: pageUrl(route, site),
    name: `${site.name} ${mechanism.definition.name} ${qualifierLabel} substances`,
    description: `Browse ${qualifier.total} substances in the ${qualifierLabel} ${mechanism.definition.name} qualifier.`,
    items: uniqueDrugItems(qualifier.groups, site),
  });
}

export function buildEffectCategoryItemListSchema(input: {
  categoryName: string;
  categorySlug: string;
  description: string;
  effects: PublicEffectPreview[];
  route: PublicRouteIdentity;
}, site: PublicSiteIdentity = PUBLIC_SITE): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(input.route, site),
    name: `${site.name} ${input.categoryName}`,
    description: input.description,
    items: input.effects.slice(0, ITEM_LIST_LIMIT).map((effect) => ({
      name: effect.name,
      url: effectUrl(effect.slug, site),
    })),
  });
}
