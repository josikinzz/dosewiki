import yaml from "yaml";

import { normalizePharmacologySection } from "../../../lib/article/normalization.mjs";
import { parseBatchCliArgs } from "../lib/cli-options.mjs";

export const COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD = 5;

export const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 50 },
  limit: { min: 1, max: 10000 },
};


export function parseArgs(args, config, inputBounds = INPUT_BOUNDS) {
  return parseBatchCliArgs(args, {
    defaults: {
      concurrency: config.maxConcurrency,
      dryRun: false,
      verbose: false,
      substance: null,
      slugs: null,
      limit: null,
      skipBackup: false,
      all: false,
      includeComplete: false,
      sourceUrl: null,
      targetUrl: null,
      write: false,
      confirmWrite: null,
      expectedDeployment: null,
      help: false,
    },
    booleanFlags: ["dry-run", "verbose", "skip-backup", "all", "include-complete", "write"],
    stringFlags: ["substance", "sourceUrl", "targetUrl", "confirmWrite", "expectedDeployment"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: config.maxConcurrency, bounds: inputBounds.concurrency },
      { name: "limit", fallbackOnNaN: null, bounds: inputBounds.limit },
    ],
    aliases: {
      "dry-run": "dryRun",
      "skip-backup": "skipBackup",
      "include-complete": "includeComplete",
      "source-url": "sourceUrl",
      "target": "targetUrl",
      "confirm-write": "confirmWrite",
      "expected-deployment": "expectedDeployment",
    },
  });
}

function titleToSlug(title) { return title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, ""); }

export function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

export function stripDataMetadata(article) {
  const { _id, _creationTime, ...cleanArticle } = article;
  return cleanArticle;
}

export function countPopulatedPharmacologyFields(article) {
  const pharmacology = normalizePharmacologySection(article?.pharmacology);
  return [
    pharmacology.pharmacodynamics.trim().length > 0,
    (pharmacology.summary ?? "").trim().length > 0,
    pharmacology.binding_sites.length > 0,
    pharmacology.pharmacokinetics.trim().length > 0,
    pharmacology.metabolites.length > 0,
    Object.keys(pharmacology.route_bioavailability ?? {}).length > 0,
    Object.keys(pharmacology.route_half_life ?? {}).length > 0,
  ].filter(Boolean).length;
}

function hasCompletePharmacology(article) { return countPopulatedPharmacologyFields(article) >= COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD; }

export function assertNonRegressivePharmacologyReplacement(article, pharmacology) {
  const existingFieldCount = countPopulatedPharmacologyFields(article);
  const generatedFieldCount = countPopulatedPharmacologyFields({ pharmacology });

  if (generatedFieldCount === 0) {
    throw new Error("Generated pharmacology is empty; refusing to replace existing content");
  }
  if (generatedFieldCount < existingFieldCount) {
    throw new Error(
      `Generated pharmacology regresses populated fields (${existingFieldCount} -> ${generatedFieldCount}); refusing replacement`,
    );
  }

  return { existingFieldCount, generatedFieldCount };
}

export function selectArticlesForProcessing(allArticles, options, pharmacologyQuoteSlugs) {
  let articles = allArticles.filter((article) =>
    options.all ? true : article.priority === "high" || article.priority === "normal",
  );

  const summary = {
    candidateCount: articles.length,
    quoteBackedCount: 0,
    incompleteCount: 0,
    preLimitCount: 0,
    notFound: [],
  };

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
    if (articles.length === 0) {
      throw new Error(`No article found for slug "${options.substance}"`);
    }
  } else if (options.slugs?.length) {
    articles = articles.filter((article) => options.slugs.includes(getArticleSlug(article)));
    if (articles.length === 0) {
      throw new Error(`No articles found for slugs: ${options.slugs.join(", ")}`);
    }
    summary.notFound = options.slugs.filter(
      (slug) => !articles.some((article) => getArticleSlug(article) === slug),
    );
  }

  const requestedCount = articles.length;
  articles = articles.filter((article) => pharmacologyQuoteSlugs.has(getArticleSlug(article)));
  summary.quoteBackedCount = articles.length;

  if (!options.includeComplete) {
    summary.incompleteCount = articles.length;
    articles = articles.filter((article) => !hasCompletePharmacology(article));
  }

  summary.preLimitCount = articles.length;
  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return { articles, summary: { ...summary, requestedCount } };
}

export function extractParsedPharmacology(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const root =
    parsed.pharmacology && typeof parsed.pharmacology === "object" && !Array.isArray(parsed.pharmacology)
      ? parsed.pharmacology
      : parsed;

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }

  if (
    root.binding_sites !== undefined ||
    root.receptor_profile !== undefined ||
    root.pharmacodynamics !== undefined ||
    root.summary !== undefined ||
    root.pharmacokinetics !== undefined ||
    root.metabolites !== undefined ||
    root.route_bioavailability !== undefined ||
    root.route_half_life !== undefined
  ) {
    return root;
  }

  return null;
}

export function repairCommonYamlIssues(yamlContent) {
  return yamlContent
    .split(/\r?\n/)
    .map((line) => {
      const quotedScalarMatch = line.match(/^(\s*[^:#][^:]*:\s*)"([^"\n]*)$/);
      if (quotedScalarMatch) {
        return `${quotedScalarMatch[1]}${quotedScalarMatch[2]}`;
      }
      return line;
    })
    .join("\n");
}

export function extractPharmacologyYaml(response) {
  const withoutThinkBlocks = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const yamlMatch = withoutThinkBlocks.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (yamlMatch) {
    return yamlMatch[1].trim();
  }

  const lines = withoutThinkBlocks.split(/\r?\n/);
  const firstRelevantLine = lines.findIndex((line) =>
    /^(pharmacology|pharmacodynamics|summary|binding_sites|mechanism_of_action|receptor_profile|receptor_binding|pharmacokinetics|metabolism|metabolites|route_bioavailability|route_half_life|route_half_life_notes|route_bioavailability_notes)\s*:/i.test(line.trim()),
  );

  if (firstRelevantLine === -1) {
    return withoutThinkBlocks;
  }

  return lines.slice(firstRelevantLine).join("\n").trim();
}

export function parseGeneratedPharmacology(response) {
  const yamlContent = extractPharmacologyYaml(response);
  const parseAttempts = [yamlContent, repairCommonYamlIssues(yamlContent)].filter(
    (content, index, arr) => content && arr.indexOf(content) === index,
  );

  let lastError = null;
  for (const content of parseAttempts) {
    try {
      const parsed = yaml.parse(content, { uniqueKeys: false });
      const pharmacology = extractParsedPharmacology(parsed);
      if (pharmacology) {
        return normalizePharmacologySection(pharmacology);
      }
      lastError = new Error("Invalid pharmacology structure - missing expected fields");
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to parse YAML: ${lastError?.message ?? "Unknown parse failure"}`);
}

function normalizeRouteName(routeName) {
  const normalized = routeName
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const aliases = {
    oral: "oral",
    insufflated: "insufflated",
    intranasal: "insufflated",
    nasal: "insufflated",
    snorted: "insufflated",
    rectal: "rectal",
    intramuscular: "intramuscular",
    im: "intramuscular",
    "i m": "intramuscular",
    intravenous: "intravenous",
    iv: "intravenous",
    "i v": "intravenous",
    sublingual: "sublingual",
  };

  return aliases[normalized] || normalized;
}

function findRoute(routes, routeName) {
  if (!routes || !Array.isArray(routes)) return null;
  const targetRoute = normalizeRouteName(routeName);
  return routes.find((route) => normalizeRouteName(route.route || "") === targetRoute);
}

export function mergeRouteDataIntoDosageDuration(article, pharmacology) {
  const {
    route_bioavailability,
    route_half_life,
    route_bioavailability_notes,
    route_half_life_notes,
  } = pharmacology;

  if (route_bioavailability && article.dosage?.routes) {
    for (const [routeName, value] of Object.entries(route_bioavailability)) {
      const route = findRoute(article.dosage.routes, routeName);
      if (route && value) {
        route.bioavailability = value;
      }
    }
  }

  if (route_bioavailability_notes && article.dosage?.routes) {
    for (const [routeName, value] of Object.entries(route_bioavailability_notes)) {
      const route = findRoute(article.dosage.routes, routeName);
      if (route && value) {
        route.bioavailability_notes = value;
      }
    }
  }

  if (route_half_life && article.duration?.routes) {
    for (const [routeName, value] of Object.entries(route_half_life)) {
      const route = findRoute(article.duration.routes, routeName);
      if (route && value) {
        route.half_life = value;
      }
    }
  }

  if (route_half_life_notes && article.duration?.routes) {
    for (const [routeName, value] of Object.entries(route_half_life_notes)) {
      const route = findRoute(article.duration.routes, routeName);
      if (route && value) {
        route.half_life_notes = value;
      }
    }
  }

  return article;
}
