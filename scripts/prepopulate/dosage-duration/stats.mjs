export function countPopulatedArticles(articleList) {
  let withDosage = 0;
  let withDuration = 0;
  let dosageRoutes = 0;
  let durationRoutes = 0;

  for (const article of articleList) {
    if (article.dosage?.routes?.length > 0) {
      withDosage += 1;
      dosageRoutes += article.dosage.routes.length;
    }
    if (article.duration?.routes?.length > 0) {
      withDuration += 1;
      durationRoutes += article.duration.routes.length;
    }
  }

  return { withDosage, withDuration, dosageRoutes, durationRoutes };
}

export function createStats() {
  return {
    articlesProcessed: 0,
    withDosage: 0,
    withDuration: 0,
    dosageRoutes: 0,
    durationRoutes: 0,
    noData: [],
    dosageSources: {},
    durationSources: {},
    skippedNotTargeted: [],
    populatedDosage: [],
    populatedDuration: [],
    overwrittenDosage: [],
    overwrittenDuration: [],
  };
}

export function incrementSourceCounts(bucket, entries) {
  for (const entry of entries) {
    bucket[entry.source] = (bucket[entry.source] || 0) + 1;
  }
}

export function printSummary({
  articles,
  beforeStats,
  afterStats,
  stats,
  dryRun,
  targetSubstances,
  logger = console,
  verbose = false,
}) {
  logger.log("\n" + "=".repeat(60));
  logger.log("DOSAGE & DURATION PREPOPULATION");
  logger.log("=".repeat(60));

  logger.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "OVERRIDE MODE (replacing dosage/duration)"}`);
  logger.log("Selection: Dosage = SAFEST (lowest upper bound) | Duration = Priority (PW > Erowid > TripSit)");

  if (targetSubstances) {
    logger.log(`Targeting: ${targetSubstances.join(", ")}`);
  }

  logger.log(`\n--- Coverage Metrics ---`);
  logger.log(`  Articles with dosage:    ${beforeStats.withDosage} → ${afterStats.withDosage} (+${afterStats.withDosage - beforeStats.withDosage})`);
  logger.log(`  Articles with duration:  ${beforeStats.withDuration} → ${afterStats.withDuration} (+${afterStats.withDuration - beforeStats.withDuration})`);
  logger.log(`  Total dosage routes:     ${beforeStats.dosageRoutes} → ${afterStats.dosageRoutes} (+${afterStats.dosageRoutes - beforeStats.dosageRoutes})`);
  logger.log(`  Total duration routes:   ${beforeStats.durationRoutes} → ${afterStats.durationRoutes} (+${afterStats.durationRoutes - beforeStats.durationRoutes})`);
  logger.log(`  Dosage coverage:         ${((afterStats.withDosage / articles.length) * 100).toFixed(1)}%`);
  logger.log(`  Duration coverage:       ${((afterStats.withDuration / articles.length) * 100).toFixed(1)}%`);

  logger.log(`\n--- Processing Summary ---`);
  logger.log(`  Total articles:                 ${stats.articlesProcessed}`);
  logger.log(`  Newly populated with dosage:    ${stats.populatedDosage.length}`);
  logger.log(`  Overwritten dosage:             ${stats.overwrittenDosage.length}`);
  logger.log(`  Newly populated with duration:  ${stats.populatedDuration.length}`);
  logger.log(`  Overwritten duration:           ${stats.overwrittenDuration.length}`);
  logger.log(`  No parsed data available:       ${stats.noData.length}`);
  if (targetSubstances) {
    logger.log(`  Skipped (not in target list):   ${stats.skippedNotTargeted.length}`);
  }

  if (stats.dosageRoutes > 0 || stats.durationRoutes > 0) {
    logger.log(`\n--- Routes Created ---`);
    logger.log(`  Dosage routes:        ${stats.dosageRoutes}`);
    logger.log(`  Duration routes:      ${stats.durationRoutes}`);
    if (stats.withDosage > 0) {
      logger.log(`  Avg dosage routes:    ${(stats.dosageRoutes / stats.withDosage).toFixed(2)} per substance`);
    }
    if (stats.withDuration > 0) {
      logger.log(`  Avg duration routes:  ${(stats.durationRoutes / stats.withDuration).toFixed(2)} per substance`);
    }
  }

  if (Object.keys(stats.dosageSources).length > 0) {
    logger.log(`\n--- Dosage Sources Used ---`);
    const sortedDosageSources = Object.entries(stats.dosageSources).sort((a, b) => b[1] - a[1]);
    for (const [src, count] of sortedDosageSources) {
      logger.log(`  ${src}: ${count} routes`);
    }
  }

  if (Object.keys(stats.durationSources).length > 0) {
    logger.log(`\n--- Duration Sources Used ---`);
    const sortedDurationSources = Object.entries(stats.durationSources).sort((a, b) => b[1] - a[1]);
    for (const [src, count] of sortedDurationSources) {
      logger.log(`  ${src}: ${count} routes`);
    }
  }

  if (!verbose) return;

  if (stats.overwrittenDosage.length > 0) {
    logger.log(`\n--- Overwritten Dosage (${stats.overwrittenDosage.length}) ---`);
    stats.overwrittenDosage.slice(0, 20).forEach((name) => logger.log(`  🔄 ${name}`));
    if (stats.overwrittenDosage.length > 20) {
      logger.log(`  ... and ${stats.overwrittenDosage.length - 20} more`);
    }
  }

  if (stats.populatedDosage.length > 0) {
    logger.log(`\n--- Newly Populated with Dosage (${stats.populatedDosage.length}) ---`);
    stats.populatedDosage.slice(0, 20).forEach((name) => logger.log(`  ✅ ${name}`));
    if (stats.populatedDosage.length > 20) {
      logger.log(`  ... and ${stats.populatedDosage.length - 20} more`);
    }
  }

  if (stats.noData.length > 0) {
    logger.log(`\n--- No Parsed Data (${stats.noData.length}) ---`);
    stats.noData.slice(0, 20).forEach((name) => logger.log(`  - ${name}`));
    if (stats.noData.length > 20) {
      logger.log(`  ... and ${stats.noData.length - 20} more`);
    }
  }
}
