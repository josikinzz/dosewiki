/**
 * Manual field metadata overrides.
 * Domain-owned overrides live in `src/data/schema/fieldOverrides/` and are
 * merged here so current consumers keep a stable import path.
 */

import { classificationFieldOverrides } from "./fieldOverrides/classification";
import { citationsFieldOverrides } from "./fieldOverrides/citations";
import { dosageFieldOverrides } from "./fieldOverrides/dosage";
import { durationFieldOverrides } from "./fieldOverrides/duration";
import { harmPotentialFieldOverrides } from "./fieldOverrides/harm-potential";
import { identificationFieldOverrides } from "./fieldOverrides/identification";
import { interactionsFieldOverrides } from "./fieldOverrides/interactions";
import { legalityFieldOverrides } from "./fieldOverrides/legality";
import { metaFieldOverrides } from "./fieldOverrides/meta";
import { pharmacologyFieldOverrides } from "./fieldOverrides/pharmacology";
import {
  mergeFieldOverrideModules,
  type FieldOverride,
} from "./fieldOverrides/shared";
import { subjectiveEffectsFieldOverrides } from "./fieldOverrides/subjective-effects";
import { toleranceFieldOverrides } from "./fieldOverrides/tolerance";

export type { FieldOverride } from "./fieldOverrides/shared";

export const FIELD_OVERRIDES: Record<string, FieldOverride> = mergeFieldOverrideModules([
  { name: "meta", overrides: metaFieldOverrides },
  { name: "identification", overrides: identificationFieldOverrides },
  { name: "classification", overrides: classificationFieldOverrides },
  { name: "citations", overrides: citationsFieldOverrides },
  { name: "dosage", overrides: dosageFieldOverrides },
  { name: "duration", overrides: durationFieldOverrides },
  { name: "subjective-effects", overrides: subjectiveEffectsFieldOverrides },
  { name: "pharmacology", overrides: pharmacologyFieldOverrides },
  { name: "interactions", overrides: interactionsFieldOverrides },
  { name: "tolerance", overrides: toleranceFieldOverrides },
  { name: "harm-potential", overrides: harmPotentialFieldOverrides },
  { name: "legality", overrides: legalityFieldOverrides },
]);
