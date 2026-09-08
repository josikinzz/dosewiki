import type { Metadata } from "next";
import { headers } from "next/headers";
import { getEffectShowcaseWorks, getSubstanceShowcaseWorks } from "@/app/_components/public-routes/showcaseCollections";
import { ReplicationEmbed } from "@/features/replications/embed/ReplicationEmbed";
import { buildEmbedCollection, isEmbedSlug, type EmbedSelection } from "@/features/replications/embed/embedModel";
import { isAllowedReplicationEmbedParent } from "@server/next/replicationEmbedPolicy";

export const metadata: Metadata = {
  title: "Replications | dose.wiki",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default async function ReplicationEmbedPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const publisherOrigin = `${protocol}://${host}`;
  const parentOrigin = typeof params.parentOrigin === "string" ? params.parentOrigin : null;
  const theme = params.theme === "light" || params.theme === "dark" ? params.theme : undefined;
  // Modified clicks on the canonical showcase retain its ordinary ?viewer= URL.
  const requestedWork = params.work ?? params.viewer;
  const initialSlug = isEmbedSlug(requestedWork) ? requestedWork : null;
  const slugs = typeof params.slug === "string" ? [params.slug] : params.slug ?? [];
  const validParent = params.parentOrigin === undefined || (parentOrigin !== null && isAllowedReplicationEmbedParent(parentOrigin, {
    isDevelopment: process.env.NODE_ENV === "development", publisherOrigin,
  }));
  const validSelection = (params.kind === "effect" || params.kind === "substance") &&
    slugs.length > 0 && slugs.length <= 64 && slugs.every(isEmbedSlug) &&
    (params.kind !== "substance" || slugs.length === 1);
  if (!validParent || !validSelection || (requestedWork !== undefined && !initialSlug) || (params.theme !== undefined && !theme)) {
    return <ReplicationEmbed parentOrigin={validParent ? parentOrigin : null} error="This replication embed address is not supported." />;
  }
  const selection: EmbedSelection = { kind: params.kind as EmbedSelection["kind"], slugs: [...new Set(slugs)] };
  const sourceParams = new URLSearchParams({ kind: selection.kind });
  for (const slug of selection.slugs) sourceParams.append("slug", slug);
  if (parentOrigin) sourceParams.set("parentOrigin", parentOrigin);
  const sourcePath = `/embed/replications?${sourceParams}`;
  try {
    // One unresolvable slug must not blank the collection: a playlist can name
    // a replication tag the site serves media under but publishes no effect
    // article for. Skip those groups and fail only when nothing resolves.
    const resolved = await Promise.all(selection.slugs.map(async (slug) => {
      if (selection.kind === "substance") {
        const result = await getSubstanceShowcaseWorks(slug);
        if (!result) throw new Error("Unknown substance collection");
        return { slug, label: result.collectionLabel, works: result.works };
      }
      const result = await getEffectShowcaseWorks(slug);
      return result ? { slug, label: result.effectName ?? slug, works: result.works } : null;
    }));
    const groups = resolved.filter((group) => group !== null);
    if (groups.length === 0) throw new Error("No requested collection resolved");
    return <ReplicationEmbed parentOrigin={parentOrigin} theme={theme} initialSlug={initialSlug}
      collection={buildEmbedCollection(selection, groups, sourcePath)} />;
  } catch (error) {
    console.error("Replication embed collection read failed", error);
    return <ReplicationEmbed parentOrigin={parentOrigin} theme={theme} error="These replications could not be loaded. Please try again." />;
  }
}
