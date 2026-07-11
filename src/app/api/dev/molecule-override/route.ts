/**
 * Editor write endpoint for the Molecule Depiction Editor (`/dev` → Molecules).
 *
 * This persists the canonical MOL block + SVG to `moleculeOverrides`, so the
 * deployed editor and public pages share one depiction. Writes require an
 * editor session. DELETE remains available for class overrides and deliberate
 * seeded-row rollback, but the substance editor exposes only local Revert + Save.
 *
 *   POST   /api/dev/molecule-override   { slug, svg, molblock, smiles? }  → save
 *   DELETE /api/dev/molecule-override?slug=lsd                            → remove
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const SLUG_RE = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = MAX_SVG_BYTES + MAX_MOLBLOCK_BYTES + 8 * 1024;

type SaveOverrideBody = {
  slug?: unknown;
  svg?: unknown;
  molblock?: unknown;
  smiles?: unknown;
};

type ParsedSaveOverride = {
  slug: string;
  svg: string;
  molblock: string;
  smiles?: string;
};

function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  if (normalizedEmailKey) {
    return normalizedEmailKey;
  }
  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}

function parseSaveBody(body: SaveOverrideBody): ParsedSaveOverride {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid molecule slug is required.");
  }
  if (typeof body.svg !== "string" || !body.svg.includes("<svg") || body.svg.length > MAX_SVG_BYTES) {
    throw new JsonBodyError(400, "A valid molecule SVG is required.");
  }
  if (typeof body.molblock !== "string" || body.molblock.length === 0 || body.molblock.length > MAX_MOLBLOCK_BYTES) {
    throw new JsonBodyError(400, "A valid molecule MOL block is required.");
  }
  const smiles = typeof body.smiles === "string" && body.smiles.trim().length > 0 ? body.smiles.trim() : undefined;
  return { slug, svg: body.svg, molblock: body.molblock, smiles };
}

function revalidateMoleculeOwner(slug: string) {
  if (slug.startsWith("class:")) {
    const classKey = slug.slice("class:".length);
    revalidatePath(`/chemical-classes/${classKey}`);
    revalidatePath("/chemical-classes");
    return;
  }
  revalidatePath(`/${slug}`);
}

export const POST = protectedRouteOperation<SaveOverrideBody, ParsedSaveOverride>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_PAYLOAD_BYTES,
    parse: parseSaveBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save molecule override via Next route:",
  unexpectedErrorMessage: "Unable to save the molecule override right now.",
  operation: async ({ auth, actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.moleculeOverrides.save, {
      apiKey,
      actorEmail,
      slug: body.slug,
      svg: body.svg,
      molblock: body.molblock,
      smiles: body.smiles,
      updatedBy,
    });

    // Refresh the owner page so it receives the new updatedAt-versioned URL.
    revalidateMoleculeOwner(body.slug);

    return NextResponse.json({ ok: true, updated: result.updated, slug: body.slug, updatedBy });
  },
});

export const DELETE = protectedRouteOperation({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to remove molecule override via Next route:",
  unexpectedErrorMessage: "Unable to remove the molecule override right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: "A valid molecule slug is required." }, { status: 400 });
    }

    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;
    const result = await convexWrite.client.mutation(api.moleculeOverrides.remove, {
      apiKey,
      actorEmail,
      slug,
    });

    // Return the owner page to its legacy static fallback.
    revalidateMoleculeOwner(slug);

    return NextResponse.json({ ok: true, deleted: result.deleted, slug });
  },
});
