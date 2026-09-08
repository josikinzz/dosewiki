import { z } from "zod";
import { prepareVCode } from "../vcode/editing";

const text = z.string().max(400_000);
const label = z.string().trim().max(500);
const link = z.string().max(2_000).refine(value => /^(https?:\/\/|\/(?!\/))/.test(value), "Use an https/http URL or a site-relative path.");
export const effectEditorSchema = z.object({
  name: z.string().trim().min(1).max(200), summary: text,
  description_raw: text, long_summary_raw: text.optional(), analysis_raw: text.optional(),
  style_variations_raw: text.optional(), personal_commentary_raw: text.optional(),
  tags: z.array(label).max(100), contributors: z.array(label).max(100).optional(),
  featured: z.boolean().optional(), social_media_image: z.union([link, z.literal("")]).optional(),
  see_also: z.array(z.object({ location: link, title: label })).max(100).optional(),
  external_links: z.array(z.object({ url: link, title: label })).max(100).optional(),
  citations: z.array(z.object({ url: link, text, from: label.optional() })).max(500).optional(),
  subarticles: z.array(z.object({ id: z.string().min(1).max(200), title: label })).max(100).optional(),
}).strict();
export type EffectDraft = z.infer<typeof effectEditorSchema>;
export const EFFECT_NARRATIVES = ["description", "long_summary", "analysis", "style_variations", "personal_commentary"] as const;
type EffectEditableRow = EffectDraft & Partial<Record<`${typeof EFFECT_NARRATIVES[number]}_ast`, unknown>>;
export function effectDraftFromRow(row: EffectEditableRow): EffectDraft {
  return Object.fromEntries(Object.keys(effectEditorSchema.shape).flatMap(key => {
    const value = row[key as keyof EffectDraft];
    return value === undefined ? [] : [[key, value]];
  })) as EffectDraft;
}
export function prepareEffectDraft(input: unknown, previous: EffectEditableRow): Partial<EffectEditableRow> {
  const draft = effectEditorSchema.parse(input);
  const updates: Partial<EffectEditableRow> = { ...draft };
  for (const field of EFFECT_NARRATIVES) {
    const raw = draft[`${field}_raw`];
    if (raw !== undefined) updates[`${field}_ast`] = prepareVCode(raw, { raw: previous[`${field}_raw`], ast: previous[`${field}_ast`] });
  }
  return updates;
}
