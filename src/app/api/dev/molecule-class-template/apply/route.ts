/**
 * Admin-only preview/apply endpoint for saved class orientation templates.
 *
 * GET reads current MOL blocks/source markers for up to 50 rolled members.
 * POST applies up to 50 confirmed depictions. The 16 MiB aggregate body cap is
 * deliberately tighter than 50 times the single-molecule ceiling because SVG
 * payloads are large and the useful class batches are much smaller in practice.
 */
import { Buffer } from "node:buffer";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { TEMPLATE_APPLY_MEMBER_LIMIT } from "@/features/dev/tools/molecule-editor/templateApplicationPayload";

export const runtime = "nodejs";

const CLASS_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_PAYLOAD_BYTES = 16 * 1024 * 1024;

type CurrentDepiction = {
  slug: string;
  molblock: string;
  source?: "seeded" | "editor" | "template";
};

type ApplyTemplateBody = {
  classKey?: unknown;
  members?: unknown;
};

type ParsedApplyTemplate = {
  classKey: string;
  members: Array<{ slug: string; molblock: string; svg: string }>;
};

type ApplyMutationResult =
  | { applied: true; slug: string; updated: boolean }
  | { applied: false; slug: string; reason: "protected-hand-edit" };

const getCurrentBySlugs = makeFunctionReference<
  "query",
  { apiKey?: string; actorEmail?: string; slugs: string[] },
  CurrentDepiction[]
>("moleculeOverrides:getCurrentBySlugs");

const applyTemplateDepiction = makeFunctionReference<
  "mutation",
  {
    apiKey?: string;
    actorEmail?: string;
    slug: string;
    svg: string;
    molblock: string;
    updatedBy?: string;
  },
  ApplyMutationResult
>("moleculeOverrides:applyTemplateDepiction");

function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  if (normalizedEmailKey) return normalizedEmailKey;
  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}

function parseSlugList(request: Request): string[] {
  const slugs = Array.from(
    new Set(
      new URL(request.url).searchParams
        .getAll("slug")
        .map((slug) => slug.trim())
        .filter(Boolean),
    ),
  );
  if (slugs.length === 0) {
    throw new JsonBodyError(400, "At least one molecule slug is required.");
  }
  if (slugs.length > TEMPLATE_APPLY_MEMBER_LIMIT) {
    throw new JsonBodyError(
      400,
      `Template preview is limited to ${TEMPLATE_APPLY_MEMBER_LIMIT} molecules per request.`,
    );
  }
  if (slugs.some((slug) => !SLUG_RE.test(slug))) {
    throw new JsonBodyError(400, "Every template member must have a valid substance slug.");
  }
  return slugs;
}

function parseApplyBody(body: ApplyTemplateBody): ParsedApplyTemplate {
  const classKey = typeof body.classKey === "string" ? body.classKey.trim() : "";
  if (!CLASS_KEY_RE.test(classKey)) {
    throw new JsonBodyError(400, "A valid chemical class key is required.");
  }
  if (!Array.isArray(body.members) || body.members.length === 0) {
    throw new JsonBodyError(400, "At least one included template member is required.");
  }
  if (body.members.length > TEMPLATE_APPLY_MEMBER_LIMIT) {
    throw new JsonBodyError(
      400,
      `Template apply is limited to ${TEMPLATE_APPLY_MEMBER_LIMIT} molecules per request.`,
    );
  }

  const seen = new Set<string>();
  const members = body.members.map((value) => {
    if (!value || typeof value !== "object") {
      throw new JsonBodyError(400, "Every template member must be an object.");
    }
    const candidate = value as { slug?: unknown; molblock?: unknown; svg?: unknown };
    const slug = typeof candidate.slug === "string" ? candidate.slug.trim() : "";
    if (!SLUG_RE.test(slug) || seen.has(slug)) {
      throw new JsonBodyError(400, "Template member slugs must be valid and unique.");
    }
    seen.add(slug);
    if (
      typeof candidate.molblock !== "string" ||
      candidate.molblock.length === 0 ||
      Buffer.byteLength(candidate.molblock, "utf8") > MAX_MOLBLOCK_BYTES
    ) {
      throw new JsonBodyError(400, `A valid MOL block is required for ${slug}.`);
    }
    if (
      typeof candidate.svg !== "string" ||
      !candidate.svg.includes("<svg") ||
      Buffer.byteLength(candidate.svg, "utf8") > MAX_SVG_BYTES
    ) {
      throw new JsonBodyError(400, `A valid molecule SVG is required for ${slug}.`);
    }
    return { slug, molblock: candidate.molblock, svg: candidate.svg };
  });

  return { classKey, members };
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load molecule template preview inputs:",
  unexpectedErrorMessage: "Unable to load the current molecule depictions right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const slugs = parseSlugList(request);
    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const depictions = await dataWrite.client.query(getCurrentBySlugs, {
      apiKey,
      actorEmail,
      slugs,
    });
    return NextResponse.json({
      ok: true,
      depictions,
      memberLimit: TEMPLATE_APPLY_MEMBER_LIMIT,
    });
  },
});

export const POST = protectedRouteOperation<ApplyTemplateBody, ParsedApplyTemplate>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_BATCH_PAYLOAD_BYTES,
    parse: parseApplyBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to apply molecule class template:",
  unexpectedErrorMessage: "Unable to apply the molecule class template right now.",
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const results = await Promise.all(
      body.members.map(async (member) => {
        try {
          const result = await dataWrite.client.mutation(applyTemplateDepiction, {
            apiKey,
            actorEmail,
            slug: member.slug,
            molblock: member.molblock,
            svg: member.svg,
            updatedBy,
          });
          if (result.applied === false) {
            return {
              slug: member.slug,
              status: "skipped" as const,
              reason: result.reason,
            };
          }
          return { slug: member.slug, status: "applied" as const };
        } catch (error) {
          return {
            slug: member.slug,
            status: "error" as const,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const appliedSlugs = results
      .filter((result) => result.status === "applied")
      .map((result) => result.slug);
    // Each applied member is a published depiction of its own, so its
    // persisted leaf and its owner page expire with the shared override index.
    const targets: PublicationTarget[] = appliedSlugs.map((slug) => ({ kind: "molecule", slug }));
    if (appliedSlugs.length > 0) {
      // A substance can appear on the selected class, descendant/ancestor
      // rollups, and an unrelated class through multi-class membership, so the
      // class index layout goes rather than the one class page.
      targets.push({ kind: "chemical-class-lists" });
    }
    const publication = targets.length > 0
      ? await publishPublicCache({ targets, source: "manual" })
      : [];

    return NextResponse.json({
      ok: true,
      classKey: body.classKey,
      results,
      summary: {
        applied: appliedSlugs.length,
        protected: results.filter(
          (result) => result.status === "skipped" && result.reason === "protected-hand-edit",
        ).length,
        errors: results.filter((result) => result.status === "error").length,
      },
      publication,
      updatedBy,
      memberLimit: TEMPLATE_APPLY_MEMBER_LIMIT,
    });
  },
});
