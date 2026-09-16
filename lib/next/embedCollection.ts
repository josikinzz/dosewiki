import "server-only";

import { getEffectShowcaseWorks, getSubstanceShowcaseWorks } from "@/app/_components/public-routes/showcaseCollections";
import { buildEmbedCollection } from "@/features/replications/embed/embedModel";
import type { EmbedSelection } from "@/features/replications/embed/embedModel";

export async function getEmbedCollection(selection: EmbedSelection, sourcePath: string) {
  const groups: Parameters<typeof buildEmbedCollection>[1] = [];
  // Two collection reads share the existing four-connection pool.
  for (let offset = 0; offset < selection.slugs.length; offset += 2) {
    const resolved = await Promise.all(selection.slugs.slice(offset, offset + 2).map(async (slug) => {
      if (selection.kind === "substance") {
        const result = await getSubstanceShowcaseWorks(slug);
        if (!result) throw new Error("Unknown substance collection");
        return { slug, label: result.collectionLabel, works: result.works };
      }
      const result = await getEffectShowcaseWorks(slug);
      return result ? { slug, label: result.effectName ?? slug, works: result.works } : null;
    }));
    groups.push(...resolved.filter((group) => group !== null));
  }
  if (groups.length === 0) throw new Error("No requested collection resolved");
  return buildEmbedCollection(selection, groups, sourcePath);
}
