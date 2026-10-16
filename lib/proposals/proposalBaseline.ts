export type ProposalBaseline = {
  kind: "article" | "indexLayout" | "copyBlock" | "about" | "writing";
  key: string;
  document: unknown;
};

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
