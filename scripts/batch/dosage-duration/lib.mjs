import yaml from "yaml";

function titleToSlug(title) { return title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, ""); }

export function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

export function hasExistingDosageDuration(article) {
  const hasDosage = article.dosage?.routes?.length > 0 &&
    article.dosage.routes.some((route) =>
      route.dose_ranges && Object.values(route.dose_ranges).some((tier) => tier?.min !== null || tier?.max !== null),
    );

  const hasDuration = article.duration?.routes?.length > 0 &&
    article.duration.routes.some((route) =>
      route.stages && Object.values(route.stages).some((stage) => stage?.min !== null || stage?.max !== null),
    );

  return hasDosage || hasDuration;
}

export function buildUserMessage(article, quotes) {
  const minimalContext = {
    title: article.title,
    identification: {
      common_name: article.identification?.common_name || "",
      substitutive_name: article.identification?.substitutive_name || "",
    },
    classification: article.classification || {},
  };

  if (article.dosage?.routes?.length > 0) {
    minimalContext.dosage = {
      routes: article.dosage.routes.map((route) => {
        const rest = { ...route };
        delete rest.bioavailability;
        delete rest.bioavailability_notes;
        return rest;
      }),
      plateau_dosing: article.dosage.plateau_dosing || null,
    };
  }

  if (article.duration?.routes?.length > 0) {
    minimalContext.duration = {
      routes: article.duration.routes.map((route) => {
        const rest = { ...route };
        delete rest.half_life;
        delete rest.half_life_notes;
        return rest;
      }),
    };
  }

  const articleYaml = yaml.stringify(minimalContext, { lineWidth: 0, nullStr: "" });

  return `## Substance Context

\`\`\`yaml
${articleYaml}
\`\`\`

## Extracted Dosage & Duration Information

${quotes}

## Review Instructions

1. **Preserve accurate existing values** - Don't change correct data
2. **Fill gaps** - Add missing tiers/stages where sources provide data
3. **Correct errors** - Fix values that conflict with sources (prefer lower/safer)
4. **Standardize format** - Ensure routes match, units consistent
5. **DO NOT fabricate** - Only use values explicitly in sources`;
}

export function selectArticlesForProcessing(allArticles, options, hasQuotesForSlug) {
  const explicitSelection = options.substance || options.slugs?.length || options.all;
  let articles = explicitSelection
    ? [...allArticles]
    : allArticles.filter((article) => article.priority === "high" || article.priority === "normal");

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
    if (articles.length === 0) {
      throw new Error(`No article found for slug "${options.substance}"`);
    }
    return articles;
  }

  if (options.slugs?.length) {
    const requested = new Set(options.slugs);
    articles = articles.filter((article) => requested.has(getArticleSlug(article)));
  }

  if (options.newOnly) {
    articles = articles.filter((article) => {
      const slug = getArticleSlug(article);
      return hasQuotesForSlug(slug) && !hasExistingDosageDuration(article);
    });
  } else if (!options.all) {
    articles = articles.filter(hasExistingDosageDuration);
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return articles;
}

export function mergeGeneratedWithExisting(existingArticle, generatedDosage, generatedDuration, logger = console) {
  const result = {
    dosage: { routes: [], plateau_dosing: generatedDosage.plateau_dosing ?? null },
    duration: { routes: [] },
  };

  const existingDosageByRoute = new Map(
    (existingArticle.dosage?.routes || []).map((route) => [route.route.toLowerCase(), route]),
  );
  const existingDurationByRoute = new Map(
    (existingArticle.duration?.routes || []).map((route) => [route.route.toLowerCase(), route]),
  );

  const generatedDosageRoutes = new Set((generatedDosage.routes || []).map((route) => route.route.toLowerCase()));
  const generatedDurationRoutes = new Set((generatedDuration.routes || []).map((route) => route.route.toLowerCase()));

  for (const generatedRoute of generatedDosage.routes || []) {
    const existing = existingDosageByRoute.get(generatedRoute.route.toLowerCase());
    result.dosage.routes.push({
      route: generatedRoute.route,
      bioavailability: existing?.bioavailability || "",
      bioavailability_notes: existing?.bioavailability_notes || "",
      dose_ranges: generatedRoute.dose_ranges,
      notes: generatedRoute.notes || "",
    });
  }

  for (const [routeKey, existingRoute] of existingDosageByRoute) {
    if (!generatedDosageRoutes.has(routeKey)) {
      logger.log(`    Warning: Existing dosage route "${existingRoute.route}" not in generated output - keeping original`);
      result.dosage.routes.push(existingRoute);
    }
  }

  for (const generatedRoute of generatedDuration.routes || []) {
    const existing = existingDurationByRoute.get(generatedRoute.route.toLowerCase());
    result.duration.routes.push({
      route: generatedRoute.route,
      half_life: existing?.half_life || "",
      half_life_notes: existing?.half_life_notes || "",
      stages: generatedRoute.stages,
    });
  }

  for (const [routeKey, existingRoute] of existingDurationByRoute) {
    if (!generatedDurationRoutes.has(routeKey)) {
      logger.log(`    Warning: Existing duration route "${existingRoute.route}" not in generated output - keeping original`);
      result.duration.routes.push(existingRoute);
    }
  }

  return result;
}
