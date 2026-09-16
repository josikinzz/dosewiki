/**
 * Admin-only load/save endpoint for molecule class orientation templates.
 *
 * Templates are isolated from `moleculeOverrides`; this route deliberately
 * performs no public-page revalidation and has no apply behavior.
 */
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { NextResponse } from "next/server";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const CLASS_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_PAYLOAD_BYTES = MAX_MOLBLOCK_BYTES + 4 * 1024;

type MoleculeClassTemplate = {
  classKey: string;
  molblock: string;
  boldBonds?: number[];
  updatedAt: number;
  updatedBy?: string;
};

type SaveTemplateBody = {
  classKey?: unknown;
  molblock?: unknown;
  boldBonds?: unknown;
};

type ParsedSaveTemplate = {
  classKey: string;
  molblock: string;
  boldBonds?: number[];
};

/** A molecule can't have more bonds than the MOL block byte limit allows lines. */
const MAX_BOLD_BONDS = 1024;

const getByClassKey = makeFunctionReference<
  "query",
  { classKey: string },
  MoleculeClassTemplate | null
>("moleculeClassTemplates:getByClassKey");

const listTemplateKeys = makeFunctionReference<
  "query",
  Record<string, never>,
  Array<{ classKey: string; updatedAt: number }>
>("moleculeClassTemplates:listKeys");

const saveTemplate = makeFunctionReference<
  "mutation",
  {
    apiKey?: string;
    actorEmail?: string;
    classKey: string;
    molblock: string;
    boldBonds?: number[];
    updatedBy?: string;
  },
  { updated: boolean; id: string; updatedAt: number }
>("moleculeClassTemplates:save");

function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  if (normalizedEmailKey) {
    return normalizedEmailKey;
  }
  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}

function parseClassKey(value: string | null): string {
  const classKey = value?.trim() ?? "";
  if (!CLASS_KEY_RE.test(classKey)) {
    throw new JsonBodyError(400, "A valid chemical class key is required.");
  }
  return classKey;
}

function parseSaveBody(body: SaveTemplateBody): ParsedSaveTemplate {
  const classKey = parseClassKey(typeof body.classKey === "string" ? body.classKey : null);
  if (
    typeof body.molblock !== "string" ||
    body.molblock.length === 0 ||
    body.molblock.length > MAX_MOLBLOCK_BYTES
  ) {
    throw new JsonBodyError(400, "A valid molecule class template MOL block is required.");
  }
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
  return { classKey, molblock: body.molblock, boldBonds };
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load molecule class template via Next route:",
  unexpectedErrorMessage: "Unable to load the molecule class template right now.",
  operation: async ({ request, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const url = new URL(request.url);
    if (url.searchParams.get("list") === "1") {
      const templates = await dataWrite.client.query(listTemplateKeys, {});
      return NextResponse.json({ ok: true, templates });
    }
    const classKey = parseClassKey(url.searchParams.get("classKey"));
    const template = await dataWrite.client.query(getByClassKey, { classKey });
    return NextResponse.json({ ok: true, template });
  },
});

export const POST = protectedRouteOperation<SaveTemplateBody, ParsedSaveTemplate>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_PAYLOAD_BYTES,
    parse: parseSaveBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save molecule class template via Next route:",
  unexpectedErrorMessage: "Unable to save the molecule class template right now.",
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const result = await dataWrite.client.mutation(saveTemplate, {
      apiKey,
      actorEmail,
      classKey: body.classKey,
      molblock: body.molblock,
      boldBonds: body.boldBonds,
      updatedBy,
    });

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      classKey: body.classKey,
      updatedAt: result.updatedAt,
      updatedBy,
    });
  },
});
