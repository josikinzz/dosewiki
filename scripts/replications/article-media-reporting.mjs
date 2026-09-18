import { groupSkips } from "./article-media-planning.mjs";

export function printPlan(plan, { assetsById }) {
  console.log("\n" + "#".repeat(78));
  console.log("# ARTICLE-EMBEDDED MEDIA -> replications");
  console.log("#".repeat(78));

  console.log(`\n  ${plan.insert.length} row(s) would be inserted.\n`);
  for (const entry of plan.insert) {
    const { row } = entry;
    console.log(`  ${entry.id}  ${row.slug}`);
    console.log(
      `      role=${row.role}  type=${row.type}  format=${row.format}` +
        `  ${row.width ?? "?"}x${row.height ?? "?"}  ${row.file_size ?? "?"} bytes`,
    );
    console.log(`      title      ${JSON.stringify(row.title)}`);
    console.log(`      artist     ${JSON.stringify(row.artist)}`);
    console.log(`      effect     ${row.effect_slug ?? "(none — omitted)"}`);
    if (entry.upload) {
      console.log(
        `      UPLOAD     ${entry.upload.path}  ->  ${entry.upload.contentType}  ` +
          `${entry.upload.bytes ?? "?"} bytes  sha-256 ${entry.upload.sha256}`,
      );
      console.log(`      storage    (assigned by the upload this run performs)`);
    } else {
      console.log(`      storage    ${row.storage_id}`);
    }
    if (row.duration) {
      console.log(`      duration   ${row.duration}s`);
    }
    console.log(`      credit     ${JSON.stringify(row.credit_line)}`);
    for (const field of ["source_url", "rightsholder", "rights_status", "permission_notes"]) {
      if (row[field]) {
        console.log(`      ${field.padEnd(10)} ${JSON.stringify(row[field])}`);
      }
    }
    if (entry.promotion) {
      console.log(`      ruling     ${entry.promotion}`);
    }
    console.log("");
  }

  console.log("=".repeat(78));
  console.log(`= SKIPPED (${plan.skipped.length}), grouped by reason`);
  console.log("=".repeat(78));
  for (const [reason, entries] of groupSkips(plan.skipped)) {
    console.log(`\n  ${reason}  (${entries.length})`);
    for (const entry of entries) {
      const asset = assetsById.get(entry.id);
      console.log(`    ${entry.id}  ${entry.slug}`);
      console.log(`        ${JSON.stringify(asset?.title ?? "")} — ${entry.detail}`);
    }
  }
  console.log("");
}

