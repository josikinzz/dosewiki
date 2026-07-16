function requireReference(value, path) {
  if (!value) {
    throw new Error(`Missing proposal read API reference: ${path}.`);
  }
  return value;
}

export function createProposalReadApi(convexApi) {
  return Object.freeze({
    substanceIndex: Object.freeze({
      getBySlug: requireReference(convexApi?.substanceIndex?.getBySlug, "substanceIndex.getBySlug"),
    }),
    prompts: Object.freeze({
      getByKey: requireReference(convexApi?.prompts?.getByKey, "prompts.getByKey"),
    }),
    quotes: Object.freeze({
      getBySlugAndSection: requireReference(
        convexApi?.quotes?.getBySlugAndSection,
        "quotes.getBySlugAndSection",
      ),
    }),
    articleSources: Object.freeze({
      getBySlug: requireReference(convexApi?.articleSources?.getBySlug, "articleSources.getBySlug"),
    }),
  });
}

export function createQueryOnlyConvexClient(Client, url) {
  const client = new Client(url);
  return Object.freeze({
    query: client.query.bind(client),
  });
}
