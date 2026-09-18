import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

import {
  CANONICAL_LEGAL_STATUSES,
  countryLegalitySchema,
} from "../../src/schema/substance/shared";
import { CANONICAL_STATUS_LABELS } from "../../src/schema/substance/legalStatuses";
import usStateFlagMappings from "@data/substances/usStateFlagMappings.json";
import { getCountryCode } from "../../src/utils/data/countryCodes";
import { voiceMatch } from "./voice.mjs";

const nonEmptyString = z.string().trim().min(1);
const httpUrl = z.string().url().refine(
  (value) => value.startsWith("http://") || value.startsWith("https://"),
  "must use an http(s) URL",
);

const sourceSchema = z.object({
  url: httpUrl,
  title: nonEmptyString,
  supportQuote: z.string(),
}).strict();
const supportedSourcesSchema = z.array(sourceSchema).min(1).refine(
  (sources) => sources.some((source) => source.supportQuote.trim().length > 0),
  "at least one source must carry a non-empty supportQuote",
);

const internationalSourceSchema = z.object({
  url: httpUrl,
  title: nonEmptyString,
}).strict();

const countryEntrySchema = z.object({
  canonicalStatus: z.enum(CANONICAL_LEGAL_STATUSES),
  instrument: nonEmptyString,
  designation: nonEmptyString.optional(),
  status: nonEmptyString,
  notes: nonEmptyString,
  editorialNote: z.string().optional(),
  sources: supportedSourcesSchema,
}).strict();

const usStateEntrySchema = countryEntrySchema.extend({
  cities: z.record(z.string(), countryEntrySchema).optional(),
}).strict();

const usMirrorSchema = z.object({
  state: nonEmptyString,
  statuteCitation: nonEmptyString,
  sourceUrl: httpUrl,
}).strict();

const enrichmentSchema = z.object({
  canonicalStatus: z.enum(CANONICAL_LEGAL_STATUSES),
  instrument: nonEmptyString,
  designation: nonEmptyString.nullable().optional(),
  editorialNote: z.string().optional(),
  sources: supportedSourcesSchema,
}).strict();

const correctionSchema = countryEntrySchema.extend({
  oldEntry: z.object({
    status: nonEmptyString,
    notes: z.string(),
  }).strict(),
  whatWasWrong: nonEmptyString,
}).strict();

const legalityDraftSchema = z.object({
  slug: nonEmptyString,
  generatedAt: z.iso.datetime(),
  international: z.array(z.string()),
  internationalSources: z.array(internationalSourceSchema),
  entries: z.record(z.string(), countryEntrySchema),
  enrichments: z.record(z.string(), enrichmentSchema).optional(),
  usStates: z.record(z.string(), usStateEntrySchema).optional(),
  usStatesNote: nonEmptyString.optional(),
  usMirrors: z.array(usMirrorSchema).optional(),
  corrections: z.record(z.string(), correctionSchema),
  gaps: z.array(z.object({
    country: nonEmptyString,
    searchesRun: z.array(z.string()),
    sourcesInspected: z.array(z.string()),
    reason: nonEmptyString,
    editorialNote: z.string().optional(),
  }).strict()),
  refuted: z.array(z.object({
    country: nonEmptyString,
    reason: nonEmptyString,
  }).strict()),
  countryRemovals: z.array(z.object({
    country: nonEmptyString,
    reason: nonEmptyString,
    oldEntry: z.object({
      status: nonEmptyString,
      notes: z.string(),
    }).strict(),
  }).strict()).optional(),
  notesRepairs: z.record(z.string(), z.object({
    expectedNotes: nonEmptyString,
    newNotes: nonEmptyString,
  }).strict()).optional(),
  statusRepairs: z.record(z.string(), z.object({
    expectedStatus: nonEmptyString,
    newStatus: nonEmptyString,
  }).strict()).optional(),
  designationRepairs: z.record(z.string(), z.object({
    expectedDesignation: nonEmptyString,
    newDesignation: nonEmptyString.nullable(),
  }).strict()).optional(),
  instrumentRepairs: z.record(z.string(), z.object({
    expectedInstrument: nonEmptyString,
    newInstrument: nonEmptyString,
  }).strict()).optional(),
}).strict().superRefine((draft, ctx) => {
  if (draft.international.length > 0 && draft.internationalSources.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["internationalSources"],
      message: "must be non-empty when international contains entries",
    });
  }

  const seenRemovals = new Set<string>();
  for (const [index, removal] of (draft.countryRemovals ?? []).entries()) {
    if (seenRemovals.has(removal.country)) {
      ctx.addIssue({
        code: "custom",
        path: ["countryRemovals", index, "country"],
        message: "country may be removed only once",
      });
    }
    seenRemovals.add(removal.country);

    for (const [section, countries] of [
      ["entries", draft.entries],
      ["corrections", draft.corrections],
      ["enrichments", draft.enrichments ?? {}],
      ["notesRepairs", draft.notesRepairs ?? {}],
      ["statusRepairs", draft.statusRepairs ?? {}],
      ["designationRepairs", draft.designationRepairs ?? {}],
      ["instrumentRepairs", draft.instrumentRepairs ?? {}],
    ] as const) {
      if (removal.country in countries) {
        ctx.addIssue({
          code: "custom",
          path: ["countryRemovals", index, "country"],
          message: `country cannot also appear in ${section}`,
        });
      }
    }
  }
});

function formatPath(path: PropertyKey[]) {
  if (path.length === 0) return "draft";
  return path.map((part) => typeof part === "number" ? `[${part}]` : String(part)).join(".");
}

export type LegalityDraftValidation = {
  errors: string[];
  warnings: string[];
};

type ReaderField = "notes" | "status" | "designation" | "instrument";
type ReaderFieldValues = Partial<Record<ReaderField, string | null | undefined>>;

/** Every reader field carrying process language: `path: message` error strings. */
function voiceErrors(path: string, entry: ReaderFieldValues): string[] {
  const errors: string[] = [];
  for (const field of ["notes", "status", "designation", "instrument"] as const) {
    const match = voiceMatch(field, entry[field] ?? undefined);
    if (match) {
      errors.push(`${path}.${field}: process language "${match}" is not allowed in reader-facing text`);
    }
  }
  return errors;
}

function isCompactDesignation(designation: string) {
  return designation.length <= 40 && !/[,;]/.test(designation);
}

export function validateLegalityDraftWithWarnings(draft: unknown): LegalityDraftValidation {
  const parsed = legalityDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const countrySets: Array<["entries" | "corrections", Record<string, z.infer<typeof countryEntrySchema>>]> = [
    ["entries", parsed.data.entries],
    ["corrections", parsed.data.corrections],
  ];

  for (const [section, countries] of countrySets) {
    for (const [country, entry] of Object.entries(countries)) {
      if (!getCountryCode(country)) {
        errors.push(`${section}.${country}: country key does not resolve to a country code`);
      }

      const projected = countryLegalitySchema.safeParse({
        status: entry.status,
        notes: entry.notes,
        canonicalStatus: entry.canonicalStatus,
        instrument: entry.instrument,
        designation: entry.designation,
      });
      if (!projected.success) {
        for (const issue of projected.error.issues) {
          errors.push(`${section}.${country}.${formatPath(issue.path)}: ${issue.message}`);
        }
      }
    }
  }

  for (const country of Object.keys(parsed.data.enrichments ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`enrichments.${country}: country key does not resolve to a country code`);
    }
  }

  for (const [state, entry] of Object.entries(parsed.data.usStates ?? {})) {
    if (!(state in usStateFlagMappings)) {
      errors.push(`usStates.${state}: state key does not resolve to a US flag mapping`);
    }

    const projected = countryLegalitySchema.safeParse(entry);
    if (!projected.success) {
      for (const issue of projected.error.issues) {
        errors.push(`usStates.${state}.${formatPath(issue.path)}: ${issue.message}`);
      }
    }

    for (const [city, cityEntry] of Object.entries(entry.cities ?? {})) {
      const cityProjected = countryLegalitySchema.safeParse(cityEntry);
      if (!cityProjected.success) {
        for (const issue of cityProjected.error.issues) {
          errors.push(`usStates.${state}.cities.${city}.${formatPath(issue.path)}: ${issue.message}`);
        }
      }
    }
  }

  for (const [index, mirror] of (parsed.data.usMirrors ?? []).entries()) {
    if (!(mirror.state in usStateFlagMappings)) {
      errors.push(`usMirrors[${index}].state: state key does not resolve to a US flag mapping`);
    }
  }

  for (const country of Object.keys(parsed.data.entries)) {
    if (country in parsed.data.corrections) {
      errors.push(`entries.${country}: country cannot appear in both entries and corrections`);
    }
  }

  const canonicalLabels = Object.values(CANONICAL_STATUS_LABELS);

  for (const [section, countries] of countrySets) {
    for (const [country, entry] of Object.entries(countries)) {
      const path = `${section}.${country}`;
      errors.push(...voiceErrors(path, entry));
      const expectedStatus = CANONICAL_STATUS_LABELS[entry.canonicalStatus];
      if (entry.status !== expectedStatus) {
        errors.push(`${path}.status: must be the canonical label "${expectedStatus}" for ${entry.canonicalStatus} (got "${entry.status}")`);
      }
      if (entry.designation && !isCompactDesignation(entry.designation)) {
        errors.push(`${path}.designation: must be a compact tag (40 characters or fewer, without commas or semicolons)`);
      }
    }
  }

  for (const [country, enrichment] of Object.entries(parsed.data.enrichments ?? {})) {
    const path = `enrichments.${country}`;
    errors.push(...voiceErrors(path, { instrument: enrichment.instrument, designation: enrichment.designation }));
    if (enrichment.designation && !isCompactDesignation(enrichment.designation)) {
      errors.push(`${path}.designation: must be a compact tag (40 characters or fewer, without commas or semicolons)`);
    }
  }

  for (const [state, entry] of Object.entries(parsed.data.usStates ?? {})) {
    const stateEntries: Array<[string, z.infer<typeof countryEntrySchema>]> = [
      [`usStates.${state}`, entry],
      ...Object.entries(entry.cities ?? {}).map(([city, cityEntry]): [string, z.infer<typeof countryEntrySchema>] => [
        `usStates.${state}.cities.${city}`,
        cityEntry,
      ]),
    ];
    for (const [path, stateEntry] of stateEntries) {
      errors.push(...voiceErrors(path, stateEntry));
      const expectedStatus = CANONICAL_STATUS_LABELS[stateEntry.canonicalStatus];
      if (stateEntry.status !== expectedStatus) {
        errors.push(`${path}.status: must be the canonical label "${expectedStatus}" for ${stateEntry.canonicalStatus} (got "${stateEntry.status}")`);
      }
      if (stateEntry.designation && !isCompactDesignation(stateEntry.designation)) {
        errors.push(`${path}.designation: must be a compact tag (40 characters or fewer, without commas or semicolons)`);
      }
    }
  }

  const usStatesNoteMatch = voiceMatch("notes", parsed.data.usStatesNote);
  if (usStatesNoteMatch) {
    errors.push(`usStatesNote: process language "${usStatesNoteMatch}" is not allowed in reader-facing text`);
  }

  for (const [country, repair] of Object.entries(parsed.data.notesRepairs ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`notesRepairs.${country}: country key does not resolve to a country code`);
    }
    errors.push(...voiceErrors(`notesRepairs.${country}`, { notes: repair.newNotes }).map((error) => error.replace(".notes:", ".newNotes:")));
  }

  for (const [country, repair] of Object.entries(parsed.data.statusRepairs ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`statusRepairs.${country}: country key does not resolve to a country code`);
    }
    if (!canonicalLabels.includes(repair.newStatus)) {
      errors.push(`statusRepairs.${country}.newStatus: must be one of the canonical labels (${canonicalLabels.join(", ")}); got "${repair.newStatus}"`);
    }
  }

  for (const [country, repair] of Object.entries(parsed.data.designationRepairs ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`designationRepairs.${country}: country key does not resolve to a country code`);
    }
    const newDesignation = repair.newDesignation;
    if (newDesignation === null) continue;
    errors.push(...voiceErrors(`designationRepairs.${country}`, { designation: newDesignation }).map((error) => error.replace(".designation:", ".newDesignation:")));
    if (!isCompactDesignation(newDesignation)) {
      errors.push(`designationRepairs.${country}.newDesignation: must be a compact tag (40 characters or fewer, without commas or semicolons)`);
    }
  }

  for (const [country, repair] of Object.entries(parsed.data.instrumentRepairs ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`instrumentRepairs.${country}: country key does not resolve to a country code`);
    }
    errors.push(...voiceErrors(`instrumentRepairs.${country}`, { instrument: repair.newInstrument }).map((error) => error.replace(".instrument:", ".newInstrument:")));
  }

  return { errors, warnings };
}

export function validateLegalityDraft(draft: unknown): string[] {
  return validateLegalityDraftWithWarnings(draft).errors;
}

export function validateLegalityDraftFile(runDir: string, draftFile = "legality-draft.json"): string[] {
  const draftPath = resolve(runDir, draftFile);
  if (!existsSync(draftPath)) {
    return [`${draftFile}: missing from ${resolve(runDir)}`];
  }

  try {
    return validateLegalityDraft(JSON.parse(readFileSync(draftPath, "utf8")));
  } catch (error) {
    return [`${draftFile}: invalid JSON (${error instanceof Error ? error.message : String(error)})`];
  }
}

export function validateLegalityDraftFileWithWarnings(runDir: string, draftFile = "legality-draft.json"): LegalityDraftValidation {
  const draftPath = resolve(runDir, draftFile);
  if (!existsSync(draftPath)) {
    return {
      errors: [`${draftFile}: missing from ${resolve(runDir)}`],
      warnings: [],
    };
  }

  try {
    return validateLegalityDraftWithWarnings(JSON.parse(readFileSync(draftPath, "utf8")));
  } catch (error) {
    return {
      errors: [`${draftFile}: invalid JSON (${error instanceof Error ? error.message : String(error)})`],
      warnings: [],
    };
  }
}

function runCli() {
  const argv = process.argv.slice(2);
  const inlineRunArg = argv.find((arg) => arg.startsWith("--run="));
  const separateRunArgIndex = argv.indexOf("--run");
  const runDir = inlineRunArg?.slice("--run=".length)
    ?? (separateRunArgIndex >= 0 ? argv[separateRunArgIndex + 1] : null);
  if (!runDir) {
    console.error("Usage: npm run legality:validate -- --run runs/legality/<slug> [--draft-file <name>]");
    process.exitCode = 1;
    return;
  }

  const inlineDraftFileArg = argv.find((arg) => arg.startsWith("--draft-file="));
  const separateDraftFileArgIndex = argv.indexOf("--draft-file");
  const draftFile = inlineDraftFileArg?.slice("--draft-file=".length)
    ?? (separateDraftFileArgIndex >= 0 ? argv[separateDraftFileArgIndex + 1] : "legality-draft.json");

  const { errors, warnings } = validateLegalityDraftFileWithWarnings(runDir, draftFile);
  if (errors.length === 0) {
    for (const warning of warnings) {
      console.log(warning);
    }
    console.log(`Validation passed with 0 error(s), ${warnings.length} warning(s).`);
    return;
  }

  console.error(`Validation failed with ${errors.length} error(s).`);
  for (const [index, error] of errors.entries()) {
    console.error(`${index + 1}. ${error}`);
  }
  process.exitCode = 1;
}

if (import.meta.main) {
  runCli();
}
