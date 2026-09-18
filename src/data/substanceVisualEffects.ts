import { z } from "zod";
import { resolveEffectNameAlias, type EffectLocation } from "./effectNameAliases";
import { slugify } from "../utils/slug";

/** The alias-lookup location of every chip in the article's visual group. */
const VISUAL_EFFECT_LOCATION: EffectLocation = "sensory.visual";
const EFFECT_HREF_PREFIX = "/effects/";
const EFFECT_CATEGORY_HREF_PREFIX = "/effects/category/";

const visualEffectEntry = z.object({ name: z.string() });
const visualEffectNamesSource = z.object({
  sensory: z.object({
    visual: z.object({
      subcategories: z.record(
        z.string(),
        z.object({ effects: z.array(z.unknown()).catch([]) }),
      ),
    }),
  }),
});

/**
 * The visual-effect display names of one substance article, in document order,
 * deduplicated by slugified name. Malformed article data contributes no names.
 */
export function visualEffectNamesOf(subjectiveEffects: unknown): string[] {
  const parsed = visualEffectNamesSource.safeParse(subjectiveEffects);
  if (!parsed.success) return [];

  const names: string[] = [];
  const seen = new Set<string>();
  for (const subcategory of Object.values(parsed.data.sensory.visual.subcategories)) {
    for (const raw of subcategory.effects) {
      const entry = visualEffectEntry.safeParse(raw);
      if (!entry.success) continue;
      const name = entry.data.name.trim();
      const key = slugify(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export type VisualEffectSlugResolution = {
  slugs: string[];
  slugByName: ReadonlyMap<string, string>;
  unlinkableNames: string[];
};

/** Resolve article visual-effect labels exactly as the public effect chips do. */
export function resolveVisualEffectSlugs(
  names: readonly string[],
): VisualEffectSlugResolution {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const slugByName = new Map<string, string>();
  const unlinkableNames: string[] = [];

  for (const name of names) {
    const nameSlug = slugify(name);
    if (!nameSlug) {
      unlinkableNames.push(name);
      continue;
    }
    const alias = resolveEffectNameAlias(nameSlug, VISUAL_EFFECT_LOCATION);
    let slug: string | null;
    if (alias === undefined) {
      slug = nameSlug;
    } else if (alias === null || alias.startsWith(EFFECT_CATEGORY_HREF_PREFIX)) {
      slug = null;
    } else {
      slug = alias.slice(EFFECT_HREF_PREFIX.length);
    }

    if (slug === null) {
      unlinkableNames.push(name);
      continue;
    }
    slugByName.set(name, slug);
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return { slugs, slugByName, unlinkableNames };
}
