import { v } from "../lib/postgres/runtime/values";

export const protestKitReagentColorValidator = v.object({
  id: v.number(),
  name: v.string(),
  simple: v.boolean(),
  simpleColorId: v.number(),
});

export const protestKitReagentResultValidator = v.object({
  reagent: v.string(),
  colors: v.array(protestKitReagentColorValidator),
  hint: v.string(),
  isReacting: v.boolean(),
});

export const protestKitResponseValidator = v.object({
  substance: v.object({
    name: v.string(),
    aliases: v.array(v.string()),
  }),
  reagents: v.array(protestKitReagentResultValidator),
});

export const reagentTestImportEntryValidator = v.object({
  slug: v.string(),
  data: v.union(protestKitResponseValidator, v.null()),
});

export const reagentTestDocumentValidator = v.object({
  slug: v.string(),
  data: v.union(protestKitResponseValidator, v.null()),
  source: v.literal("protestkit"),
  snapshotHash: v.string(),
  importedAt: v.number(),
});
