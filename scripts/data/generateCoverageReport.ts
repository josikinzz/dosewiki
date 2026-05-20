/**
 * Generate Comprehensive Source Coverage Report
 *
 * Outputs markdown tables showing field coverage by source.
 * Run with: npx tsx scripts/data/generateCoverageReport.ts
 */

import { loadData } from "./coverage-report/loader";
import { generateCoverageReport } from "./coverage-report";

function main() {
  console.log(generateCoverageReport(loadData()));
}

main();
