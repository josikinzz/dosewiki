#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  normalizeProfileAliases,
  normalizeProfileKey,
} from "../../lib/contributorProfileIdentity";
import {
  MANIFEST_PATH as ARTWORK_MANIFEST_PATH,
  installAvatarFile,
  writePreviewAvatarFile,
  writeProvenanceManifest,
} from "./generate-avatar-files";
import {
  avatarOnlyImportRow,
  importRowDiff,
  projectedStoredProfile,
} from "./generate-avatar-import-policy";
import type { StoredContributorProfile } from "./generate-avatar-import-policy";
import {
  buildWildAvatarPlan,
  MIN_SOURCE_SHORT_SIDE,
  type Finding,
  type PlanEntry,
  type ProfileRow,
  type ReplicationRow,
} from "./import-wild-avatar-plan";
import {
  fetchBytes,
  needsAttentionCrop,
  orientImage,
  renderAvatar,
  renderAvatarAttention,
} from "./generate-avatar-media";
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "import-wild-avatars";

const REPLICATION_ARTIST_ROLE = "Replication Artist";

function log(message = "") {
  console.log(message);
}

export async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);
  const writeCredential = command.writeRequested ? requireProductionWriteCredential("profileMediaWrite") : null;

  const argv = process.argv.slice(2);
  const flag = (name: string) =>
    argv
      .find((argument) => argument.startsWith(`--${name}=`))
      ?.slice(name.length + 3);

  const findingsPath = flag("findings");
  if (!findingsPath) {
    throw new Error(
      "Pass --findings=<path> pointing at the research findings JSON.",
    );
  }
  const wildManifestPath = flag("manifest");
  if (!wildManifestPath) {
    throw new Error(
      "Pass --manifest=<path> pointing at the wild avatar provenance manifest " +
        "(created on the first write run; read back on every later one).",
    );
  }
  const previewDir = flag("preview-dir");

  const cacheDir = flag("cache-dir");
  const fetchSource = async (url: string): Promise<Buffer> => {
    if (!cacheDir) return await fetchBytes(url);
    const file = path.join(
      cacheDir,
      `${createHash("sha256").update(url).digest("hex")}.bin`,
    );
    if (fs.existsSync(file)) return fs.readFileSync(file);
    const bytes = await fetchBytes(url);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, bytes);
    return bytes;
  };

  const parsed = JSON.parse(fs.readFileSync(findingsPath, "utf8"));
  const findings: Finding[] = Array.isArray(parsed) ? parsed : parsed.findings;
  if (!Array.isArray(findings)) {
    throw new Error(
      "The findings file must be an array or { findings: [...] }.",
    );
  }

  const mergesPath = flag("merges");
  const mergeGroups: string[][] = mergesPath
    ? (JSON.parse(fs.readFileSync(mergesPath, "utf8")).merges ?? []).map(
        (group: { creditLines: string[] }) => group.creditLines,
      )
    : [];

  const client = createDataClient({ target: resolvePostgresSource().url }).client;
  const [profiles, replications] = (await Promise.all([
    client.query(api.contributorProfiles.getAll, {}),
    client.query(api.replications.getAll, {}),
  ])) as [ProfileRow[], ReplicationRow[]];

  const artworkManifest = JSON.parse(
    fs.readFileSync(ARTWORK_MANIFEST_PATH, "utf8"),
  );
  const artworkKeys = new Set<string>(
    (artworkManifest.avatars ?? []).map((entry: { profileKey: string }) =>
      normalizeProfileKey(entry.profileKey),
    ),
  );

  const wildKeys = new Set<string>(
    fs.existsSync(wildManifestPath)
      ? (
          JSON.parse(fs.readFileSync(wildManifestPath, "utf8")).avatars ?? []
        ).map((entry: { profileKey: string }) =>
          normalizeProfileKey(entry.profileKey),
        )
      : [],
  );

  const { plan: resolved, skipped } = buildWildAvatarPlan({
    findings,
    profiles,
    replications,
    artworkKeys,
    mergeGroups,
  });

  const replacesChosen = argv.includes("--replace-chosen-avatars");
  const plan = resolved.filter((entry) => {
    const foreign =
      entry.replaces === "other-image" && !wildKeys.has(entry.key);
    if (!foreign || replacesChosen) return true;
    skipped.push({
      finding: entry.finding,
      reason: `${entry.key} already has a chosen avatar (${entry.profile?.avatarUrl}); pass --replace-chosen-avatars to override`,
    });
    return false;
  });

  log();
  log(
    `Findings: ${findings.length}. Installing ${plan.length}, skipping ${skipped.length}.`,
  );
  log(
    `Of the installs: ${plan.filter((entry) => entry.replaces === "artwork-cut").length} replace an artwork crop, ` +
      `${plan.filter((entry) => entry.replaces === "other-image").length} replace another image, ` +
      `${plan.filter((entry) => entry.replaces === "monogram").length} replace a monogram ` +
      `(${plan.filter((entry) => !entry.profile).length} of those need a new profile row).`,
  );

  const consolidations = plan.filter(
    (entry) => entry.consolidated.length > 1 || entry.aliasesToAdd.length > 0,
  );
  if (consolidations.length > 0) {
    log();
    log("CONSOLIDATED - one artist who was credited under more than one name:");
    for (const entry of consolidations) {
      log(
        `  ${entry.key.padEnd(24)} "${entry.displayName}" <- ${entry.consolidated
          .map((line) => `"${line}"`)
          .join(
            ", ",
          )}   alias(es) added: ${entry.aliasesToAdd.join(", ") || "none"}`,
      );
    }
    log(
      "  Each of these becomes ONE profile: the spellings above resolve to it, so both " +
        "gallery groups show the same artist instead of two half-identities.",
    );
  }

  log();
  log("SKIPPED:");
  for (const { finding, reason } of skipped) {
    log(
      `  ${finding.artist.padEnd(30)} ${reason}${finding.evidence ? ` - ${finding.evidence}` : ""}`,
    );
  }

  const rendered = new Map<
    string,
    {
      bytes: Buffer;
      size: number;
      sourceWidth: number;
      sourceHeight: number;
      crop: "attention" | "centre-square";
    }
  >();
  const failed: Array<{ entry: PlanEntry; error: string }> = [];

  log();
  log("FETCHING:");
  for (const entry of plan) {
    try {
      const raw = await fetchSource(entry.finding.imageUrl as string);
      const oriented = await orientImage(raw);
      const shortSide = Math.min(
        oriented.dimensions.width,
        oriented.dimensions.height,
      );
      if (shortSide < MIN_SOURCE_SHORT_SIDE) {
        skipped.push({
          finding: entry.finding,
          reason: `source only ${oriented.dimensions.width}x${oriented.dimensions.height}, under the ${MIN_SOURCE_SHORT_SIDE}px floor`,
        });
        log(
          `  ${entry.key.padEnd(24)} TOO SMALL: ${oriented.dimensions.width}x${oriented.dimensions.height} - keeping what it has`,
        );
        continue;
      }
      const attention = needsAttentionCrop(oriented.dimensions);
      const avatar = attention
        ? await renderAvatarAttention(oriented.bytes, oriented.dimensions)
        : await renderAvatar(oriented.bytes, oriented.dimensions);
      rendered.set(entry.key, {
        bytes: avatar.bytes,
        size: avatar.size,
        sourceWidth: oriented.dimensions.width,
        sourceHeight: oriented.dimensions.height,
        crop: attention ? "attention" : "centre-square",
      });
      log(
        `  ${entry.key.padEnd(24)} ${oriented.dimensions.width}x${oriented.dimensions.height} -> ` +
          `${avatar.size}px ${attention ? "attention" : "centre"}, ${avatar.bytes.length} bytes  (${entry.finding.platform ?? "?"})`,
      );
    } catch (error) {
      failed.push({
        entry,
        error: error instanceof Error ? error.message : String(error),
      });
      log(
        `  ${entry.key.padEnd(24)} FAILED: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const installable = plan.filter((entry) => rendered.has(entry.key));

  if (previewDir) {
    for (const entry of installable) {
      writePreviewAvatarFile(previewDir, entry.key, rendered.get(entry.key)!.bytes);
    }
    log();
    log(
      `Wrote ${installable.length} preview avatar(s) to ${previewDir}. Nothing else was touched.`,
    );
  }

  const newProfiles = installable.filter((entry) => !entry.profile);
  const existingProfiles = installable.filter((entry) => entry.profile);

  log();
  log("PROFILE WRITES:");
  for (const entry of existingProfiles) {
    log(
      `  update ${entry.key.padEnd(24)} ${entry.profile?.avatarUrl ?? "(none)"} -> ${entry.avatarUrl}`,
    );
  }
  for (const entry of newProfiles) {
    log(
      `  create ${entry.key.padEnd(24)} "${entry.displayName}" role="${REPLICATION_ARTIST_ROLE}" avatar=${entry.avatarUrl}`,
    );
  }
  log();
  log(
    "Each update is checked field-by-field against its raw stored row at write time; " +
      "anything that would move more than avatarUrl aborts the run.",
  );

  if (command.dryRun) {
    log();
    log("Dry run. Re-run with --write and the confirmation flags to apply.");
    if (failed.length > 0) {
      log(
        `${failed.length} finding(s) could not be fetched; they are listed above.`,
      );
    }
    return;
  }

  const apiKey = writeCredential.token;

  for (const entry of installable) {
    installAvatarFile(entry.key, rendered.get(entry.key)!.bytes, {
      overwrite: true,
    });
  }

  const generatedAt = new Date().toISOString();
  const wildEntries = installable.map((entry) => {
    const render = rendered.get(entry.key)!;
    return {
      profileKey: entry.key,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      source: {
        platform: entry.finding.platform ?? null,
        sourcePage: entry.finding.sourcePage ?? null,
        imageUrl: entry.finding.imageUrl,
        evidence: entry.finding.evidence,
        license: entry.finding.license ?? null,
        confidence: entry.finding.confidence,
        sourceWidth: render.sourceWidth,
        sourceHeight: render.sourceHeight,
      },
      replaced: entry.replaces,
      creditLines: entry.consolidated,
      aliasesAdded: entry.aliasesToAdd,
      output: {
        width: render.size,
        height: render.size,
        format: "webp",
        crop: render.crop,
        bytes: render.bytes.length,
      },
      fetchedAt: generatedAt,
    };
  });

  writeProvenanceManifest(wildManifestPath, {
    note:
      "Provenance for every contributor avatar taken from the picture the artist publishes " +
      "of themselves, by scripts/contributors/import-avatars-from-the-wild.ts. Each entry " +
      "names the account the image came from and the evidence that the account is the " +
      "credited artist's, plus every credit line consolidated onto that one identity. " +
      "Delivered at 256x256 WebP or the source's short side when smaller; nothing is " +
      "upscaled. Off-square sources are cropped where the content is rather than dead " +
      "centre, so a tall portrait keeps its face. The image remains the artist's; this " +
      "file is the record of where each one came from and what to remove on request.",
    generatedAt,
    avatars: wildEntries.sort((left, right) =>
      left.profileKey.localeCompare(right.profileKey),
    ),
  });

  const replacedKeys = new Set(installable.map((entry) => entry.key));
  const survivingArtwork = (artworkManifest.avatars ?? []).filter(
    (entry: { profileKey: string }) =>
      !replacedKeys.has(normalizeProfileKey(entry.profileKey)),
  );
  writeProvenanceManifest(ARTWORK_MANIFEST_PATH, {
    ...artworkManifest,
    avatars: survivingArtwork,
  });

  const writeClient = createDataClient({ target: command.targetUrl }).client;

  const rawRows = (await writeClient.query(
    api.contributorProfiles.getForBulkImport,
    {
      apiKey,
      keys: existingProfiles.map((entry) => entry.key),
    },
  )) as StoredContributorProfile[];
  const rawByKey = new Map(
    rawRows.map((raw) => [normalizeProfileKey(raw.key), raw]),
  );

  const rows = [
    ...existingProfiles.map((entry) => {
      const raw = rawByKey.get(entry.key);
      if (!raw) {
        throw new Error(
          `Profile ${entry.key} vanished between planning and writing; re-run to re-plan.`,
        );
      }

      const intendedAliases = [...(raw.aliases ?? []), ...entry.aliasesToAdd];
      const row = {
        ...avatarOnlyImportRow(raw, entry.avatarUrl),
        aliases: intendedAliases,
      };
      const projected = projectedStoredProfile(row) as { aliases?: string[] };
      const diff = importRowDiff(raw as object, projected as object);
      const allowed = new Set(["avatarUrl", "aliases"]);
      const disallowed = diff.filter((field) => !allowed.has(field));
      if (disallowed.length > 0) {
        throw new Error(
          `Refusing to write ${entry.key}: the import row would change ${disallowed.join(", ")}, ` +
            "which this run is not allowed to touch.",
        );
      }
      if (diff.includes("aliases")) {
        const expected = JSON.stringify(
          normalizeProfileAliases(intendedAliases),
        );
        if (JSON.stringify(projected.aliases ?? []) !== expected) {
          throw new Error(
            `Refusing to write ${entry.key}: the stored alias list would not be the planned one.`,
          );
        }
      }
      return row;
    }),
    ...newProfiles.map((entry) => ({
      key: entry.key,
      displayName: entry.displayName,
      aliases: entry.aliasesToAdd,
      bio: "",
      links: [],
      role: REPLICATION_ARTIST_ROLE,
      avatarUrl: entry.avatarUrl,
    })),
  ];

  const result = await writeClient.mutation(
    api.contributorProfiles.bulkImport,
    {
      apiKey,
      profiles: rows,
    },
  );

  log();
  log(`Profile write: created ${result.created}, updated ${result.updated}.`);
  log(
    `Wrote ${installable.length} avatar file(s), ${wildEntries.length} manifest entr(ies).`,
  );
  log(
    `Artwork provenance kept ${survivingArtwork.length} of ${(artworkManifest.avatars ?? []).length} entries.`,
  );
  if (failed.length > 0) {
    log(
      `${failed.length} finding(s) could not be fetched and were not installed.`,
    );
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1] === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
