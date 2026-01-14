import { Buffer } from "node:buffer";
import { z } from "zod";

const articleSchema = z.object({
  id: z.number().nullable(),
  title: z.string(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  index_categories: z.array(z.string()),
  identification: z.record(z.string(), z.unknown()),
  classification: z.record(z.string(), z.unknown()),
  summary: z.string(),
  dosage: z.record(z.string(), z.unknown()),
  duration: z.record(z.string(), z.unknown()),
  subjective_effects: z.record(z.string(), z.unknown()),
  comparisons: z.array(z.unknown()),
  pharmacology: z.record(z.string(), z.unknown()),
  interactions: z.record(z.string(), z.unknown()),
  reagent_testing: z.record(z.string(), z.unknown()),
  tolerance: z.record(z.string(), z.unknown()),
  harm_potential: z.record(z.string(), z.unknown()),
  legality: z.record(z.string(), z.unknown()),
  citations: z.array(z.unknown()),
}).passthrough();

const articlesSchema = z.array(articleSchema);

export const getPayloadByteLength = (rawBody) => {
  if (rawBody == null) {
    return 0;
  }
  if (typeof rawBody === "string") {
    return Buffer.byteLength(rawBody, "utf8");
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(rawBody), "utf8");
  } catch {
    return 0;
  }
};

export const validateArticlesPayload = (articlesData) => {
  return articlesSchema.safeParse(articlesData);
};
