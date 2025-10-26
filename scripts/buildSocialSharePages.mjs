import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ARTICLES_PATH = resolve(ROOT, "src/data/articles.json");
const SHARE_OUTPUT_DIR = resolve(ROOT, "public/share");
const SHARE_IMAGE_PATH = "/embed-logo.webp";
const SHARE_IMAGE_ALT = "dose.wiki logo";
const BASE_URL = (process.env.DOSEWIKI_BASE_URL || "https://dose.wiki").replace(/\/$/, "");

const DOSAGE_KEY_ORDER = [
  "micro",
  "microdose",
  "threshold",
  "light",
  "common",
  "strong",
  "heavy",
  "heroic",
];

const DURATION_KEY_ORDER = [
  "onset",
  "come_up",
  "peak",
  "offset",
  "comedown",
  "after_effects",
  "total_duration",
];

const DURATION_LABELS = {
  onset: "Onset",
  come_up: "Come-up",
  peak: "Peak",
  offset: "Offset",
  comedown: "Come-down",
  after_effects: "After effects",
  total_duration: "Total duration",
};

const cleanString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeKey = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
};

const normalizeRouteLabel = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const slugifyDrugName = (name, fallback) => {
  const normalized = normalizeKey(name);
  if (normalized) {
    return normalized;
  }
  const fallbackNormalized = normalizeKey(fallback);
  return fallbackNormalized || "article";
};

const parseIndexCategoryTokens = (value) => {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/[;,/\n]+/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatDoseValue = (value) => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  if (typeof value === "object") {
    const segments = Object.entries(value)
      .map(([key, nested]) => {
        if (nested == null) {
          return undefined;
        }
        const nestedValue = String(nested).trim();
        if (!nestedValue) {
          return undefined;
        }
        const label = key.replace(/[_-]+/g, " ").trim();
        return label ? `${label} ${nestedValue}` : nestedValue;
      })
      .filter((segment) => Boolean(segment));
    return segments.join(" / ") || undefined;
  }

  return undefined;
};

const formatDoseSummary = (doseRanges) => {
  if (!doseRanges || typeof doseRanges !== "object") {
    return undefined;
  }

  const seen = new Set();
  const orderedKeys = [
    ...DOSAGE_KEY_ORDER,
    ...Object.keys(doseRanges).filter((key) => !DOSAGE_KEY_ORDER.includes(key)),
  ];

  const entries = [];
  for (const key of orderedKeys) {
    const value = formatDoseValue(doseRanges[key]);
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const label = key
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    entries.push(`${label} ${value}`.trim());
  }

  if (entries.length === 0) {
    return undefined;
  }

  return entries.slice(0, 4).join("; ");
};

const formatDurationSummary = (duration, routeLabel) => {
  const stageMap = resolveDurationStages(duration, routeLabel);
  const segments = [];
  for (const key of DURATION_KEY_ORDER) {
    const value = cleanString(stageMap[key]);
    if (!value) {
      continue;
    }
    const label = DURATION_LABELS[key] ?? key;
    segments.push(`${label} ${value}`.trim());
  }
  if (segments.length === 0) {
    return undefined;
  }
  return segments.slice(0, 4).join("; ");
};

const resolveDurationStages = (duration, routeLabel) => {
  if (!duration || typeof duration !== "object") {
    return {};
  }

  const normalizeStages = (source) => {
    const map = {};
    if (!source || typeof source !== "object") {
      return map;
    }
    for (const key of Object.keys(DURATION_LABELS)) {
      const value = cleanString(source[key]);
      if (value) {
        map[key] = value;
      }
    }
    return map;
  };

  const tryRouteMatch = () => {
    const routes = Array.isArray(duration.routes_of_administration)
      ? duration.routes_of_administration
      : [];
    if (routes.length === 0) {
      return undefined;
    }

    const normalizedTarget = normalizeRouteLabel(routeLabel ?? "");
    const fallback = routes[0];

    const match = normalizedTarget
      ? routes.find((entry) => {
          const entryRoute = cleanString(entry?.route);
          if (entryRoute && normalizeRouteLabel(entryRoute) === normalizedTarget) {
            return true;
          }
          const canonical = Array.isArray(entry?.canonical_routes) ? entry.canonical_routes : [];
          return canonical.some((option) => normalizeRouteLabel(option) === normalizedTarget);
        })
      : undefined;

    return normalizeStages((match ?? fallback)?.stages);
  };

  if ("routes_of_administration" in duration || "general" in duration) {
    const routeStages = tryRouteMatch();
    if (routeStages && Object.keys(routeStages).length > 0) {
      return routeStages;
    }
    const generalStages = normalizeStages(duration.general);
    if (Object.keys(generalStages).length > 0) {
      return generalStages;
    }
    return {};
  }

  return normalizeStages(duration);
};

const truncate = (value, limit = 280) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
};

const buildDescription = (categories, routeLabel, units, dosage, duration) => {
  const segments = [];
  if (categories.length > 0) {
    segments.push(`Categories: ${categories.join(" · ")}`);
  }

  const routeParts = [];
  if (routeLabel) {
    routeParts.push(units ? `${routeLabel} (${units})` : routeLabel);
  }
  if (dosage) {
    routeParts.push(`Dosage ${dosage}`);
  }
  if (duration) {
    routeParts.push(`Duration ${duration}`);
  }
  if (routeParts.length > 0) {
    segments.push(routeParts.join(" — "));
  }

  if (segments.length === 0) {
    return "Detailed dosing guidance from dose.wiki.";
  }

  return truncate(segments.join(" | "));
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const ensureShareDir = async () => {
  await rm(SHARE_OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(SHARE_OUTPUT_DIR, { recursive: true });
};

const buildShareHtml = ({
  title,
  description,
  imageUrl,
  imageAlt,
  appUrl,
  redirectPath,
}) => {
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedImage = escapeHtml(imageUrl);
  const escapedAppUrl = escapeHtml(appUrl);
  const escapedImageAlt = escapeHtml(imageAlt);
  const escapedRedirect = escapeHtml(redirectPath);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="robots" content="noindex, follow" />
    <meta name="description" content="${escapedDescription}" />
    <link rel="canonical" href="${escapedAppUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="dose.wiki" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${escapedAppUrl}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:alt" content="${escapedImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <meta http-equiv="refresh" content="0; url=${escapedRedirect}" />
  </head>
  <body style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background:#0f0a1f; color:#fafafa; display:flex; align-items:center; justify-content:center; min-height:100vh;">
    <p style="font-size:16px; line-height:1.5; text-align:center; max-width:480px; padding:24px;">
      Redirecting to dose.wiki… If you are not redirected automatically,
      <a href="${escapedRedirect}" style="color:#f472d0;">open the substance page</a>.
    </p>
    <script>window.location.replace('${escapedRedirect}');</script>
  </body>
</html>
`;
};

const buildShareEntries = async () => {
  const articles = await readJson(ARTICLES_PATH);
  const entries = [];

  for (const article of articles) {
    const info = article?.drug_info;
    if (!info) {
      continue;
    }

    const rawIndexCategory = cleanString(article?.["index-category"]);
    const normalizedIndexCategories = parseIndexCategoryTokens(rawIndexCategory ?? "");
    if (normalizedIndexCategories.includes("hidden")) {
      continue;
    }

    const substitutiveName = cleanString(info.substitutive_name);
    const iupacName = cleanString(info.IUPAC_name);
    const botanicalName = cleanString(info.botanical_name);
    const drugName = cleanString(info.drug_name);
    const titleName = cleanString(article?.title);

    const candidateNames = [drugName, titleName, substitutiveName, iupacName, botanicalName].filter(Boolean);
    const preferredName = candidateNames.find((value) => !value.includes("("));
    const baseName = preferredName ?? candidateNames[0];
    if (!baseName) {
      continue;
    }

    const id = typeof article?.id === "number" ? article.id : null;
    const fallback = id !== null ? `article-${id}` : baseName;
    const slug = slugifyDrugName(baseName, fallback);

    const categories = Array.isArray(info.categories)
      ? info.categories.map((entry) => cleanString(entry)).filter(Boolean)
      : [];

    const routeDefinitions = Array.isArray(info?.dosages?.routes_of_administration)
      ? info.dosages.routes_of_administration
      : [];
    const primaryRoute = routeDefinitions.find((route) => cleanString(route?.route)) ?? routeDefinitions[0];
    const routeLabel = cleanString(primaryRoute?.route);
    const routeUnits = cleanString(primaryRoute?.units);
    const dosageSummary = primaryRoute ? formatDoseSummary(primaryRoute.dose_ranges) : undefined;
    const durationSummary = formatDurationSummary(info?.duration, routeLabel);

    const description = buildDescription(categories.slice(0, 4), routeLabel, routeUnits, dosageSummary, durationSummary);
    const redirectPath = `/#/substance/${slug}`;
    const appUrl = `${BASE_URL}/${redirectPath.replace(/^\//, "")}`;

    const imageUrl = `${BASE_URL}${SHARE_IMAGE_PATH}`;
    const imageAlt = SHARE_IMAGE_ALT;

    entries.push({
      slug,
      html: buildShareHtml({
        title: `${baseName} • dose.wiki`,
        description,
        imageUrl,
        imageAlt,
        appUrl,
        redirectPath,
      }),
    });
  }

  return entries;
};

const main = async () => {
  await ensureShareDir();
  const entries = await buildShareEntries();
  let total = 0;
  for (const entry of entries) {
    if (!entry.slug) {
      continue;
    }
    const outputDir = join(SHARE_OUTPUT_DIR, entry.slug);
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "index.html"), entry.html, "utf8");
    total += 1;
  }
  console.log(`Generated ${total} social share pages in ${SHARE_OUTPUT_DIR}`);
};

main().catch((error) => {
  console.error("Failed to build social share pages:", error);
  process.exit(1);
});
