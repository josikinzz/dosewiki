export type ProposalBaseline = {
  kind: "article" | "indexLayout" | "copyBlock" | "about";
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
  };
  const { _id, _creationTime, updatedAt: _updatedAt, updatedBy: _updatedBy, ...document } = row;
  return document;
}
