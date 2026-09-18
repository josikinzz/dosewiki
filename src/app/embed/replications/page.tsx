import type { Metadata } from "next";
import { headers } from "next/headers";
import { getEmbedCollection } from "@server/next/embedCollection";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { ReplicationEmbed } from "@/features/replications/embed/ReplicationEmbed";
import { isEmbedSlug, type EmbedSelection } from "@/features/replications/embed/embedModel";
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
    const collection = await getEmbedCollection(selection, sourcePath);
    return <ReplicationEmbed parentOrigin={parentOrigin} theme={theme} initialSlug={initialSlug}
      collection={{
        works: collection.works.slice(0, SHOWCASE_WORK_CAP),
        totalCount: collection.works.length,
        label: collection.viewer.label,
        sourcePath,
        selection,
      }} />;
  } catch (error) {
    console.error("Replication embed collection read failed", error);
    return <ReplicationEmbed parentOrigin={parentOrigin} theme={theme} error="These replications could not be loaded. Please try again." />;
  }
}
