import { z } from "zod";
import {
  projectPublicArticle,
  substanceArticleSchema,
  type PublicArticleProjection,
  type SubstanceArticle,
} from "../../src/schema";

export type PublicSubstanceArticleRecord = PublicArticleProjection<SubstanceArticle> & {
  slug: string;
  priority: NonNullable<SubstanceArticle["priority"]>;
};

const publicSubstanceArticleRecordSchema = substanceArticleSchema.extend({
  slug: z.string().min(1),
});

const REFERENCE_TEMPLATES = new Set([
  "cite_journal",
  "cite_book",
  "cite_web",
  "cite_report",
  "cite_database",
  "unknown",
]);

const SENSORY_KEYS = [
  "visual",
  "auditory",
  "tactile",
  "olfactory",
  "gustatory",
  "multisensory",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key] : "";
}

function emptySenseCategory() {
  return { note: "", subcategories: {} };
}

function normalizeEffectCategory(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeSenseCategory(value: unknown) {
  if (!isRecord(value)) {
    return emptySenseCategory();
  }

  return {
    note: readString(value, "note"),
    subcategories: isRecord(value.subcategories) ? value.subcategories : {},
  };
}

function normalizeSubjectiveEffects(value: unknown) {
  const record = isRecord(value) ? value : {};
  const notes = isRecord(record.notes) ? record.notes : {};
  const sensory = isRecord(record.sensory) ? record.sensory : {};
  const normalized: Record<string, unknown> = {
    notes: {
      overview: readString(notes, "overview"),
      sensory: readString(notes, "sensory"),
      cognitive: readString(notes, "cognitive"),
      physical: readString(notes, "physical"),
    },
    sensory: Object.fromEntries(
      SENSORY_KEYS.map((key) => [key, normalizeSenseCategory(sensory[key])]),
    ),
    cognitive: normalizeEffectCategory(record.cognitive),
    physical: normalizeEffectCategory(record.physical),
  };

  if (record.progressive_stages === null || isRecord(record.progressive_stages)) {
    normalized.progressive_stages = record.progressive_stages;
  }

  if (typeof record.is_stub === "boolean") {
    normalized.is_stub = record.is_stub;
  }

  if (typeof record.source_overview === "string") {
    normalized.source_overview = record.source_overview;
  }

  if (isRecord(record.attribution)) {
    normalized.attribution = {
      author: readString(record.attribution, "author"),
      text: readString(record.attribution, "text"),
      url: readString(record.attribution, "url"),
    };
  }

  return normalized;
}

function normalizeReferences(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((reference) => {
    if (!isRecord(reference)) {
      return reference;
    }

    const { template } = reference;
    if (template === null || template === undefined || REFERENCE_TEMPLATES.has(String(template))) {
      return reference;
    }

    return {
      ...reference,
      template: "unknown",
    };
  });
}

function normalizePublicSubstanceRecord(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  return {
    ...input,
    subjective_effects: normalizeSubjectiveEffects(input.subjective_effects),
    references: normalizeReferences(input.references),
  };
}

export function parsePublicSubstanceRecord(input: unknown): PublicSubstanceArticleRecord | null {
  const parsed = publicSubstanceArticleRecordSchema.safeParse(normalizePublicSubstanceRecord(input));

  if (!parsed.success) {
    return null;
  }

  const publicArticle = projectPublicArticle(parsed.data);
  return {
    ...publicArticle,
    slug: parsed.data.slug,
    priority: parsed.data.priority ?? "normal",
  };
}

export function parsePublicSubstanceRecords(inputs: unknown[]): PublicSubstanceArticleRecord[] {
  return inputs.flatMap((input) => {
    const parsed = parsePublicSubstanceRecord(input);
    return parsed ? [parsed] : [];
  });
}
