import {
  TAG_FIELDS,
  deriveArticleSlug,
  normalizeTagLabel,
  parseId,
  parseTitle,
  readFieldValues,
  toTagKey,
  type TagField,
  type TagRegistry,
  type TagRegistryInput,
  type TagUsage,
} from "./tagRegistry.shared";

export const buildTagRegistry = (articles: TagRegistryInput[]): TagRegistry => {
  const byField: Record<TagField, TagUsage[]> = {
    index_categories: [],
    chemical_class: [],
    psychoactive_class: [],
    mechanism_of_action: [],
  };

  const byKey: Record<TagField, Map<string, TagUsage>> = {
    index_categories: new Map(),
    chemical_class: new Map(),
    psychoactive_class: new Map(),
    mechanism_of_action: new Map(),
  };

  articles.forEach((article, index) => {
    const id = parseId(article.id);
    const title = parseTitle(article.title);

    TAG_FIELDS.forEach((field) => {
      const values = readFieldValues(article, field);
      if (values.length === 0) {
        return;
      }

      const seen = new Set<string>();

      values.forEach((value) => {
        const label = normalizeTagLabel(value);
        if (!label) {
          return;
        }

        const key = toTagKey(label);
        if (!byKey[field].has(key)) {
          byKey[field].set(key, {
            field,
            tag: label,
            key,
            count: 0,
            articleRefs: [],
          });
        }

        const usage = byKey[field].get(key)!;

        if (!seen.has(key)) {
          usage.count += 1;
          const slug = deriveArticleSlug(article);
          usage.articleRefs.push({ index, id, title, slug });
          seen.add(key);
        }

        if (usage.tag !== label && usage.tag.trim().length === 0) {
          usage.tag = label;
        }
      });
    });
  });

  TAG_FIELDS.forEach((field) => {
    byField[field] = Array.from(byKey[field].values()).sort((left, right) =>
      left.tag.localeCompare(right.tag),
    );
  });

  return { byField, byKey };
};

export const getTagUsage = (
  registry: TagRegistry,
  field: TagField,
  keyOrLabel: string,
): TagUsage | undefined => {
  const key = toTagKey(keyOrLabel);
  return registry.byKey[field].get(key);
};

export const buildEmptyRegistry = (): TagRegistry => ({
  byField: {
    index_categories: [],
    chemical_class: [],
    psychoactive_class: [],
    mechanism_of_action: [],
  },
  byKey: {
    index_categories: new Map(),
    chemical_class: new Map(),
    psychoactive_class: new Map(),
    mechanism_of_action: new Map(),
  },
});

export const sortUsagesByCount = (usages: TagUsage[]): TagUsage[] => {
  return [...usages].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.tag.localeCompare(right.tag);
  });
};
