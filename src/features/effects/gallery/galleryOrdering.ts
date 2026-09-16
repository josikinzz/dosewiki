import { curatedEffectPosition } from "@/types/replications";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { replicationMediaRank } from "@/features/replications/mediaRank";

const WORK_DATE_TOKEN = /\d{4}(?:-\d{2}){0,2}/;

export function workDateMs(
  row: Pick<PublicGalleryReplicationPreview, "date_info">,
): number | null {
  const info = row.date_info;
  if (!info || info.kind === "unknown" || !info.value) return null;
  const token = WORK_DATE_TOKEN.exec(info.value)?.[0];
  if (!token) return null;
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function mediaTier(
  row: Pick<PublicGalleryReplicationPreview, "type" | "format">,
): number {
  if (row.type === "video") return 0;
  return row.format?.toLowerCase() === "gif" ? 2 : 1;
}

export function sortWithinGroup<
  T extends Pick<
    PublicGalleryReplicationPreview,
    | "slug"
    | "title"
    | "type"
    | "format"
    | "created_at"
    | "date_info"
    | "effect_slug"
    | "effect_order_index"
  > & { has_audio?: boolean | null },
>(items: readonly T[], effectSlug?: string): T[] {
  return [...items].sort((a, b) => {
    const arank = replicationMediaRank(a);
    const brank = replicationMediaRank(b);
    if (arank !== brank) return arank - brank;

    const ao = curatedEffectPosition(a, effectSlug) ?? Number.POSITIVE_INFINITY;
    const bo = curatedEffectPosition(b, effectSlug) ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;

    const atier = mediaTier(a);
    const btier = mediaTier(b);
    if (atier !== btier) return atier - btier;

    const at = workDateMs(a);
    const bt = workDateMs(b);
    if (at !== null && bt !== null && at !== bt) return bt - at;
    if ((at === null) !== (bt === null)) return at === null ? 1 : -1;
    if (at === null && bt === null) {
      const ac = Date.parse(a.created_at ?? "");
      const bc = Date.parse(b.created_at ?? "");
      if (Number.isFinite(ac) && Number.isFinite(bc) && ac !== bc)
        return bc - ac;
    }

    const titleOrder = a.title.localeCompare(b.title);
    return titleOrder || a.slug.localeCompare(b.slug);
  });
}

export function sortWorksByDate<
  T extends Pick<
    PublicGalleryReplicationPreview,
    "slug" | "title" | "created_at" | "date_info"
  >,
>(items: readonly T[], direction: "newest" | "oldest" = "newest"): T[] {
  const sign = direction === "oldest" ? -1 : 1;
  return [...items].sort((a, b) => {
    const at = workDateMs(a);
    const bt = workDateMs(b);
    if (at !== null && bt !== null && at !== bt) return (bt - at) * sign;
    if ((at === null) !== (bt === null)) return at === null ? 1 : -1;

    const ac = Date.parse(a.created_at ?? "");
    const bc = Date.parse(b.created_at ?? "");
    if (Number.isFinite(ac) && Number.isFinite(bc) && ac !== bc)
      return (bc - ac) * sign;

    const titleOrder = a.title.localeCompare(b.title);
    return titleOrder || a.slug.localeCompare(b.slug);
  });
}

