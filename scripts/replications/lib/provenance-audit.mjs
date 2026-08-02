const MEDIA_EXTENSION = /\.(?:avif|gif|jpe?g|m4v|mov|mp3|mp4|ogg|png|webm|webp)$/iu;
const UNKNOWN_CREATORS = new Set(["", "anonymous", "creator unknown", "unknown", "unattributed"]);

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replaceAll("%20", " ");
  }
}

export function normalizeMediaIdentity(value) {
  const pathname = String(value ?? "").split(/[?#]/u, 1)[0];
  const basename = decode(pathname.split("/").at(-1) ?? "").replace(MEDIA_EXTENSION, "");
  return basename
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizeText(value) {
  return decode(String(value ?? ""))
    .toLowerCase()
    .replace(/color/gu, "colour")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function objectId(value) {
  return typeof value === "string" ? value : value?.$oid ?? null;
}

function knownCreator(value) {
  return !UNKNOWN_CREATORS.has(normalizeText(value));
}

export function classifyTitleKind(title) {
  const value = String(title ?? "").trim();
  const normalized = normalizeText(value);
  if (!normalized || normalized === "untitled" || /^[a-z]*\d[a-z\d]{4,}$/iu.test(value) || /^\d+(?:[-_]\d+){2,}$/u.test(value)) {
    return "placeholder";
  }
  if (/[_]|\bby\b/iu.test(value) || MEDIA_EXTENSION.test(value)) {
    return "filename";
  }
  return "descriptive";
}

function stableAuditId(replication) {
  const identity = normalizeMediaIdentity(replication.url || replication.thumbnail_url || replication.slug)
    || normalizeText(replication.slug)
    || String(replication._id);
  return `replication:${identity.replace(/\s+/gu, "-").replace(/-unknown$/u, "")}`;
}

function archiveEvidence(replication, effectsById) {
  return {
    source: "effectindex-dump",
    effect_index_id: objectId(replication._id),
    title: replication.title ?? null,
    artist: replication.artist ?? null,
    artist_url: replication.artist_url ?? null,
    resource_url: replication.resource ?? null,
    effect_slugs: (replication.associated_effects ?? [])
      .map(objectId)
      .map((id) => effectsById.get(id)?.url ?? `unmapped:${id}`),
    quote: [replication.title, knownCreator(replication.artist) ? `by ${replication.artist}` : null]
      .filter(Boolean)
      .join(" "),
  };
}

function changed(current, proposal) {
  return ["title", "artist", "artist_url", "credit_line", "source_url", "rightsholder"]
    .some((field) => (current[field] ?? null) !== (proposal[field] ?? null));
}

function buildProposal(current, archived) {
  const title = String(archived.title ?? "").trim();
  const archivedArtist = String(archived.artist ?? "").trim();
  if (!title) {
    return null;
  }

  const artist = knownCreator(archivedArtist) ? archivedArtist : current.artist;
  const creatorKnown = knownCreator(artist);
  return {
    title,
    title_kind: "historical",
    artist,
    artist_url: knownCreator(archivedArtist) ? (archived.artist_url || null) : (current.artist_url ?? null),
    credit_line: creatorKnown ? `${title} by ${artist}` : `${title} (creator unknown)`,
    source_url: archived.resource || null,
    rightsholder: creatorKnown ? artist : (current.rightsholder ?? null),
  };
}

function symptomsFor(replication, health, archiveMatches) {
  const symptoms = [];
  if (!knownCreator(replication.artist)) symptoms.push("unknown-creator");
  const titleKind = classifyTitleKind(replication.title);
  if (titleKind === "placeholder") symptoms.push("placeholder-title");
  if (titleKind === "filename") symptoms.push("filename-title");
  if (health.media === "missing" || health.media === "broken") symptoms.push("broken-media");
  if (replication.type === "video" && (health.thumbnail === "missing" || health.thumbnail === "broken")) {
    symptoms.push("missing-thumbnail");
  }
  if (archiveMatches.length === 1) {
    const archived = archiveMatches[0];
    if (archived.title && normalizeText(archived.title) !== normalizeText(replication.title)) symptoms.push("archive-title-disagreement");
    if (knownCreator(archived.artist) && normalizeText(archived.artist) !== normalizeText(replication.artist)) symptoms.push("archive-creator-disagreement");
  }
  if (archiveMatches.length > 1) symptoms.push("ambiguous-archive-match");
  return symptoms;
}

export function buildProvenanceAudit({
  liveReplications,
  effectIndexReplications,
  effectsById = new Map(),
  healthById = new Map(),
  generatedAt = new Date().toISOString(),
}) {
  const archiveByIdentity = new Map();
  for (const replication of effectIndexReplications) {
    const identities = new Set([
      normalizeMediaIdentity(replication.resource),
      normalizeText(replication.title),
    ].filter(Boolean));
    for (const identity of identities) {
      archiveByIdentity.set(identity, [...(archiveByIdentity.get(identity) ?? []), replication]);
    }
  }

  const records = liveReplications.map((replication) => {
    const liveIdentity = normalizeMediaIdentity(replication.url || replication.thumbnail_url || replication.slug);
    const candidateIdentities = new Set([
      liveIdentity,
      normalizeText(replication.title),
      normalizeMediaIdentity(replication.slug),
      normalizeMediaIdentity(replication.slug.replace(/-unknown$/u, "")),
    ].filter(Boolean));
    const allArchiveMatches = [...new Map(
      [...candidateIdentities]
        .flatMap((identity) => archiveByIdentity.get(identity) ?? [])
        .map((match) => [objectId(match._id) ?? match.resource, match]),
    ).values()];
    const effectMatches = allArchiveMatches.filter((match) => (match.associated_effects ?? [])
      .map(objectId)
      .map((id) => effectsById.get(id)?.url)
      .includes(replication.effect_slug));
    const archiveMatches = effectMatches.length > 0 ? effectMatches : allArchiveMatches;
    const health = healthById.get(String(replication._id)) ?? {
      media: replication.url ? "unchecked" : "missing",
      thumbnail: replication.type === "video" ? (replication.thumbnail_url ? "unchecked" : "missing") : "not-applicable",
    };
    const evidence = archiveMatches.map((match) => archiveEvidence(match, effectsById));
    const consistentProposals = [...new Map(
      archiveMatches
        .map((match) => buildProposal(replication, match))
        .filter(Boolean)
        .map((proposal) => [JSON.stringify({ title: proposal.title, artist: proposal.artist }), proposal]),
    ).values()];
    const proposalsConflict = consistentProposals.length > 1;
    const symptoms = symptomsFor(replication, health, proposalsConflict ? archiveMatches : archiveMatches.slice(0, 1));
    if (archiveMatches.length > 1 && !proposalsConflict) {
      const index = symptoms.indexOf("ambiguous-archive-match");
      if (index !== -1) symptoms.splice(index, 1);
    }
    const proposal = consistentProposals.length === 1 ? consistentProposals[0] : null;
    const actionableProposal = proposal && changed(replication, proposal) ? proposal : null;
    const action = proposalsConflict
      ? "hold"
      : actionableProposal
        ? "correct"
        : symptoms.includes("broken-media")
          ? "recover"
          : symptoms.includes("missing-thumbnail")
            ? "regenerate-thumbnail"
            : symptoms.length > 0
              ? "hold"
              : "no-change";
    const status = actionableProposal
      ? "proposed"
      : evidence.length > 0
        ? "traced"
        : symptoms.length > 0
          ? "unresearched"
          : "verified";

    return {
      audit_id: stableAuditId(replication),
      live_id: String(replication._id),
      slug: replication.slug,
      current: {
        title: replication.title,
        title_kind: classifyTitleKind(replication.title),
        artist: replication.artist,
        artist_url: replication.artist_url ?? null,
        credit_line: replication.credit_line ?? null,
        source_url: replication.source_url ?? null,
        rightsholder: replication.rightsholder ?? null,
        type: replication.type,
        format: replication.format,
        storage_id: replication.storage_id,
        effect_slug: replication.effect_slug,
        url: replication.url ?? null,
        thumbnail_url: replication.thumbnail_url ?? null,
      },
      fingerprint: { resource_identity: liveIdentity },
      health,
      symptoms,
      match: archiveMatches.length === 1
        ? { method: "resource-basename", confidence: "archive-only", effect_index_id: objectId(archiveMatches[0]._id) }
        : archiveMatches.length > 1 && !proposalsConflict
          ? { method: "resource-basename", confidence: "archive-consistent", candidate_count: archiveMatches.length }
          : archiveMatches.length > 1
            ? { method: "resource-basename", confidence: "ambiguous", candidate_count: archiveMatches.length }
            : null,
      evidence,
      proposal: actionableProposal,
      status,
      action,
    };
  }).sort((left, right) => left.slug.localeCompare(right.slug));

  const suspectRecords = records.filter((record) => record.symptoms.length > 0);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    summary: {
      total: records.length,
      suspect: suspectRecords.length,
      proposed: records.filter((record) => record.status === "proposed").length,
      traced: records.filter((record) => record.status === "traced").length,
      unresearched: records.filter((record) => record.status === "unresearched").length,
      broken_media: records.filter((record) => record.symptoms.includes("broken-media")).length,
      missing_thumbnails: records.filter((record) => record.symptoms.includes("missing-thumbnail")).length,
    },
    records,
  };
}
