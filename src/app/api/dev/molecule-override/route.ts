/**
 * Admin write endpoint for the Molecule Depiction Editor (`/dev` → Molecules).
 *
 * This persists the canonical MOL block + SVG to `moleculeOverrides`, so the
 * deployed editor and public pages share one depiction. Writes require an
 * editor session. DELETE remains available for class overrides and deliberate
 * seeded-row rollback, but the substance editor exposes only local Revert + Save.
 *
 *   POST   /api/dev/molecule-override   { slug, svg, molblock, smiles?, boldBonds? }  → save
 *   DELETE /api/dev/molecule-override?slug=lsd                            → remove
 */
import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { api } from "@server/postgres/runtime/api";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const SLUG_RE = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = MAX_SVG_BYTES + MAX_MOLBLOCK_BYTES + 8 * 1024;
const getMoleculeEditSource = makeFunctionReference<
  "query",
  { apiKey?: string; actorEmail?: string; slug: string },
  {
    slug: string;
    molblock: string;
    boldBonds?: number[];
    source: string;
    updatedAt: string | number;
  } | null
>("moleculeEditor:getEditSource");

type SaveOverrideBody = {
  slug?: unknown;
  svg?: unknown;
  molblock?: unknown;
  smiles?: unknown;
  boldBonds?: unknown;
};

type ParsedSaveOverride = {
  slug: string;
  svg: string;
  molblock: string;
  smiles?: string;
  boldBonds?: number[];
};

/** A molecule can't have more bonds than the MOL block byte limit allows lines. */
const MAX_BOLD_BONDS = 1024;

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
  let boldBonds: number[] | undefined;
  if (body.boldBonds !== undefined) {
    if (
      !Array.isArray(body.boldBonds) ||
      body.boldBonds.length > MAX_BOLD_BONDS ||
      body.boldBonds.some((bond) => !Number.isInteger(bond) || bond < 0)
    ) {
      throw new JsonBodyError(400, "boldBonds must be a list of bond indices.");
    }
    boldBonds = body.boldBonds.length > 0 ? (body.boldBonds as number[]) : undefined;
  }
  return { slug, svg: body.svg, molblock: body.molblock, smiles, boldBonds };
}

function parseMoleculeSlug(value: string | null): string {
  const slug = value?.trim() ?? "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid molecule slug is required.");
  }
  return slug;
}

async function publishMoleculeOwner(slug: string) {
  // The persisted public leaves key on the stored slug, `class:` prefix and
  // all, so the molecule identity expires exactly this depiction plus the
  // shared override index every substance page reads, and carries the owner
  // page with it.
  const targets: PublicationTarget[] = [{ kind: "molecule", slug }];
  if (slug.startsWith("class:")) {
    // A class depiction is also drawn on the class index, which the stored
    // slug alone does not name.
    targets.push({ kind: "chemical-class-lists" });
  }
  await publishPublicCache({ targets, source: "manual" });
}

/**
 * The editor reads depictions through the same authenticated Postgres target used
 * for saves. This keeps a selected molecule from depending on the browser-read
 * deployment when editor and public deployments intentionally differ.
 */
export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load molecule override via Next route:",
  unexpectedErrorMessage: "Unable to load the molecule depiction right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = parseMoleculeSlug(new URL(request.url).searchParams.get("slug"));
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const override = await dataWrite.client.query(getMoleculeEditSource, { apiKey, actorEmail, slug });
    return NextResponse.json({ ok: true, override });
  },
});

export const POST = protectedRouteOperation<SaveOverrideBody, ParsedSaveOverride>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_PAYLOAD_BYTES,
    parse: parseSaveBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save molecule override via Next route:",
  unexpectedErrorMessage: "Unable to save the molecule override right now.",
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.moleculeOverrides.save, {
      apiKey,
      actorEmail,
      slug: body.slug,
      svg: body.svg,
      molblock: body.molblock,
      smiles: body.smiles,
      boldBonds: body.boldBonds,
      updatedBy,
    });

    // Refresh the owner page so it receives the new updatedAt-versioned URL.
    await publishMoleculeOwner(body.slug);

    return NextResponse.json({ ok: true, updated: result.updated, slug: body.slug, updatedBy });
  },
});

export const DELETE = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to remove molecule override via Next route:",
  unexpectedErrorMessage: "Unable to remove the molecule override right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = parseMoleculeSlug(new URL(request.url).searchParams.get("slug"));

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const result = await dataWrite.client.mutation(api.moleculeOverrides.remove, {
      apiKey,
      actorEmail,
      slug,
    });

    // Return the owner page to its legacy static fallback.
    await publishMoleculeOwner(slug);

    return NextResponse.json({ ok: true, deleted: result.deleted, slug });
  },
});
