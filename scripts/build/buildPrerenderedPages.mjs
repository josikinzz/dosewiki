/**
 * Prerendered Pages Generator
 *
 * Generates static HTML pages for each substance with:
 * - Full meta tags (title, description, OG, Twitter)
 * - JSON-LD structured data
 * - Basic content for search engines
 * - Hydration to full React app
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://dose.wiki";

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
 * Escape HTML entities for safe injection.
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate description from article data.
 */
function generateDescription(article) {
  const name = article.identification?.common_name || article.title;
  const parts = [];

  // Add psychoactive class
  const psychoactive = article.classification?.psychoactive_class;
  if (psychoactive && psychoactive.length > 0) {
    parts.push(`${name} is a ${psychoactive.join(", ")}`);
  } else {
    parts.push(`Information about ${name}`);
  }

  // Add chemical class
  const chemical = article.classification?.chemical_class;
  if (chemical && chemical.length > 0) {
    parts.push(`(${chemical.join(", ")})`);
  }

  // Add first route dosage info
  const routes = article.dosage?.routes;
  if (routes && routes.length > 0) {
    const firstRoute = routes[0];
    if (firstRoute.dose_ranges) {
      const ranges = firstRoute.dose_ranges;
      const moderate = ranges.moderate;
      if (moderate && moderate.min && moderate.max && moderate.unit) {
        parts.push(`Moderate dose: ${moderate.min}-${moderate.max} ${moderate.unit} (${firstRoute.route})`);
      }
    }
  }

  return parts.join(". ") + ".";
}

/**
 * Build JSON-LD schema for article.
 */
function buildJsonLd(article, url) {
  const name = article.identification?.common_name || article.title;
  const alternateNames = article.identification?.alternative_names?.filter(n => n?.trim());

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${name} - Dosage, Effects & Safety Information`,
    name,
    alternateName: alternateNames?.length > 0 ? alternateNames : undefined,
    description: generateDescription(article),
    about: {
      "@type": "Drug",
      name,
      alternateName: alternateNames?.length > 0 ? alternateNames : undefined,
      drugClass: article.classification?.psychoactive_class,
      mechanismOfAction: article.pharmacology?.mechanism_of_action?.join("; "),
    },
    publisher: {
      "@type": "Organization",
      name: "dose.wiki",
      url: "https://dose.wiki",
    },
  };
}

/**
 * Format dose range for display.
 */
function formatDoseRange(range) {
  if (!range) return "—";
  if (!range.min && !range.max) return "—";
  if (range.min && range.max && range.unit) {
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min && range.unit) {
    return `${range.min}+ ${range.unit}`;
  }
  return "—";
}

/**
 * Generate basic dosage table HTML.
 */
function generateDosageTable(article) {
  const routes = article.dosage?.routes;
  if (!routes || routes.length === 0) return "";

  const routeRows = routes.map((route) => {
    const ranges = route.dose_ranges || {};
    return `
      <tr>
        <td>${escapeHtml(route.route)}</td>
        <td>${formatDoseRange(ranges.threshold)}</td>
        <td>${formatDoseRange(ranges.light)}</td>
        <td>${formatDoseRange(ranges.moderate)}</td>
        <td>${formatDoseRange(ranges.strong)}</td>
        <td>${formatDoseRange(ranges.heavy)}</td>
      </tr>
    `;
  }).join("");

  return `
    <section>
      <h2>Dosage</h2>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Threshold</th>
            <th>Light</th>
            <th>Moderate</th>
            <th>Strong</th>
            <th>Heavy</th>
          </tr>
        </thead>
        <tbody>
          ${routeRows}
        </tbody>
      </table>
    </section>
  `;
}

/**
 * Generate prerendered HTML page for a substance.
 */
function generatePrerenderedPage(article, indexHtmlTemplate) {
  const name = article.identification?.common_name || article.title;
  const slug = slugify(article.title);
  const url = `${BASE_URL}/${slug}`;
  const description = generateDescription(article);
  const jsonLd = buildJsonLd(article, url);

  // Get classification tags
  const psychoactive = article.classification?.psychoactive_class || [];
  const chemical = article.classification?.chemical_class || [];
  const categories = [...psychoactive, ...chemical].join(", ");

  // Build prerendered content
  const prerenderedContent = `
    <div id="prerendered-content" style="padding: 2rem; max-width: 800px; margin: 0 auto; font-family: system-ui, sans-serif; color: #fff; background: #0f0a1f;">
      <nav><a href="/" style="color: #d946ef;">← dose.wiki</a></nav>
      <h1 style="font-size: 2rem; margin: 1rem 0;">${escapeHtml(name)}</h1>
      ${categories ? `<p style="color: #a855f7;">${escapeHtml(categories)}</p>` : ""}
      <p style="color: rgba(255,255,255,0.8);">${escapeHtml(description)}</p>
      ${generateDosageTable(article)}
      <p style="margin-top: 2rem; color: rgba(255,255,255,0.6); font-size: 0.875rem;">
        Loading full content...
      </p>
    </div>
  `;

  // Replace placeholders in template
  let html = indexHtmlTemplate;

  // Update title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${escapeHtml(name)} - dose.wiki</title>`
  );

  // Update meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escapeHtml(description)}"`
  );

  // Update OG tags
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${escapeHtml(name)} - dose.wiki"`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${escapeHtml(description)}"`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${url}"`
  );

  // Update Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${escapeHtml(name)} - dose.wiki"`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${escapeHtml(description)}"`
  );

  // Update canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${url}"`
  );

  // Add JSON-LD before closing head
  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  html = html.replace("</head>", `${jsonLdScript}\n  </head>`);

  // Add prerendered content before root div
  html = html.replace(
    '<div id="root"></div>',
    `${prerenderedContent}\n    <div id="root"></div>`
  );

  // Add script to hide prerendered content after React loads
  const hideScript = `
    <script>
      // Hide prerendered content when React app mounts
      if (window.requestIdleCallback) {
        requestIdleCallback(function() {
          var pre = document.getElementById('prerendered-content');
          if (pre) pre.style.display = 'none';
        });
      } else {
        setTimeout(function() {
          var pre = document.getElementById('prerendered-content');
          if (pre) pre.style.display = 'none';
        }, 1000);
      }
    </script>
  `;
  html = html.replace("</body>", `${hideScript}\n  </body>`);

  return html;
}

async function main() {
  const articlesPath = path.resolve(__dirname, "../../src/data/SubstanceIndex.json");
  const indexHtmlPath = path.resolve(__dirname, "../../dist/index.html");
  const outputDir = path.resolve(__dirname, "../../dist");

  // Check if dist exists (must run after vite build)
  if (!fs.existsSync(indexHtmlPath)) {
    console.log("Skipping prerender: dist/index.html not found (run after vite build)");
    return;
  }

  // Read articles
  let articles = [];
  try {
    const articlesContent = fs.readFileSync(articlesPath, "utf-8");
    articles = JSON.parse(articlesContent);
  } catch (error) {
    console.warn("Warning: Could not read SubstanceIndex.json");
    return;
  }

  // Read index.html template
  const indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf-8");

  // Filter visible articles
  const visibleArticles = articles.filter((article) => {
    const categories = article.index_categories || [];
    return !categories.some((cat) => cat.toLowerCase().includes("hidden"));
  });

  console.log(`Generating ${visibleArticles.length} prerendered pages...`);

  let generated = 0;
  for (const article of visibleArticles) {
    const slug = slugify(article.title);
    if (!slug) continue;

    const pageHtml = generatePrerenderedPage(article, indexHtmlTemplate);
    const pageDir = path.join(outputDir, slug);
    const pagePath = path.join(pageDir, "index.html");

    // Create directory and write file
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(pagePath, pageHtml, "utf-8");
    generated++;
  }

  console.log(`Generated ${generated} prerendered pages in ${outputDir}`);
}

main().catch((error) => {
  console.error("Error generating prerendered pages:", error);
  process.exit(1);
});
