import type { ShowcaseWork } from "../components/showcaseWork";
import { viewerItemFromShowcaseWork, type ReplicationViewerCollection } from "../viewer/viewerModel";

export const EMBED_CHANNEL = "dosewiki-replications";
export const EMBED_VERSION = 1;

export function isEmbedSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

export type EmbedSelection = {
  kind: "effect" | "substance";
  slugs: string[];
};

export type EmbedCollection = {
  works: ShowcaseWork[];
  viewer: ReplicationViewerCollection;
};

/** Only opening artwork and collection identity cross the document boundary. */
export type EmbedOpeningCollection = {
  works: ShowcaseWork[];
  totalCount: number;
  label: string;
  sourcePath: string;
  selection: EmbedSelection;
};

/** Preserve each publisher collection's order and associations in the viewer.
 * The compact showcase deduplicates cross-group appearances and, for an
 * aggregated selection, takes one work from each group in turn: a category
 * playlist opens with a spread of its effects rather than the whole of the
 * first one. Each group's own order is preserved within its round. */
export function buildEmbedCollection(
  selection: EmbedSelection,
  groups: { slug: string; label: string; works: ShowcaseWork[] }[],
  sourcePath: string,
): EmbedCollection {
  const seen = new Set<string>();
  const works: ShowcaseWork[] = [];
  const depth = Math.max(0, ...groups.map((group) => group.works.length));
  for (let round = 0; round < depth; round += 1) {
    for (const group of groups) {
      const work = group.works[round];
      if (!work || seen.has(work.slug)) continue;
      seen.add(work.slug);
      works.push(work);
    }
  }
  const multiple = groups.length > 1;
  return {
    works,
    viewer: {
      sourcePath,
      label: multiple ? groups.map((group) => group.label).join(" · ") : groups[0]?.label ?? "Replications",
      kind: multiple ? "gallery" : selection.kind,
      grouping: multiple ? "effect" : "none",
      groups: groups.filter((group) => group.works.length > 0).map((group) => ({
        key: group.slug,
        label: group.label,
        items: group.works.map(viewerItemFromShowcaseWork),
      })),
    },
  };
}

export type EmbedParentMessage =
  | { channel: typeof EMBED_CHANNEL; version: 1; type: "select"; slug: string | null }
  | { channel: typeof EMBED_CHANNEL; version: 1; type: "theme"; theme: "light" | "dark" };

export function isEmbedParentMessage(value: unknown): value is EmbedParentMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.channel !== EMBED_CHANNEL || data.version !== EMBED_VERSION) return false;
  if (data.type === "select") return Object.keys(data).length === 4 && (data.slug === null || isEmbedSlug(data.slug));
  if (data.type === "theme") return Object.keys(data).length === 4 && (data.theme === "light" || data.theme === "dark");
  return false;
}
