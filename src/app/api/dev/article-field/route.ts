/**
 * Editor write endpoint for the review portal's inline click-to-edit.
 *
 * Writes exactly one allow-listed string field on one article via
 * `substanceIndex.setArticleField`. The full editor save flow (diff, commit
 * message, changelog) stays reserved for content edits; fixing a typo in a
 * dosage note while flipping through the queue should not cost a commit.
 *
 *   POST /api/dev/article-field   { slug, path, value, expected }  → one field
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import {
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  editableFieldKindForPath,
  isEditableRangeValue,
  type EditableFieldKind,
  type EditableFieldValue,
} from "../../../../../convex/lib/articleFieldWrites";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
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
};

type ParsedSetArticleField = {
  slug: string;
  path: string;
  value: EditableFieldValue;
  expected: EditableFieldValue;
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

  return { slug, path: parsed.normalized, value, expected };
}

export const POST = protectedRouteOperation<SetArticleFieldBody, ParsedSetArticleField>({
  auth: "editor",
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
    });

    // The edit changes public article content, so the article's own cached
    // projections must refresh alongside the shared substances tag.
    revalidatePath(`/${body.slug}`);
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.substances, { expire: 0 });

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      path: result.path,
      value: result.value,
    });
  },
});
