/** Admin-only, whole-revision-guarded single-field publication.
 * The content and attributed revision commit in one Convex transaction.
 * Retrying the same changeId reconciles a lost response without another write.
 */
import { NextResponse } from "next/server";
import { revalidateSavedPaths } from "../../save-to-convex/revalidateSavedPaths";
import { api } from "../../../../../convex/_generated/api";
import {
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  editableFieldKindForPath,
  isEditableRangeValue,
  type EditableFieldKind,
  type EditableFieldValue,
} from "../../../../../convex/lib/articleFieldWrites";

import { isFieldPathDiagnostic, parseFieldPath } from "@/data/schema/fieldPath";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type SetArticleFieldBody = {
  slug?: unknown;
  path?: unknown;
  value?: unknown;
  expected?: unknown;
  baseHash?: unknown;
  changeId?: unknown;
};

type ParsedSetArticleField = {
  slug: string;
  path: string;
  value: EditableFieldValue;
  expected: EditableFieldValue;
  baseHash: string;
  changeId: string;
};

/** Validates one side of the exchange against the path's declared kind. */
function parseFieldValue(
  raw: unknown,
  kind: EditableFieldKind,
  label: string,
): EditableFieldValue {
  if (kind === "text") {
    if (typeof raw !== "string") {
      throw new JsonBodyError(400, `${label} must be a string.`);
    }
    if (raw.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH) {
      throw new JsonBodyError(
        400,
        `${label} must be ${EDITABLE_ARTICLE_FIELD_MAX_LENGTH} characters or fewer.`,
      );
    }
    return raw;
  }
  if (!isEditableRangeValue(raw)) {
    throw new JsonBodyError(400, `${label} must be a range of the form { min, max, unit }.`);
  }
  return raw;
}

function parseSetArticleFieldBody(body: SetArticleFieldBody): ParsedSetArticleField {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid substance slug is required.");
  }

  const path = typeof body.path === "string" ? body.path.trim() : "";
  // Two gates on purpose: the shared parser rejects malformed or template
  // notation, and the allow-list rejects well-formed paths nobody may write.
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed) || parsed.isTemplate) {
    throw new JsonBodyError(400, "A valid concrete field path is required.");
  }
  const kind = editableFieldKindForPath(parsed.normalized);
  if (!kind) {
    throw new JsonBodyError(400, `Field "${path}" is not inline-editable.`);
  }

  const value = parseFieldValue(body.value, kind, "Field value");

  // Array indices in `path` are computed from the client's rendered draft, so
  // the caller must also say what that draft held. The mutation refuses the
  // write when Convex disagrees — a reordered or shortened route array would
  // otherwise land one route's note on top of another's.
  if (body.expected === undefined) {
    throw new JsonBodyError(400, "The field's expected current value is required.");
  }
  const expected = parseFieldValue(
    body.expected,
    kind,
    "The field's expected current value",
  );

  if (typeof body.baseHash !== "string" || !body.baseHash || typeof body.changeId !== "string" || !body.changeId) {
    throw new JsonBodyError(400, "The loaded article revision and a stable change ID are required.");
  }
  return { slug, path: parsed.normalized, value, expected, baseHash: body.baseHash, changeId: body.changeId };
}


export const POST = protectedRouteOperation<SetArticleFieldBody, ParsedSetArticleField>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 8 * 1024,
    parse: parseSetArticleFieldBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to write an article field via Next route:",
  unexpectedErrorMessage: "Unable to save that edit right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.substanceIndex.setArticleField, {
      apiKey,
      actorEmail,
      slug: body.slug,
      path: body.path,
      value: body.value,
      expected: body.expected,
      baseHash: body.baseHash,
      changeId: body.changeId,
    });


    // Refresh this article's leaves and the shared listing projections immediately.
    await revalidateSavedPaths([`/${body.slug}`], "manual");
    return NextResponse.json({
      ok: true,
      slug: result.slug,
      path: result.path,
      value: result.value,
      baseHash: result.baseHash,
    });
  },
});
