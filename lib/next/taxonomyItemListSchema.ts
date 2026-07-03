import { buildItemListSchema } from "@/utils/seo/structuredData";
import type {
  CategoryDetail,
  CategoryDetailGroup,
  DosageCategoryGroup,
  DrugListEntry,
  MechanismDetail,
  MechanismQualifierDetail,
} from "@/data/builders/library";
import type { PublicEffectPreview } from "@server/convex/publicData.shared";
import {
  buildSiteUrl,
  getPublicRoutePath,
  type PublicRouteIdentity,
} from "./publicSite";

const ITEM_LIST_LIMIT = 100;

type ItemListSchemaInput = Parameters<typeof buildItemListSchema>[0];
type ItemListSchema = ReturnType<typeof buildItemListSchema>;

function pageUrl(route: PublicRouteIdentity): string {
  return buildSiteUrl(getPublicRoutePath(route));
}

function substanceUrl(slug: string): string {
  return buildSiteUrl(getPublicRoutePath({ family: "substance", params: { slug } }));
}

function effectUrl(effectSlug: string): string {
  return buildSiteUrl(getPublicRoutePath({ family: "effect", params: { effectSlug } }));
}

function uniqueDrugItems(groups: Array<CategoryDetailGroup | DosageCategoryGroup>): ItemListSchemaInput["items"] {
  const seen = new Set<string>();
  const items: ItemListSchemaInput["items"] = [];

  for (const group of groups) {
    for (const drug of group.drugs) {
      if (seen.has(drug.slug)) {
        continue;
      }

      seen.add(drug.slug);
      items.push(drugToItem(drug));

      if (items.length >= ITEM_LIST_LIMIT) {
        return items;
      }
    }
  }

  return items;
}

function drugToItem(drug: DrugListEntry): ItemListSchemaInput["items"][number] {
  return {
    name: drug.name,
    url: substanceUrl(drug.slug),
  };
}

export function buildCategoryItemListSchema(
  detail: CategoryDetail,
  route: PublicRouteIdentity,
): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(route),
    name: `dose.wiki ${detail.definition.name} substances`,
    description: `Browse ${detail.total} substances grouped under ${detail.definition.name}.`,
    items: uniqueDrugItems(detail.groups),
  });
}

export function buildMechanismItemListSchema(
  detail: MechanismDetail,
  route: PublicRouteIdentity,
): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(route),
    name: `dose.wiki ${detail.definition.name} substances`,
    description: `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.`,
    items: uniqueDrugItems(detail.qualifiers.flatMap((qualifier) => qualifier.groups)),
  });
}

export function buildMechanismQualifierItemListSchema(
  mechanism: MechanismDetail,
  qualifier: MechanismQualifierDetail,
  route: PublicRouteIdentity,
): ItemListSchema {
  const qualifierLabel = qualifier.label || "general";

  return buildItemListSchema({
    url: pageUrl(route),
    name: `dose.wiki ${mechanism.definition.name} ${qualifierLabel} substances`,
    description: `Browse ${qualifier.total} substances in the ${qualifierLabel} ${mechanism.definition.name} qualifier.`,
    items: uniqueDrugItems(qualifier.groups),
  });
}

export function buildEffectCategoryItemListSchema(input: {
  categoryName: string;
  categorySlug: string;
  description: string;
  effects: PublicEffectPreview[];
  route: PublicRouteIdentity;
}): ItemListSchema {
  return buildItemListSchema({
    url: pageUrl(input.route),
    name: `dose.wiki ${input.categoryName}`,
    description: input.description,
    items: input.effects.slice(0, ITEM_LIST_LIMIT).map((effect) => ({
      name: effect.name,
      url: effectUrl(effect.slug),
    })),
  });
}
