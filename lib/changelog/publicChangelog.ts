const EMAIL_TOKEN = /(?:mailto:)?[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?/gu;

export function redactChangelogEmails(value: string): string {
  return value.replace(EMAIL_TOKEN, "Contributor");
}

export function publicChangelogSubmitter(value: unknown): string | null {
  return typeof value === "string" && value.trim() && !value.includes("@") ? value : null;
}

type ChangelogPublication = {
  entryId: string;
  createdAt: string;
  message: string;
  markdown: string;
  submittedBy: string | null;
  articles: Array<{ id: number; title: string; slug: string }>;
};

export function projectPublicChangelog(row: ChangelogPublication): ChangelogPublication {
  return {
    entryId: row.entryId,
    createdAt: row.createdAt,
    message: redactChangelogEmails(row.message),
    markdown: redactChangelogEmails(row.markdown),
    submittedBy: publicChangelogSubmitter(row.submittedBy),
    articles: row.articles.map(({ id, title, slug }) => ({ id, title, slug })),
  };
}
