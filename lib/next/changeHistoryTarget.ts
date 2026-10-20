import { getPublicSubstanceLookupBySlug } from "@server/data/publicData.substances";

export type ChangeHistorySearchParams = Promise<{ article?: string | string[] }>;

export async function resolveChangeHistoryTarget(searchParams: ChangeHistorySearchParams) {
  const { article } = await searchParams;
  const slug = (Array.isArray(article) ? article[0] : article)?.trim().toLowerCase() ?? "";
  if (!slug) return null;
  const substance = await getPublicSubstanceLookupBySlug(slug);
  return substance ? { slug: substance.slug, title: substance.name } : null;
}
