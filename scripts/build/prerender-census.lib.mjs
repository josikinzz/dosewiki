/**
 * Pure helpers for the prerender census (scripts/build/prerender-census.mjs):
 * group a Next prerender manifest's routes into the families a release cares
 * about and format the counts beside the build wrapper's timing record.
 */

/** The manifest route pattern of the substance article page for one locale prefix. */
function substanceRouteFor(pathPrefix) {
  return `${pathPrefix}/[slug]`;
}

/**
 * Route families in print order. `match` receives the manifest's `srcRoute`
 * (the page pattern for a dynamic route, `null` for a fully static page).
 */
export function buildRouteFamilies(publicLocales, localeNames = {}) {
  const families = [
    { key: "substances:en", label: "English substances", match: (src) => src === substanceRouteFor("") },
  ];
  for (const locale of publicLocales) {
    const name = localeNames[locale.code] ?? locale.code;
    families.push({
      key: `substances:${locale.code}`,
      label: `${name} substances`,
      match: (src) => src === substanceRouteFor(locale.pathPrefix),
    });
  }
  families.push(
    { key: "reports", label: "Trip reports", match: (src) => src === "/reports/[slug]" },
    { key: "categories", label: "Substance categories", match: (src) => src === "/category/[categoryKey]" },
    {
      key: "effectCategories",
      label: "Effect categories",
      match: (src) => src === "/effects/category/[categorySlug]",
    },
  );
  return families;
}

/**
 * Count the manifest's prerendered routes per family. Every route lands in
 * exactly one row; the trailing "everything else" row absorbs the rest so the
 * total always equals the manifest's route count.
 */
export function censusFromManifest(manifest, families) {
  const routes = manifest && typeof manifest === "object" ? manifest.routes ?? {} : {};
  const counts = new Map(families.map((family) => [family.key, 0]));
  let other = 0;
  for (const entry of Object.values(routes)) {
    const srcRoute = entry && typeof entry === "object" ? entry.srcRoute ?? null : null;
    const family = families.find((candidate) => candidate.match(srcRoute));
    if (family) counts.set(family.key, counts.get(family.key) + 1);
    else other += 1;
  }
  const rows = families.map((family) => ({ key: family.key, label: family.label, count: counts.get(family.key) }));
  rows.push({ key: "other", label: "Everything else", count: other });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { rows, total };
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "n/a";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, "0")}s (${Math.round(seconds)}s)` : `${Math.round(seconds)}s`;
}

/** Plain text, suitable for pasting into a ticket or a job summary. */
export function formatCensus({ buildDirectory, census, timing }) {
  const width = Math.max(...census.rows.map((row) => row.label.length), "Total".length);
  const lines = [`Prerender census for ${buildDirectory}`, ""];
  for (const row of census.rows) {
    lines.push(`${row.label.padEnd(width)}  ${String(row.count).padStart(6)}`);
  }
  lines.push(`${"Total".padEnd(width)}  ${String(census.total).padStart(6)}`);
  lines.push("");
  if (timing) {
    lines.push(
      `Build wrapper: ${timing.command ?? "unknown command"}`,
      `  surface ${timing.surface ?? "?"}, flavor ${timing.flavor ?? "?"}, exit ${timing.exitStatus ?? "?"}`,
      `  started ${timing.startedAt ?? "?"}`,
      `  ended   ${timing.endedAt ?? "?"}`,
      `  elapsed ${formatSeconds(Number(timing.elapsedSeconds))}`,
    );
  } else {
    lines.push("Build timing: no build-timing.json beside the manifest (the build did not run through bun run build:vercel).");
  }
  return lines.join("\n");
}

/** The record `scripts/deploy/vercel-build.mjs` writes beside the build output. */
export const BUILD_TIMING_FILE = "build-timing.json";
