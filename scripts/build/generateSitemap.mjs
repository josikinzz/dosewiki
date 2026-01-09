/**
 * Sitemap Generator
 *
 * Generates sitemap.xml from articles.json and static routes.
 * Run this as part of the build process.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://dose.wiki";

// Static routes that should be included in the sitemap
const STATIC_ROUTES = [
  "/",
  "/substances",
  "/effects",
  "/interactions",
  "/about",
];

// Routes to exclude from sitemap
const EXCLUDED_PATTERNS = [
  /^\/dev/,      // Developer tools
  /^\/share/,    // Share redirect pages
];

/**
 * Slugify a string for URL generation.
 */
function slugify(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate XML sitemap content.
 */
function generateSitemapXml(urls) {
  const urlEntries = urls
    .map((url) => {
      const priority = url === "/" ? "1.0" : url === "/substances" ? "0.9" : "0.7";
      return `  <url>
    <loc>${BASE_URL}${url}</loc>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

async function main() {
  const articlesPath = path.resolve(__dirname, "../../src/data/articles.json");
  const outputPath = path.resolve(__dirname, "../../public/sitemap.xml");

  // Read articles
  let articles = [];
  try {
    const articlesContent = fs.readFileSync(articlesPath, "utf-8");
    articles = JSON.parse(articlesContent);
  } catch (error) {
    console.warn("Warning: Could not read articles.json, generating sitemap with static routes only");
  }

  // Generate substance URLs
  const substanceUrls = articles
    .filter((article) => {
      // Skip hidden articles
      const categories = article.index_categories || [];
      return !categories.some((cat) =>
        cat.toLowerCase().includes("hidden")
      );
    })
    .map((article) => {
      const slug = slugify(article.title);
      return `/${slug}`;
    })
    .filter((url) => url && url.length > 1);

  // Combine all URLs
  const allUrls = [
    ...STATIC_ROUTES,
    ...substanceUrls,
  ];

  // Filter out excluded patterns
  const filteredUrls = allUrls.filter((url) =>
    !EXCLUDED_PATTERNS.some((pattern) => pattern.test(url))
  );

  // Remove duplicates
  const uniqueUrls = [...new Set(filteredUrls)];

  // Sort URLs
  uniqueUrls.sort((a, b) => {
    // Root first
    if (a === "/") return -1;
    if (b === "/") return 1;
    // Then static routes
    const aStatic = STATIC_ROUTES.includes(a);
    const bStatic = STATIC_ROUTES.includes(b);
    if (aStatic && !bStatic) return -1;
    if (!aStatic && bStatic) return 1;
    // Then alphabetically
    return a.localeCompare(b);
  });

  // Generate sitemap XML
  const sitemapXml = generateSitemapXml(uniqueUrls);

  // Write sitemap
  fs.writeFileSync(outputPath, sitemapXml, "utf-8");

  console.log(`Generated sitemap with ${uniqueUrls.length} URLs at ${outputPath}`);
}

main().catch((error) => {
  console.error("Error generating sitemap:", error);
  process.exit(1);
});
