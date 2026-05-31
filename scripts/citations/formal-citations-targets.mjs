import { normalizeFormalCitationSectionKey } from "./formal-citations-section-config.mjs";

export function buildFormalCitationTargets({ article, sectionKey }) {
  const normalized = normalizeFormalCitationSectionKey(sectionKey);
  if (!normalized) {
    throw new Error(`Unknown formal citation section: ${sectionKey}`);
  }

  switch (normalized) {
    case "pharmacology": {
      const targets = [];
      if (typeof article?.pharmacology?.pharmacodynamics === "string" && article.pharmacology.pharmacodynamics.trim()) {
        targets.push({
          sectionKey: normalized,
          claimKey: "pharmacology:pharmacology.pharmacodynamics",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: article.pharmacology.pharmacodynamics.trim(),
          mergeMode: "inline_text",
        });
      }
      if (typeof article?.pharmacology?.pharmacokinetics === "string" && article.pharmacology.pharmacokinetics.trim()) {
        targets.push({
          sectionKey: normalized,
          claimKey: "pharmacology:pharmacology.pharmacokinetics",
          fieldPath: "pharmacology.pharmacokinetics",
          claimText: article.pharmacology.pharmacokinetics.trim(),
          mergeMode: "inline_text",
        });
      }
      return targets;
    }
    case "harm_potential":
      return typeof article?.harm_potential?.summary === "string" && article.harm_potential.summary.trim()
        ? [{
            sectionKey: normalized,
            claimKey: "harm-potential:harm_potential.summary",
            fieldPath: "harm_potential.summary",
            claimText: article.harm_potential.summary.trim(),
            mergeMode: "inline_text",
          }]
        : [];
    case "history_culture":
      return typeof article?.history_culture?.content === "string" && article.history_culture.content.trim()
        ? [{
            sectionKey: normalized,
            claimKey: "history-culture:history_culture.content",
            fieldPath: "history_culture.content",
            claimText: article.history_culture.content.trim(),
            mergeMode: "inline_text",
          }]
        : [];
    case "legality": {
      const countries = article?.legality?.countries ?? {};
      return Object.entries(countries).flatMap(([country, entry]) => (
        typeof entry?.notes === "string" && entry.notes.trim()
          ? [{
              sectionKey: normalized,
              claimKey: `legality:legality.countries.${country}.notes`,
              fieldPath: `legality.countries.${country}.notes`,
              claimText: entry.notes.trim(),
              mergeMode: "inline_text",
            }]
          : []
      ));
    }
    case "tolerance":
      return Object.entries(article?.tolerance ?? {}).flatMap(([field, value]) => (
        typeof value === "string" && value.trim()
          ? [{
              sectionKey: normalized,
              claimKey: `tolerance:tolerance.${field}`,
              fieldPath: `tolerance.${field}`,
              claimText: value.trim(),
              mergeMode: "inline_text",
            }]
          : []
      ));
    case "dosage_duration": {
      const dosageTargets = (article?.dosage?.routes ?? []).map((route) => ({
        sectionKey: normalized,
        claimKey: `dosage-duration:dosage.routes.${route.route}`,
        fieldPath: `dosage.routes[route=${route.route}]`,
        claimText: JSON.stringify({
          route: route.route,
          dose_ranges: route.dose_ranges ?? {},
          notes: route.notes ?? "",
        }),
        mergeMode: "structured_reference_ids",
        collectionPath: "dosage.routes",
        route: route.route,
      }));
      const durationTargets = (article?.duration?.routes ?? []).map((route) => ({
        sectionKey: normalized,
        claimKey: `dosage-duration:duration.routes.${route.route}`,
        fieldPath: `duration.routes[route=${route.route}]`,
        claimText: JSON.stringify({
          route: route.route,
          stages: route.stages ?? {},
        }),
        mergeMode: "structured_reference_ids",
        collectionPath: "duration.routes",
        route: route.route,
      }));
      return [...dosageTargets, ...durationTargets];
    }
    default:
      return [];
  }
}
