import {
  buildCreditLine,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
} from "./article-media-evidence.mjs";

/** Roles this migration knows how to file. `unclear` is nobody's decision to make here. */
const MIGRATABLE_ROLES = new Set(["replication", "figure"]);

/**
 * Which entries this run is even willing to consider.
 *
 * `strong` plus a filable role, widened by the owner's explicit rulings and
 * narrowed by the groups the owner has held back, dropped, or resolved in
 * favour of one variant. Everything else is reported under the reason it was
 * left alone.
 *
 * Every exclusion is tested before the promotion, because round two promotes
 * both halves of a variant pair: the losing half carries a ruling of its own and
 * must still be excluded by it.
 */
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

    // Two storage objects of one work, which the batch collapse cannot settle
    // because the bytes genuinely differ. The owner picks the copy to publish.
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

/**
 * Turn one considered entry into the exact `insertMediaAsset` arguments.
 *
 * `facts` is what production said about the asset — its resolved storage id,
 * content type, byte length, digest and pixel dimensions — never what the
 * inventory claimed. For a recovered asset there is no production object yet, so
 * the facts come from the local file's own bytes instead and `storage_id` is
 * left null for the write phase to fill in from the upload it performs.
 * Returns `{ row }` or `{ blocked }`.
 */
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

  // A ruling that names the artist settles the credit, so the attribution prose
  // it overrides must not follow it in through the back door. A023's text says
  // "(rightsholder Oracle Emissary…)" — carrying that across would restore in a
  // rights column exactly the credit the owner just ruled against.
  const attribution = promotion?.artist ? {} : parseAttribution(asset.attribution);
  if (promotion?.artist && isNamedCreator(artist, marker)) {
    attribution.rightsholder = artist;
  }
  if (!promotion?.artist && correction) {
    attribution.rightsholder = isNamedCreator(artist, marker) ? artist : undefined;
  }
  // Where the bytes were found. A recovered asset's attribution prose says only
  // that the original host is gone, so without this the one link that still
  // resolves — the archive or wiki copy the file actually came from — would be
  // the one fact the migration threw away.
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

  // A ruling may restate the role — the out-of-body stock composite is filed
  // `unclear` by the curation pass and figure by the owner — but it may not
  // invent one the table has no shelf for.
  const role = promotion?.role ?? asset.role;
  if (!MIGRATABLE_ROLES.has(role)) {
    return {
      blocked: { reason: `role:${role}`, detail: "Neither a replication nor a figure, so there is nothing to file it as." },
    };
  }

  const row = {
    // Several rulings collapse two or three embeds into one row, and the
    // curation slugs carry the embed's position — `-description`, `-summary`,
    // `-mislabelled` — which describes where the audit found it rather than what
    // the work is. Where a ruling supplies a slug it is the public URL.
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

/**
 * The whole plan: one outcome per considered entry, and nothing inserted twice.
 *
 * Order matters. A slug already in production means the row landed on an earlier
 * run and the entry is simply done. A duplicate of an existing work must lose to
 * nothing, so it is checked before anything cosmetic. An entry that duplicates
 * another entry *in this same batch* — the same object embedded into both a
 * description and a long summary — collapses to one row, unless the two sit on
 * different effects, in which case two gallery rows is the intended outcome.
 */
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

  // The slug a ruling gives an asset, which is the one that reaches production.
  const slugOverrides = new Map(
    (decisions.ownerRulings?.promoted ?? [])
      .filter((entry) => entry.slug)
      .map((entry) => [entry.id, entry.slug]),
  );
  const slugOf = (asset) => slugOverrides.get(asset.id) ?? asset.slug;

  // Rows this migration itself created on an earlier batch. They are the batch,
  // only already persisted, so they get the batch's rule rather than the rule
  // for the 247 rows that predate it: one object under two effects is two
  // intended gallery rows, and only a same-effect match is a duplicate. Without
  // this, running in batches quietly drops the second of every such pair — the
  // vasoconstriction/vasodilation diagram and the Wheeler circuit both split
  // across batch boundaries. Overridden slugs belong in this set for the same
  // reason: a row of ours whose slug the curation file does not spell would
  // otherwise read as one of the 247 and take the stricter rule.
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

  /**
   * Which existing row, if any, makes this candidate a duplicate.
   *
   * A pre-existing row wins on the asset alone — `A008` is the same file as
   * `blurred-english-terraces-josie-kins` and is a duplicate even though the two
   * sit on different effects. A row this migration made only wins when it also
   * shares the effect.
   */
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

    // A recovered asset has no storage id to compare, but it does have bytes,
    // and those bytes may already be in the table under some other row — so the
    // digest check has to stand on its own rather than behind the storage one.
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
      // Present only for a recovered asset: the bytes the write phase must push
      // before this row has a `storage_id` to point at.
      upload: assetFacts.upload ?? null,
    });
  }

  return { insert, skipped };
}

/** Group the skips so a plan reads as reasons rather than as a list of ids. */
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

