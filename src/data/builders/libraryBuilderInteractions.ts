import { slugify } from "../../utils/slug";
import { INTERACTION_CLASSES, type InteractionClassDefinition } from "../config/interactionClasses";
import type {
  InteractionIndex,
} from "./library";
import type { SubstanceRecord } from "./contentBuilder";
import type {
  InteractionMatchType,
  InteractionTarget,
} from "../../types/content";

interface InteractionClassMatcher {
  definition: InteractionClassDefinition;
  slugs: Set<string>;
}

interface SubstanceMatchEntry {
  type: Extract<InteractionMatchType, "substance" | "alias">;
  slug: string;
  name: string;
}

function generateSlugVariants(value: string): string[] {
  const variants = new Set<string>();
  const base = slugify(value);
  if (!base) {
    return [];
  }

  variants.add(base);

  if (base.includes("-")) {
    variants.add(base.replace(/-/g, ""));
  }

  if (base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  }

  const collapsed = base.replace(/-/g, "");
  if (collapsed.endsWith("s")) {
    variants.add(collapsed.slice(0, -1));
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
}

function createSubstanceMatchLookup(records: SubstanceRecord[]): Map<string, SubstanceMatchEntry> {
  const lookup = new Map<string, SubstanceMatchEntry>();

  const register = (
    record: SubstanceRecord,
    value: string | undefined,
    type: SubstanceMatchEntry["type"],
  ) => {
    if (!value) {
      return;
    }

    generateSlugVariants(value).forEach((variant) => {
      if (lookup.has(variant)) {
        return;
      }

      lookup.set(variant, {
        type,
        slug: record.slug,
        name: record.name,
      });
    });
  };

  records.forEach((record) => {
    register(record, record.slug, "substance");
    register(record, record.name, "substance");
    (record.aliases ?? []).forEach((alias) => register(record, alias, "alias"));
  });

  return lookup;
}

function createClassMatchers(definitions: InteractionClassDefinition[]): InteractionClassMatcher[] {
  return definitions.map((definition) => {
    const slugs = new Set<string>();
    const register = (value: string | undefined) => {
      if (!value) {
        return;
      }

      generateSlugVariants(value).forEach((variant) => {
        if (variant.length > 0) {
          slugs.add(variant);
        }
      });
    };

    register(definition.label);
    definition.matchers.forEach((matcher) => register(matcher));

    return { definition, slugs };
  });
}

function resolveInteractionTarget(
  target: InteractionTarget,
  substanceLookup: Map<string, SubstanceMatchEntry>,
  classMatchers: InteractionClassMatcher[],
) {
  const variants = new Set<string>(generateSlugVariants(target.slug));
  variants.add(target.slug);

  for (const variant of variants) {
    const substanceMatch = variant ? substanceLookup.get(variant) : undefined;
    if (substanceMatch) {
      target.matchType = substanceMatch.type;
      target.matchedSubstanceSlug = substanceMatch.slug;
      target.matchedSubstanceName = substanceMatch.name;
      return;
    }
  }

  for (const variant of variants) {
    if (!variant) {
      continue;
    }

    const classMatch = classMatchers.find((matcher) => matcher.slugs.has(variant));
    if (classMatch) {
      target.matchType = "class";
      target.classKey = classMatch.definition.key;
      target.classLabel = classMatch.definition.label;
      return;
    }
  }

  target.matchType = "unknown";
}

function selectDisplayLabel(target: InteractionTarget): string {
  if (target.matchType === "substance" || target.matchType === "alias") {
    return target.matchedSubstanceName ?? target.display;
  }

  if (target.matchType === "class") {
    return target.classLabel ?? target.display;
  }

  return target.display;
}

export function buildInteractionIndex(records: SubstanceRecord[]): InteractionIndex {
  const index: InteractionIndex = new Map();
  const substanceLookup = createSubstanceMatchLookup(records);
  const classMatchers = createClassMatchers(INTERACTION_CLASSES);

  records.forEach((record) => {
    record.content.interactions.forEach((group) => {
      group.items.forEach((target) => {
        resolveInteractionTarget(target, substanceLookup, classMatchers);

        const key = target.slug;
        if (!index.has(key)) {
          index.set(key, {
            slug: key,
            display: selectDisplayLabel(target),
            matchType: target.matchType,
            matchedSubstanceSlug: target.matchedSubstanceSlug,
            matchedSubstanceName: target.matchedSubstanceName,
            classKey: target.classKey,
            classLabel: target.classLabel,
            references: [],
          });
        }

        const entry = index.get(key);
        if (!entry) {
          return;
        }

        if (entry.matchType === "unknown" && target.matchType !== "unknown") {
          entry.matchType = target.matchType;
        }

        if (!entry.matchedSubstanceSlug && target.matchedSubstanceSlug) {
          entry.matchedSubstanceSlug = target.matchedSubstanceSlug;
          entry.matchedSubstanceName = target.matchedSubstanceName;
        }

        if (!entry.classKey && target.classKey) {
          entry.classKey = target.classKey;
          entry.classLabel = target.classLabel;
        }

        entry.display = selectDisplayLabel(target);
        entry.references.push({
          sourceSlug: record.slug,
          sourceName: record.name,
          severity: group.severity,
          target,
        });
      });
    });
  });

  return index;
}
