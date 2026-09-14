import type { EditorialReview } from "./editorial";

const EDITORIAL_REVIEW_FIELD = "editorial_review" as const;

export type EditorialReviewPolicyMode =
  | "public_read"
  | "editor_read"
  | "generated_update"
  | "batch_input"
  | "generated_output"
  | "prepopulate"
  | "export"
  | "import";

type ArticleWithEditorialReview = object & {
  editorial_review?: unknown;
};

export type PublicArticleProjection<T extends ArticleWithEditorialReview> =
  Omit<T, typeof EDITORIAL_REVIEW_FIELD> & {
    [EDITORIAL_REVIEW_FIELD]?: never;
  };

export const EDITORIAL_REVIEW_DEFAULT: EditorialReview = {
  status: "needed",
  notes: "",
};

const EDITORIAL_REVIEW_ALLOWED_MODES = new Set<EditorialReviewPolicyMode>([
  "editor_read",
  "batch_input",
  "prepopulate",
  "export",
  "import",
]);

const EDITORIAL_REVIEW_MUTABLE_MODES = new Set<EditorialReviewPolicyMode>([
  "editor_read",
  "prepopulate",
  "import",
]);

export function isEditorialReviewAllowed(mode: EditorialReviewPolicyMode): boolean {
  return EDITORIAL_REVIEW_ALLOWED_MODES.has(mode);
}

export function canMutateEditorialReview(mode: EditorialReviewPolicyMode): boolean {
  return EDITORIAL_REVIEW_MUTABLE_MODES.has(mode);
}

export function getDefaultEditorialReview(): EditorialReview {
  return { ...EDITORIAL_REVIEW_DEFAULT };
}

export function normalizeEditorialReviewForEditor(raw: unknown): EditorialReview {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return getDefaultEditorialReview();
  }

  const item = raw as Record<string, unknown>;
  const status = item.status === "needed" || item.status === "in_progress" || item.status === "completed"
    ? item.status
    : EDITORIAL_REVIEW_DEFAULT.status;

  return {
    status,
    notes: typeof item.notes === "string" ? item.notes : EDITORIAL_REVIEW_DEFAULT.notes,
    ...(typeof item.reviewed_by === "string" ? { reviewed_by: item.reviewed_by } : {}),
    ...(typeof item.reviewed_at === "string" ? { reviewed_at: item.reviewed_at } : {}),
  };
}

export function projectEditorArticle<T extends object>(
  article: T & { editorial_review?: unknown },
): T & { editorial_review: EditorialReview } {
  return {
    ...article,
    editorial_review: normalizeEditorialReviewForEditor(article.editorial_review),
  };
}

export function projectPublicArticle<T extends object>(
  article: T & { editorial_review?: unknown },
): PublicArticleProjection<T> {
  const { editorial_review: _editorialReview, ...publicArticle } = article;
  return publicArticle as PublicArticleProjection<T>;
}


export function assertEditorialReviewMutationAllowed(
  mode: EditorialReviewPolicyMode,
  attemptedFields: Iterable<string>,
): void {
  if (canMutateEditorialReview(mode)) {
    return;
  }

  for (const field of attemptedFields) {
    if (field === EDITORIAL_REVIEW_FIELD) {
      throw new Error(`editorial_review is editor-only metadata and cannot be changed by ${mode}.`);
    }
  }
}
