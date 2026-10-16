#!/usr/bin/env node
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-replication-license";

export const LICENSES = {
  "cc-by-sa-4.0": {
    name: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
    requiresModificationNotice: true,
  },
  "cc-by-4.0": {
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    requiresModificationNotice: true,
  },
  "cc0-1.0": {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    requiresModificationNotice: false,
  },
};

const MODIFICATION_MARKERS = [/upscayl/i, /realesrgan/i, /_x\d+\b/i, /photos_v\d+/i];

export function isModifiedDerivative(replication) {
  const haystack = `${replication.slug ?? ""} ${replication.source_url ?? ""}`;
  return MODIFICATION_MARKERS.some((marker) => marker.test(haystack));
}

export function planLicenseUpdates(replications, { artist, license }) {
  const wanted = artist.trim().toLowerCase();
  const matches = replications.filter(
    (item) => (item.artist ?? "").trim().toLowerCase() === wanted,
  );

  return matches
    .map((replication) => {
      const modified = license.requiresModificationNotice && isModifiedDerivative(replication);
      const baseCredit =
        replication.credit_line?.trim() ||
        `${replication.title} by ${replication.artist}`;

      const NOTE = "Modified from the original (upscaled).";
      const punctuated = /[.!?]$/.test(baseCredit) ? baseCredit : `${baseCredit}.`;
      const creditLine =
        modified && !baseCredit.includes(NOTE) ? `${punctuated} ${NOTE}` : baseCredit;

      const updates = {
        rights_status: "explicit-license",
        license_name: license.name,
        license_url: license.url,
        credit_line: creditLine,
        rightsholder: replication.rightsholder?.trim() || replication.artist,
      };

      const unchanged =
        replication.rights_status === updates.rights_status &&
        replication.license_name === updates.license_name &&
        replication.license_url === updates.license_url &&
        replication.credit_line === updates.credit_line &&
        replication.rightsholder === updates.rightsholder;

      return { slug: replication.slug, title: replication.title, modified, updates, unchanged };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  const artist = readArg("artist");
  const licenseKey = readArg("license");

  if (!artist) throw new Error("Pass --artist=\"<name>\".");
  const license = LICENSES[licenseKey ?? ""];
  if (!license) {
    throw new Error(
      `Pass --license=<${Object.keys(LICENSES).join("|")}>. Received: ${licenseKey ?? "(none)"}`,
    );
  }

  printProductionWriteCommand(command);
  console.log(`Artist: ${artist}`);
  console.log(`Licence: ${license.name} (${license.url})`);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error("Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL).");
  }

  const client = createDataClient({ target: readUrl }).client;
  const replications = await client.query(api.replications.getAll, {});
  const plan = planLicenseUpdates(replications, { artist, license });

  if (plan.length === 0) {
    console.warn(`\nNo replications found with artist exactly "${artist}". Nothing to do.`);
    return;
  }

  const pending = plan.filter((entry) => !entry.unchanged);
  console.log(`\nMatched ${plan.length} replications; ${pending.length} need updating.\n`);

  for (const entry of plan) {
    const flags = [entry.modified ? "modified-derivative" : null, entry.unchanged ? "up-to-date" : null]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${entry.slug}  (${entry.title})${flags ? `  [${flags}]` : ""}`);
  }

  if (command.dryRun) {
    console.log("\nDry run: no writes performed.");
    console.log(
      "Confirm the artist has agreed to this licence before applying: it grants public reuse rights that cannot be revoked retroactively.",
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  let updated = 0;
  for (const entry of pending) {
    const result = await writeClient.mutation(api.replications.updateRightsMetadata, {
      apiKey,
      slug: entry.slug,
      updates: entry.updates,
    });
    if (result.updated) updated += 1;
    console.log(`  licensed ${entry.slug}`);
  }

  console.log(`\nUpdated ${updated} replications to ${license.name}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
