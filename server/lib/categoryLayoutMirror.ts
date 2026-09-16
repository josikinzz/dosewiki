import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"

type PsychoactiveLayout = Pick<Doc<"indexLayouts">, "version" | "categories">;
type CategoryLayoutData = Omit<Doc<"categoryLayout">, "_id" | "_creationTime">;

/**
 * The public /substances grid renders the `categoryLayout` table (see
 * `lib/data/publicData.reads.ts`), not `indexLayouts`, so every psychoactive
 * layout write is mirrored there inside the same mutation or editor changes
 * never ship. Same projection as `scripts/seed/seed-category-layout.mjs`:
 * `categoryLayout` does not store category/section `notes` or section `link`.
 */
export function projectCategoryLayout(layout: PsychoactiveLayout): CategoryLayoutData {
  return {
    version: layout.version,
    categories: layout.categories.map((category) => ({
      key: category.key,
      label: category.label,
      iconKey: category.iconKey,
      sections: category.sections.map((section) => ({
        key: section.key,
        label: section.label,
        drugs: section.drugs,
      })),
      drugs: category.drugs,
      ...(category.columns !== undefined ? { columns: category.columns } : {}),
    })),
  };
}

export async function writeCategoryLayout(ctx: MutationCtx, data: CategoryLayoutData) {
  const existing = await ctx.db.query("categoryLayout").first();
  if (existing) {
    await ctx.db.replace(existing._id, data);
    return { updated: true, id: existing._id };
  }
  const id = await ctx.db.insert("categoryLayout", data);
  return { updated: false, id };
}

export async function mirrorPsychoactiveLayout(
  ctx: MutationCtx,
  layout: Pick<Doc<"indexLayouts">, "type" | "version" | "categories">,
) {
  if (layout.type !== "psychoactive") return;
  await writeCategoryLayout(ctx, projectCategoryLayout(layout));
}
