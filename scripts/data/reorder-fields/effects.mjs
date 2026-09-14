import {
  ATTRIBUTION_ORDER,
  EFFECT_ENTRY_ORDER,
  EFFECT_SUBCATEGORY_ORDER,
  SENSE_CATEGORY_ORDER,
  SENSORY_EFFECTS_ORDER,
  SUBJECTIVE_EFFECTS_NOTES_ORDER,
  SUBJECTIVE_EFFECTS_ORDER,
} from './orders.mjs';
import { orderObject, reorderOrderedRecord } from './core.mjs';

function reorderEffectEntry(entry, options) { if (!entry) return entry;
return orderObject(entry, EFFECT_ENTRY_ORDER, { ...options, context: 'effect_entry' }); }

function reorderEffectSubcategory(subcategory, options) { if (!subcategory) return subcategory;
const result = { ...subcategory };
if (Array.isArray(result.effects)) {
  result.effects = result.effects.map((entry) => reorderEffectEntry(entry, options));
}
return orderObject(result, EFFECT_SUBCATEGORY_ORDER, { ...options, context: 'effect_subcategory' }); }

function reorderEffectCategory(category, options) { if (!category || typeof category !== 'object' || Array.isArray(category)) return category;
const result = {};
for (const key of Object.keys(category)) {
  result[key] = reorderEffectSubcategory(category[key], options);
}
return result; }

function reorderSenseCategory(senseCategory, options) { if (!senseCategory || Array.isArray(senseCategory)) return senseCategory;
const result = { ...senseCategory };
if (result.subcategories) {
  result.subcategories = reorderEffectCategory(result.subcategories, options);
}
return orderObject(result, SENSE_CATEGORY_ORDER, { ...options, context: 'sense_category' }); }

function reorderSensoryEffects(sensory, options) { if (sensory === null || sensory === undefined || Array.isArray(sensory)) return sensory;
return reorderOrderedRecord(sensory, SENSORY_EFFECTS_ORDER, (entry) => reorderSenseCategory(entry, options)); }

export function reorderSubjectiveEffects(effects, options) {
  if (!effects) return effects;
  const result = { ...effects };

  if (result.notes) {
    result.notes = orderObject(result.notes, SUBJECTIVE_EFFECTS_NOTES_ORDER, {
      ...options,
      context: 'subjective_effects.notes',
    });
  }
  if (result.sensory) {
    result.sensory = reorderSensoryEffects(result.sensory, options);
  }
  if (result.cognitive) {
    result.cognitive = reorderEffectCategory(result.cognitive, options);
  }
  if (result.physical) {
    result.physical = reorderEffectCategory(result.physical, options);
  }
  if (result.progressive_stages) {
    result.progressive_stages = reorderEffectCategory(result.progressive_stages, options);
  }
  if (result.attribution) {
    result.attribution = orderObject(result.attribution, ATTRIBUTION_ORDER, {
      ...options,
      context: 'attribution',
    });
  }

  return orderObject(result, SUBJECTIVE_EFFECTS_ORDER, { ...options, context: 'subjective_effects' });
}
