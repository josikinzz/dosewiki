import type { SourceParser } from "./types";

type ParserSourceCapability = "parseable" | "unsupported" | "synthetic"

export interface SourceIdentityDescriptor {
  id: string;
  displayName: string;
  capability: ParserSourceCapability;
  aliases: readonly string[];
}

export interface ParserSourceResolution {
  kind: ParserSourceCapability | "unknown";
  requestedId: string;
  descriptor?: SourceIdentityDescriptor;
}

export const TRIPSIT_COMBOS_SOURCE_ID = "tripsit-combos";

const SOURCE_IDENTITIES = {
  "tripsit-factsheets": {
    id: "tripsit-factsheets",
    displayName: "TripSit Factsheets",
    capability: "parseable",
    aliases: ["tripsit", "tripsit-factsheet", "tripsit-factsheets"],
  },
  "tripsit-wiki": {
    id: "tripsit-wiki",
    displayName: "TripSit Wiki",
    capability: "parseable",
    aliases: ["tripsit-wiki", "tripsitwiki"],
  },
  psychonautwiki: {
    id: "psychonautwiki",
    displayName: "PsychonautWiki",
    capability: "parseable",
    aliases: ["psychonautwiki", "psychonaut-wiki"],
  },
  drugbank: {
    id: "drugbank",
    displayName: "DrugBank",
    capability: "parseable",
    aliases: ["drugbank", "drug-bank"],
  },
  erowid: {
    id: "erowid",
    displayName: "Erowid",
    capability: "parseable",
    aliases: ["erowid"],
  },
  isomerdesign: {
    id: "isomerdesign",
    displayName: "IsomerDesign",
    capability: "parseable",
    aliases: ["isomerdesign", "isomer-design"],
  },
  saferparty: {
    id: "saferparty",
    displayName: "SaferParty",
    capability: "parseable",
    aliases: ["saferparty", "safer-party"],
  },
  disregardeverythingisay: {
    id: "disregardeverythingisay",
    displayName: "Disregard Everything I Say",
    capability: "parseable",
    aliases: ["disregardeverythingisay", "deis", "disregard-everything-i-say"],
  },
  drugusersbible: {
    id: "drugusersbible",
    displayName: "Drug Users Bible",
    capability: "parseable",
    aliases: ["drugusersbible", "drug-users-bible"],
  },
  thedrugclassroom: {
    id: "thedrugclassroom",
    displayName: "The Drug Classroom",
    capability: "parseable",
    aliases: ["thedrugclassroom", "the-drug-classroom", "drugclassroom"],
  },
  wikipedia: {
    id: "wikipedia",
    displayName: "Wikipedia",
    capability: "parseable",
    aliases: ["wikipedia", "wiki"],
  },
  bluelight: {
    id: "bluelight",
    displayName: "Bluelight",
    capability: "unsupported",
    aliases: ["bluelight", "blue-light"],
  },
  dmturner: {
    id: "dmturner",
    displayName: "D. M. Turner",
    capability: "unsupported",
    aliases: ["dmturner", "d-m-turner", "d.m.-turner"],
  },
  nervewing: {
    id: "nervewing",
    displayName: "Nervewing",
    capability: "unsupported",
    aliases: ["nervewing"],
  },
  protestkit: {
    id: "protestkit",
    displayName: "ProtestKit",
    capability: "unsupported",
    aliases: ["protestkit", "protest-kit"],
  },
  [TRIPSIT_COMBOS_SOURCE_ID]: {
    id: TRIPSIT_COMBOS_SOURCE_ID,
    displayName: "TripSit Combination Guide",
    capability: "synthetic",
    aliases: [TRIPSIT_COMBOS_SOURCE_ID, "tripsit-combination-guide"],
  },
} as const satisfies Record<string, SourceIdentityDescriptor>

export type CanonicalSourceId = keyof typeof SOURCE_IDENTITIES;
export type ParseableSourceId = {
  [K in CanonicalSourceId]: (typeof SOURCE_IDENTITIES)[K]["capability"] extends "parseable"
    ? K
    : never;
}[CanonicalSourceId];

const sourceAliasIndex = new Map<string, SourceIdentityDescriptor>();

for (const descriptor of Object.values(SOURCE_IDENTITIES)) {
  sourceAliasIndex.set(descriptor.id, descriptor);
  for (const alias of descriptor.aliases) {
    sourceAliasIndex.set(normalizeSourceIdentityKey(alias), descriptor);
  }
}

function normalizeSourceIdentityKey(sourceId: string): string {
  return sourceId.trim().toLowerCase();
}

export function canonicalizeSourceId(sourceId: string): string | undefined {
  return sourceAliasIndex.get(normalizeSourceIdentityKey(sourceId))?.id;
}

export function resolveSourceIdentity(sourceId: string): ParserSourceResolution {
  const descriptor = sourceAliasIndex.get(normalizeSourceIdentityKey(sourceId));
  if (!descriptor) return { kind: "unknown", requestedId: sourceId };
  return { kind: descriptor.capability, requestedId: sourceId, descriptor };
}

export function describeSource(sourceId: string): SourceIdentityDescriptor | undefined {
  return resolveSourceIdentity(sourceId).descriptor;
}

export function getSourceDescriptor(sourceId: CanonicalSourceId): SourceIdentityDescriptor {
  return SOURCE_IDENTITIES[sourceId];
}

export function getParseableSourceDescriptor(sourceId: ParseableSourceId): SourceIdentityDescriptor {
  return SOURCE_IDENTITIES[sourceId];
}

export function describeSourceCoverage(sourceId: string, fallbackDisplayName?: string) {
  const descriptor = describeSource(sourceId);
  return {
    sourceId: descriptor?.id ?? sourceId,
    displayName: descriptor?.displayName ?? fallbackDisplayName ?? sourceId,
  };
}

export function parserRegisteredForSource(
  parsers: Partial<Record<ParseableSourceId, SourceParser>>,
  sourceId: string,
): SourceParser | undefined {
  const resolution = resolveSourceIdentity(sourceId);
  if (resolution.kind !== "parseable" || !resolution.descriptor) return undefined;
  return parsers[resolution.descriptor.id as ParseableSourceId];
}
