export type ProposalBaseline = {
  kind: "article" | "indexLayout" | "copyBlock" | "about" | "writing";
  key: string;
  document: unknown;
};

/** Match the editor's loaded document, excluding storage-only audit metadata. */
export function proposalComparableDocument(kind: ProposalBaseline["kind"], value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const row = value as Record<string, unknown>;
  if (kind === "indexLayout") return { version: row.version, categories: row.categories };
  if (kind === "about") return {
    aboutMarkdown: row.aboutMarkdown ?? "",
    aboutSubtitle: row.aboutSubtitle ?? "",
    founderProfileKeys: row.founderProfileKeys ?? [],
    translationCredits: row.translationCredits ?? {},
  };
  if (kind === "writing") return writingComparableDocument(row);
  const { _id, _creationTime, updatedAt: _updatedAt, updatedBy: _updatedBy, ...document } = row;
  return document;
}

/**
 * A Writing row as the editor edits it. The stored row keeps its body under
 * `body_raw` and carries parsed and audit fields, the editor's loaded row
 * adds `baseRevision` and `history`, and a proposal carries `body`. All three
 * compare on the fields the Writing editor can change.
 */
function writingComparableDocument(row: Record<string, unknown>): unknown {
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind ?? "article",
    status: row.status ?? "published",
    bodyFormat: row.bodyFormat ?? "vcode",
    body: row.body ?? row.body_raw ?? "",
    teaser: row.teaser ?? "",
    coverImageUrl: row.coverImageUrl ?? "",
    tags: row.tags ?? [],
    authorProfileKeys: row.authorProfileKeys ?? [],
    publicationDate: row.publicationDate ?? null,
  };
}
