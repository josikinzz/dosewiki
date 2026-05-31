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

export function parsePublicSubstanceRecord(input: unknown): PublicSubstanceArticleRecord | null {
  const parsed = publicSubstanceArticleRecordSchema.safeParse(input);

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
