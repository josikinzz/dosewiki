import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { getSubstanceShowcaseWorks } from "@/app/_components/public-routes/showcaseCollections";
import type { SubstanceGalleryMatchProvenance } from "@/data/substanceReplicationGallery";
import { getPublicReplicationsForSubstance } from "@server/data/publicData";
import { projectPublicApiReplication } from "./v1";

const collectionCursorSchema = z.object({
  substance_slug: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

type CollectionCursor = z.infer<typeof collectionCursorSchema>;

type PublicAssociation = {
  substance_slug: string;
  basis: SubstanceGalleryMatchProvenance["matchedVia"] | "unknown";
  effect_slug?: string;
  drug_class?: "dissociatives" | "deliriants";
};

/** Publish placement evidence, never the private curation lists or notes. */
function projectAssociation(
  substanceSlug: string,
  provenance: SubstanceGalleryMatchProvenance | undefined,
): PublicAssociation {
  const basis = provenance?.matchedVia;
  if (
    basis !== "specific_drug" && basis !== "drug_class" &&
    basis !== "visual_disconnection" && basis !== "curated"
  ) {
    return { substance_slug: substanceSlug, basis: "unknown" };
  }
  return {
    substance_slug: substanceSlug,
    basis,
    ...(provenance?.effectSlug ? { effect_slug: provenance.effectSlug } : {}),
    ...(provenance?.drugClass === "dissociatives" || provenance?.drugClass === "deliriants"
      ? { drug_class: provenance.drugClass }
      : {}),
  };
}

/**
 * The article showcase owns inclusion and ordering. Its underlying gallery
 * supplies the existing v1 media/rights projection and association evidence.
 * Both loaders share request-deduped reads; no matcher or ordering lives here.
 */
export async function getPublicApiSubstanceReplications(substanceSlug: string) {
  const [collection, gallery] = await Promise.all([
    getSubstanceShowcaseWorks(substanceSlug),
    getPublicReplicationsForSubstance(substanceSlug),
  ]);
  if (!collection) return null;

  const bySlug = new Map(gallery.items.map((item) => [item.replication.slug, item]));
  const revision = createHash("sha256").update(substanceSlug).update("\n");
  const data = collection.works.map((work) => {
    const item = bySlug.get(work.slug);
    // Do not silently omit a work and advance the cursor past it.
    if (!item) throw new Error("Canonical substance collection could not be resolved.");
    const association = projectAssociation(substanceSlug, item.provenance);
    // Signed storage URLs can rotate without changing collection membership.
    // Bind traversal to ordered identities and their public placement context.
    revision.update(JSON.stringify([work.slug, association])).update("\n");
    return { ...projectPublicApiReplication(item.replication), association };
  });
  return {
    data,
    collectionLabel: collection.collectionLabel,
    revision: revision.digest("hex"),
  };
}

export function encodeSubstanceReplicationCursor(cursor: CollectionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSubstanceReplicationCursor(cursor: string): CollectionCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) return null;
    const parsed = collectionCursorSchema.safeParse(JSON.parse(bytes.toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
