import {
  ALIAS_ADDITIONS,
  NOTABLE_THIRD_PARTY_NAMES,
  NO_CORRECTIONS,
  POSSIBLE_MERGES,
} from "./seed-credited-identities-decisions.mjs";
import {
  blockedReason,
  buildCorrectionIndex,
  collectCreditedIdentities,
  deriveProfileKey,
  isAbsenceMarker,
  normalizeKey,
  normalizeName,
  planProfileLinks,
} from "./seed-credited-identities-policy.mjs";

export function matchNamesOf(profile) {
  return new Set(
    [profile.displayName, ...(profile.aliases ?? [])].map(normalizeName).filter(Boolean),
  );
}

export function buildSeedPlan({
  replications = [],
  reports = [],
  profiles = [],
  corrections = NO_CORRECTIONS,
} = {}) {
  const index = buildCorrectionIndex(corrections);
  const identities = collectCreditedIdentities({ replications, reports });
  const identityByName = new Map(identities.map((identity) => [identity.normalizedName, identity]));
  const profileByKey = new Map(profiles.map((profile) => [normalizeKey(profile.key), profile]));

  const aliasAdditions = [];
  const aliasWarnings = [];
  const matchNamesByKey = new Map(
    profiles.map((profile) => [normalizeKey(profile.key), matchNamesOf(profile)]),
  );

  for (const addition of ALIAS_ADDITIONS) {
    const key = normalizeKey(addition.key);
    const profile = profileByKey.get(key);

    if (!profile) {
      aliasWarnings.push(`Profile ${key} does not exist; alias addition skipped.`);
      continue;
    }

    const existingNames = matchNamesByKey.get(key);
    const newAliases = addition.aliases.map(normalizeName).filter(Boolean);
    const missing = newAliases.filter((alias) => !(profile.aliases ?? []).map(normalizeName).includes(alias));

    for (const alias of newAliases) {
      existingNames.add(alias);
      const identity = identityByName.get(alias);
      if (!identity) {
        aliasWarnings.push(
          `Alias "${alias}" on ${key} matches nothing in the corpus — recorded, but it joins no works.`,
        );
      }
    }

    aliasAdditions.push({
      key,
      displayName: profile.displayName,
      aliases: newAliases,
      missing,
      alreadyPresent: missing.length === 0,
      claims: newAliases.reduce(
        (total, alias) => {
          const identity = identityByName.get(alias);
          return {
            replications: total.replications + (identity?.replications ?? 0),
            reports: total.reports + (identity?.reports ?? 0),
          };
        },
        { replications: 0, reports: 0 },
      ),
      evidence: addition.evidence,
    });
  }

  const resolveExisting = (normalizedName) => {
    for (const [key, names] of matchNamesByKey) {
      if (names.has(normalizedName)) {
        return key;
      }
    }
    return null;
  };

  const created = [];
  const absenceMarkers = [];
  const alreadyResolved = [];
  const linkNotes = [];
  const nameCorrectionsApplied = [];
  const usedNameCorrections = new Set();
  const usedLinkCorrections = new Set();

  for (const identity of identities) {
    if (isAbsenceMarker(identity.displayName)) {
      absenceMarkers.push({
        displayName: identity.displayName,
        replications: identity.replications,
        reports: identity.reports,
      });
      continue;
    }

    const existingKey = resolveExisting(identity.normalizedName);
    if (existingKey) {
      alreadyResolved.push({ displayName: identity.displayName, key: existingKey });
      continue;
    }

    const nameCorrection = index.names.get(identity.normalizedName) ?? null;
    if (nameCorrection) {
      usedNameCorrections.add(identity.normalizedName);
    }

    const displayName = nameCorrection ? nameCorrection.correct : identity.displayName;
    const { key, explicit, droppedCharacters } = deriveProfileKey(displayName);

    const linkCorrection = index.links.get(identity.normalizedName) ?? null;
    if (linkCorrection) {
      usedLinkCorrections.add(identity.normalizedName);
    }

    const { links, upgraded, dropped, truncated, added, removed } = planProfileLinks(
      identity.urls,
      { correction: linkCorrection },
    );

    if (
      upgraded.length > 0 ||
      dropped.length > 0 ||
      truncated.length > 0 ||
      added.length > 0 ||
      removed.length > 0
    ) {
      linkNotes.push({ displayName, storedAs: identity.displayName, upgraded, dropped, truncated, added, removed });
    }

    const aliases = Array.from(
      new Set([...identity.spellings.map(normalizeName), normalizeName(displayName)]),
    )
      .filter(Boolean)
      .sort();

    if (nameCorrection) {
      nameCorrectionsApplied.push({
        key,
        storedAs: identity.displayName,
        correctedTo: displayName,
        works: identity.replications,
        reports: identity.reports,
        aliases,
        evidence: nameCorrection.evidence,
        correctsReplicationArtistField: nameCorrection.correctsReplicationArtistField === true,
      });
    }

    created.push({
      key,
      explicitKey: explicit,
      droppedCharacters,
      displayName,
      aliases,
      bio: "",
      links,
      ...(identity.replications > 0 ? { role: "Replication Artist" } : {}),
      sources: { replications: identity.replications, reports: identity.reports },
      notableThirdParty: NOTABLE_THIRD_PARTY_NAMES.has(identity.normalizedName),
    });
  }

  const unmatchedCorrections = [
    ...[...index.names.keys()]
      .filter((name) => !usedNameCorrections.has(name))
      .map((name) => ({ kind: "nameCorrection", name })),
    ...[...index.links.keys()]
      .filter((name) => !usedLinkCorrections.has(name))
      .map((name) => ({ kind: "linkCorrection", name })),
  ];

  const blockedLinks = [];
  for (const row of created) {
    for (const link of row.links) {
      const reason = blockedReason(link.url, index);
      if (reason) {
        blockedLinks.push({ key: row.key, displayName: row.displayName, url: link.url, reason });
      }
    }
  }

  return {
    aliasAdditions,
    aliasWarnings,
    nameCorrectionsApplied,
    inertNameCorrections: index.inertNames,
    inertLinkCorrections: index.inertLinks,
    ownerDecisions: index.ownerDecisions,
    checkedAndFoundWrong: index.checkedAndFoundWrong,
    unmatchedCorrections,
    blockedLinks,
    created: created.sort((left, right) => left.key.localeCompare(right.key)),
    absenceMarkers,
    alreadyResolved,
    linkNotes,
    collisions: findCollisions({ created, profiles, aliasAdditions }),
    possibleMerges: POSSIBLE_MERGES.filter((merge) =>
      created.some((row) => normalizeName(row.displayName) === normalizeName(merge.displayName)),
    ).map((merge) => ({
      ...merge,
      key: created.find((row) => normalizeName(row.displayName) === normalizeName(merge.displayName))
        .key,
    })),
  };
}

export function findCollisions({ created = [], profiles = [], aliasAdditions = [] } = {}) {
  const existingKeys = new Set(profiles.map((profile) => normalizeKey(profile.key)));
  const aliasesByKey = new Map(
    profiles.map((profile) => [normalizeKey(profile.key), new Set((profile.aliases ?? []).map(normalizeName))]),
  );
  for (const addition of aliasAdditions) {
    for (const alias of addition.aliases) {
      aliasesByKey.get(addition.key)?.add(alias);
    }
  }
  const allAliases = new Set([...aliasesByKey.values()].flatMap((set) => [...set]));

  const duplicateKeys = [];
  const keyMatchesExistingProfile = [];
  const keyShadowedByAlias = [];
  const aliasClaimsExistingName = [];

  const seenKeys = new Set();
  const existingNames = new Set(
    profiles.flatMap((profile) => [...matchNamesOf(profile)]),
  );

  for (const row of created) {
    if (seenKeys.has(row.key)) {
      duplicateKeys.push(row.key);
    }
    seenKeys.add(row.key);

    if (existingKeys.has(row.key)) {
      keyMatchesExistingProfile.push(row.key);
    }

    if (allAliases.has(row.key.toLowerCase())) {
      keyShadowedByAlias.push(row.key);
    }

    for (const alias of row.aliases) {
      if (existingNames.has(alias)) {
        aliasClaimsExistingName.push({ key: row.key, alias });
      }
    }
  }

  return { duplicateKeys, keyMatchesExistingProfile, keyShadowedByAlias, aliasClaimsExistingName };
}

const PATCHED_FIELDS = ["displayName", "aliases", "bio", "role", "links"];

export function mergeWithStoredProfile(planned, stored) {
  if (!stored) {
    return { entry: { ...planned }, action: "create", changedFields: PATCHED_FIELDS };
  }

  const aliases = Array.from(
    new Set([...(stored.aliases ?? []).map(normalizeName), ...planned.aliases.map(normalizeName)]),
  ).filter(Boolean);

  const role = stored.role || planned.role;

  const entry = {
    key: normalizeKey(stored.key),
    displayName: stored.displayName || planned.displayName,
    aliases,
    bio: stored.bio ? stored.bio : planned.bio,
    ...(role ? { role } : {}),
    links: (stored.links ?? []).length > 0 ? stored.links : planned.links,
    ...(stored.avatarStorageId ? { avatarStorageId: stored.avatarStorageId } : {}),
    ...(stored.avatarUrl ? { avatarUrl: stored.avatarUrl } : {}),
    ...(stored.membershipEmail ? { membershipEmail: stored.membershipEmail } : {}),
    ...(stored.createdAt ? { createdAt: stored.createdAt } : {}),
  };

  const changedFields = PATCHED_FIELDS.filter((field) => {
    const before = JSON.stringify(stored[field] ?? null);
    const after = JSON.stringify(entry[field] ?? null);
    return before !== after;
  });

  return { entry, action: changedFields.length > 0 ? "update" : "unchanged", changedFields };
}

export function buildImportEntries(plan, storedByKey = new Map()) {
  const entries = [];

  for (const addition of plan.aliasAdditions) {
    const stored = storedByKey.get(addition.key);
    if (!stored) {
      continue;
    }

    const planned = {
      key: addition.key,
      displayName: stored.displayName,
      aliases: addition.aliases,
      bio: stored.bio ?? "",
      links: stored.links ?? [],
      ...(stored.role ? { role: stored.role } : {}),
    };

    entries.push({ ...mergeWithStoredProfile(planned, stored), reason: "alias addition" });
  }

  for (const row of plan.created) {
    const {
      key,
      explicitKey: _explicitKey,
      droppedCharacters: _droppedCharacters,
      sources: _sources,
      notableThirdParty: _notableThirdParty,
      ...planned
    } = row;
    entries.push({
      ...mergeWithStoredProfile({ key, ...planned }, storedByKey.get(key)),
      reason: "credited identity",
    });
  }

  return entries;
}
