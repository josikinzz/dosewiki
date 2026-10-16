import {
  buildCreditLine,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
} from "./article-media-evidence.mjs";

const MIGRATABLE_ROLES = new Set(["replication", "figure"]);

export function selectCandidates(assets, decisions) {
  const rulings = decisions.ownerRulings ?? {};
  const promotedById = new Map((rulings.promoted ?? []).map((entry) => [entry.id, entry]));
  const heldById = new Map();
  for (const group of rulings.heldGroups ?? []) {
    for (const id of group.ids ?? []) {
      heldById.set(id, group);
    }
  }
  const variantById = new Map();
  for (const group of rulings.variantGroups ?? []) {
    for (const id of group.ids ?? []) {
      variantById.set(id, group);
    }
  }
  const droppedById = new Map();
  for (const group of rulings.droppedAssets ?? []) {
    for (const id of group.ids ?? []) {
      droppedById.set(id, group);
    }
  }
  const deadIds = new Set(rulings.deadAssetsLeftDead?.ids ?? []);

  const considered = [];
  const excluded = [];

  for (const asset of assets) {
    const held = heldById.get(asset.id);
    if (held) {
      excluded.push({ asset, reason: `held-group:${held.name}`, detail: held.reason });
      continue;
    }

    const variant = variantById.get(asset.id);
    if (variant && variant.chosen !== asset.id) {
      excluded.push({
        asset,
        reason: `variant-not-chosen:${variant.name}`,
        detail: `${variant.chosen} is the chosen copy of this work. ${variant.reason}`,
      });
      continue;
    }

    const dropped = droppedById.get(asset.id);
    if (dropped) {
      excluded.push({ asset, reason: `owner-dropped:${dropped.name}`, detail: dropped.reason });
      continue;
    }

    const promotion = promotedById.get(asset.id);
    if (promotion) {
      considered.push({ asset, promotion });
      continue;
    }

    if (deadIds.has(asset.id)) {
      excluded.push({
        asset,
        reason: "owner-ruled-dead",
        detail: rulings.deadAssetsLeftDead.$comment,
      });
      continue;
    }

    if (asset.confidence !== "strong") {
      excluded.push({
        asset,
        reason: `confidence:${asset.confidence}`,
        detail: "Only strong entries migrate automatically; the rest are the owner's to rule on.",
      });
      continue;
    }

    if (!MIGRATABLE_ROLES.has(asset.role)) {
      excluded.push({
        asset,
        reason: `role:${asset.role}`,
        detail: "Neither a replication nor a figure, so there is nothing to file it as.",
      });
      continue;
    }

    considered.push({ asset, promotion: null });
  }

  return { considered, excluded };
}

export function planRow({ asset, promotion, facts, decisions }) {
  const rulings = decisions.ownerRulings ?? {};
  const marker = rulings.unknownArtistMarker ?? "Unknown";
  const correction = (rulings.artistCorrections ?? []).find((entry) =>
    (entry.ids ?? []).includes(asset.id),
  );

  if (!facts || (!facts.storageId && !facts.upload)) {
    return { blocked: { reason: "no-storage", detail: "No usable storage object." } };
  }
  if (!facts.reachable) {
    return {
      blocked: {
        reason: "unreachable",
        detail: facts.upload
          ? `The recovered file could not be read: ${facts.error ?? "unknown error"}.`
          : `Production returned ${facts.status} for the asset.`,
      },
    };
  }

  const media = mediaTypeFromContentType(facts.contentType);
  if (!media) {
    return {
      blocked: { reason: "unknown-media-type", detail: `Unhandled content type ${facts.contentType}.` },
    };
  }

  const artist = normalizeArtist(promotion?.artist ?? correction?.artist ?? asset.artist_name, {
    marker,
    aliases: rulings.unknownArtistAliases ?? [],
  });

  const attribution = promotion?.artist ? {} : parseAttribution(asset.attribution);
  if (promotion?.artist && isNamedCreator(artist, marker)) {
    attribution.rightsholder = artist;
  }
  if (!promotion?.artist && correction) {
    attribution.rightsholder = isNamedCreator(artist, marker) ? artist : undefined;
  }
  if (promotion?.source_url) {
    attribution.source_url = promotion.source_url;
  }
  const permissionNotes = [
    promotion?.permission_notes,
    correction ? `Credit corrected: the embed stored "${correction.storedArtist}" as the artist. ${correction.reason}` : null,
    attribution.permission_notes,
  ]
    .filter(Boolean)
    .join(" ");

  const role = promotion?.role ?? asset.role;
  if (!MIGRATABLE_ROLES.has(role)) {
    return {
      blocked: { reason: `role:${role}`, detail: "Neither a replication nor a figure, so there is nothing to file it as." },
    };
  }

  const row = {
    slug: promotion?.slug ?? asset.slug,
    title: String(asset.title ?? "").trim(),
    artist,
    role,
    type: media.type,
    format: media.format,
    storage_id: facts.storageId ?? null,
    credit_line: buildCreditLine(asset.title, artist, marker),
  };

  if (asset.effect_slug) {
    row.effect_slug = asset.effect_slug;
  }
  if (media.type === "video" && Number.isFinite(facts.duration) && facts.duration > 0) {
    row.duration = facts.duration;
  }
  if (Number.isFinite(facts.width) && facts.width > 0) {
    row.width = facts.width;
  }
  if (Number.isFinite(facts.height) && facts.height > 0) {
    row.height = facts.height;
  }
  if (Number.isFinite(facts.size) && facts.size > 0) {
    row.file_size = facts.size;
  }
  if (attribution.source_url) {
    row.source_url = attribution.source_url;
  }
  if (attribution.rightsholder) {
    row.rightsholder = attribution.rightsholder;
  }
  if (attribution.rights_status) {
    row.rights_status = attribution.rights_status;
  }
  if (permissionNotes) {
    row.permission_notes = permissionNotes;
  }

  return { row };
}

export function planMigration({
  assets,
  decisions,
  existingRows,
  effectSlugs,
  facts,
  storageIdsInUse,
}) {
  const { considered, excluded } = selectCandidates(assets, decisions);
  const verifiedDuplicates = new Map(
    (decisions.verifiedDuplicates ?? []).map((entry) => [entry.id, entry]),
  );
  const allowedDuplicateFor = new Map(
    (decisions.ownerRulings?.promoted ?? [])
      .filter((entry) => entry.allowDuplicateOfSlug)
      .map((entry) => [entry.id, entry.allowDuplicateOfSlug]),
  );

  const existingSlugs = new Set(existingRows.map((row) => row.slug));

  const slugOverrides = new Map(
    (decisions.ownerRulings?.promoted ?? [])
      .filter((entry) => entry.slug)
      .map((entry) => [entry.id, entry.slug]),
  );
  const slugOf = (asset) => slugOverrides.get(asset.id) ?? asset.slug;

  const migrationSlugs = new Set(assets.flatMap((asset) => [asset.slug, slugOf(asset)]));

  const rowsByStorageId = new Map();
  const rowsByDigest = new Map();
  for (const row of existingRows) {
    if (!rowsByStorageId.has(row.storage_id)) {
      rowsByStorageId.set(row.storage_id, []);
    }
    rowsByStorageId.get(row.storage_id).push(row);

    const digest = storageIdsInUse.get(row.storage_id);
    if (digest) {
      if (!rowsByDigest.has(digest)) {
        rowsByDigest.set(digest, []);
      }
      rowsByDigest.get(digest).push(row);
    }
  }

  const duplicateAgainst = (matches, effectSlug, allowedAgainst) => {
    const relevant = matches.filter((row) => row.slug !== allowedAgainst);
    const preExisting = relevant.find((row) => !migrationSlugs.has(row.slug));
    if (preExisting) {
      return { row: preExisting, sibling: false };
    }
    const sibling = relevant.find((row) => (row.effect_slug ?? null) === (effectSlug ?? null));
    return sibling ? { row: sibling, sibling: true } : null;
  };

  const insert = [];
  const skipped = [];
  const seenInBatch = new Map();

  for (const entry of excluded) {
    skipped.push({ id: entry.asset.id, slug: entry.asset.slug, reason: entry.reason, detail: entry.detail });
  }

  for (const { asset, promotion } of considered) {
    const assetFacts = facts.get(asset.id) ?? null;
    const targetSlug = slugOf(asset);
    const push = (reason, detail) => skipped.push({ id: asset.id, slug: targetSlug, reason, detail });

    if (existingSlugs.has(targetSlug)) {
      push("already-migrated", `Slug ${targetSlug} is already a row in production.`);
      continue;
    }

    const allowedAgainst = allowedDuplicateFor.get(asset.id);

    const verified = verifiedDuplicates.get(asset.id);
    if (verified && verified.existingSlug !== allowedAgainst) {
      push(
        "duplicate-of-existing",
        `${verified.existingSlug} — ${verified.method} (correlation ${verified.correlation}, rmse ${verified.rmse}). ${verified.note}`,
      );
      continue;
    }

    if (assetFacts?.storageId || assetFacts?.digest) {
      const effectSlug = asset.effect_slug ?? null;
      const byStorage = assetFacts.storageId
        ? duplicateAgainst(
            rowsByStorageId.get(assetFacts.storageId) ?? [],
            effectSlug,
            allowedAgainst,
          )
        : null;
      const byDigest = assetFacts.digest
        ? duplicateAgainst(rowsByDigest.get(assetFacts.digest) ?? [], effectSlug, allowedAgainst)
        : null;
      const match = byStorage ?? byDigest;
      if (match) {
        const how = byStorage
          ? `the same storage object (${assetFacts.storageId})`
          : "identical sha-256 of the stored bytes";
        push(
          match.sibling ? "already-migrated" : "duplicate-of-existing",
          match.sibling
            ? `${match.row.slug} is this migration's own row for the same asset on the same effect — inserted by an earlier batch.`
            : `${match.row.slug} — ${how}.`,
        );
        continue;
      }
    }

    const { row, blocked } = planRow({ asset, promotion, facts: assetFacts, decisions });
    if (blocked) {
      push(blocked.reason, blocked.detail);
      continue;
    }

    if (!row.artist.trim()) {
      push("no-artist", "The mutation requires a non-blank artist and none could be resolved.");
      continue;
    }
    if (row.effect_slug && !effectSlugs.has(row.effect_slug)) {
      push("unknown-effect", `effect_slug ${row.effect_slug} is not a subjectiveEffects row.`);
      continue;
    }

    const batchKey = `${assetFacts.digest ?? assetFacts.storageId}::${row.effect_slug ?? "∅"}`;
    const earlier = seenInBatch.get(batchKey);
    if (earlier) {
      push(
        "duplicate-within-batch",
        `Same asset and same effect as ${earlier.id} (${earlier.slug}), which is already planned. ` +
          "One work, embedded twice into the same article.",
      );
      continue;
    }
    seenInBatch.set(batchKey, { id: asset.id, slug: targetSlug });

    insert.push({
      id: asset.id,
      row,
      promotion: promotion?.reason ?? null,
      upload: assetFacts.upload ?? null,
    });
  }

  return { insert, skipped };
}

export function groupSkips(skipped) {
  const groups = new Map();
  for (const entry of skipped) {
    const key = entry.reason;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return [...groups.entries()].sort((left, right) => right[1].length - left[1].length);
}

