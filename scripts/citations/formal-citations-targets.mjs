import { buildCitationPlacementTargets } from "../../lib/citations/citationPlacement.mjs";

export function buildFormalCitationTargets({ article, sectionKey }) {
  return buildCitationPlacementTargets({ article, sectionKey });
}
