import type { DosageRoute, DurationRoute } from "@/schema";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { buildGeneratedSectionUpdate } from "@/lib/article/generatedSectionUpdate";

export function applyGeneratedPharmacology(
  generatedYaml: string,
  currentDosageRoutes: DosageRoute[],
  currentDurationRoutes: DurationRoute[],
) {
  const currentArticle = createEmptyArticle();
  currentArticle.dosage.routes = currentDosageRoutes;
  currentArticle.duration.routes = currentDurationRoutes;

  const result = buildGeneratedSectionUpdate(
    currentArticle,
    "pharmacology",
    { kind: "generated_yaml", content: generatedYaml },
    "editor_apply",
  );

  return {
    pharmacology: result.nextArticle.pharmacology,
    dosageRoutes: result.nextArticle.dosage.routes,
    durationRoutes: result.nextArticle.duration.routes,
  };
}
