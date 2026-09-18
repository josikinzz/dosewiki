function requireReference(value, path) {
  if (!value) {
    throw new Error(`Missing proposal read API reference: ${path}.`);
  }
  return value;
}

export function createProposalReadApi(postgresApi) {
  return Object.freeze({
    substanceIndex: Object.freeze({
      getBySlug: requireReference(postgresApi?.substanceIndex?.getBySlug, "substanceIndex.getBySlug"),
    }),
    prompts: Object.freeze({
      getByKey: requireReference(postgresApi?.prompts?.getByKey, "prompts.getByKey"),
    }),
    quotes: Object.freeze({
      getBySlugAndSection: requireReference(
        postgresApi?.quotes?.getBySlugAndSection,
        "quotes.getBySlugAndSection",
      ),
    }),
    articleSources: Object.freeze({
      getBySlug: requireReference(postgresApi?.articleSources?.getBySlug, "articleSources.getBySlug"),
    }),
  });
}

export function createQueryOnlyPostgresClient(Client, url) {
  const client = new Client(url);
  return Object.freeze({
    query: client.query.bind(client),
  });
}
