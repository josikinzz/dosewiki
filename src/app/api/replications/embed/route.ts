import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getEmbedCollection } from "@server/next/embedCollection";
import { isAllowedReplicationEmbedParent } from "@server/next/replicationEmbedPolicy";
import { isEmbedSlug } from "@/features/replications/embed/embedModel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "publicContentApiRead");
  if (limited) return limited;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const slugs = url.searchParams.getAll("slug");
  const parentOrigin = url.searchParams.get("parentOrigin");
  if ((kind !== "effect" && kind !== "substance") || slugs.length === 0 || slugs.length > 64 ||
      !slugs.every(isEmbedSlug) || (kind === "substance" && slugs.length !== 1) ||
      (parentOrigin !== null && !isAllowedReplicationEmbedParent(parentOrigin, {
        isDevelopment: process.env.NODE_ENV === "development", publisherOrigin: url.origin,
      }))) {
    return NextResponse.json({ error: "This replication collection address is not supported." }, { status: 400 });
  }
  const selection: { kind: "effect" | "substance"; slugs: string[] } = { kind, slugs: [...new Set(slugs)] };
  const params = new URLSearchParams({ kind });
  for (const slug of selection.slugs) params.append("slug", slug);
  if (parentOrigin) params.set("parentOrigin", parentOrigin);
  try {
    const collection = await getEmbedCollection(selection, `/embed/replications?${params}`);
    return NextResponse.json(collection, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Replication embed collection read failed", error);
    return NextResponse.json({ error: "These replications could not be loaded. Please try again." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
