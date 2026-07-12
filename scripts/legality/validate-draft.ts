import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

import {
  CANONICAL_LEGAL_STATUSES,
  countryLegalitySchema,
} from "../../src/schema/substance/shared";
import { getCountryCode } from "../../src/utils/data/countryCodes";

const nonEmptyString = z.string().trim().min(1);
const taskLanguagePattern = /the entry|the previous|publication|must be sourced|could not be verified|verification|this draft|citation needed|before publication|the original text/i;
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

const enrichmentSchema = z.object({
  canonicalStatus: z.enum(CANONICAL_LEGAL_STATUSES),
  instrument: nonEmptyString,
  designation: nonEmptyString.optional(),
  editorialNote: z.string().optional(),
  sources: supportedSourcesSchema,
}).strict();

const correctionSchema = countryEntrySchema.extend({
  oldEntry: z.object({
    status: nonEmptyString,
    notes: nonEmptyString,
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
  notesRepairs: z.record(z.string(), z.object({
    expectedNotes: nonEmptyString,
    newNotes: nonEmptyString,
  }).strict()).optional(),
}).strict().superRefine((draft, ctx) => {
  if (draft.international.length > 0 && draft.internationalSources.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["internationalSources"],
      message: "must be non-empty when international contains entries",
    });
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

function taskLanguageMatch(value: string) {
  return value.match(taskLanguagePattern)?.[0] ?? null;
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

  for (const country of Object.keys(parsed.data.entries)) {
    if (country in parsed.data.corrections) {
      errors.push(`entries.${country}: country cannot appear in both entries and corrections`);
    }
  }

  for (const [section, countries] of countrySets) {
    for (const [country, entry] of Object.entries(countries)) {
      const match = taskLanguageMatch(entry.notes);
      if (match) {
        warnings.push(
          `warning: ${section}.${country}.notes: task language "${match}" — move to editorialNote or repair the voice.`,
        );
      }
    }
  }

  const designationSets: Array<[
    "entries" | "corrections" | "enrichments",
    Record<string, { designation?: string }>,
  ]> = [
    ["entries", parsed.data.entries],
    ["corrections", parsed.data.corrections],
    ["enrichments", parsed.data.enrichments ?? {}],
  ];
  for (const [section, countries] of designationSets) {
    for (const [country, entry] of Object.entries(countries)) {
      const designation = entry.designation;
      if (designation && (designation.length > 40 || /[,;]/.test(designation))) {
        warnings.push(
          `warning: ${section}.${country}.designation: should be a compact tag (40 characters or fewer, without commas or semicolons).`,
        );
      }
    }
  }

  for (const [country, repair] of Object.entries(parsed.data.notesRepairs ?? {})) {
    if (!getCountryCode(country)) {
      errors.push(`notesRepairs.${country}: country key does not resolve to a country code`);
    }
    const match = taskLanguageMatch(repair.newNotes);
    if (match) {
      errors.push(`notesRepairs.${country}.newNotes: task language "${match}" is not allowed in repaired notes`);
    }
  }

  return { errors, warnings };
}

export function validateLegalityDraft(draft: unknown): string[] {
  return validateLegalityDraftWithWarnings(draft).errors;
}

export function validateLegalityDraftFile(runDir: string): string[] {
  const draftPath = resolve(runDir, "legality-draft.json");
  if (!existsSync(draftPath)) {
    return [`legality-draft.json: missing from ${resolve(runDir)}`];
  }

  try {
    return validateLegalityDraft(JSON.parse(readFileSync(draftPath, "utf8")));
  } catch (error) {
    return [`legality-draft.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`];
  }
}

export function validateLegalityDraftFileWithWarnings(runDir: string): LegalityDraftValidation {
  const draftPath = resolve(runDir, "legality-draft.json");
  if (!existsSync(draftPath)) {
    return {
      errors: [`legality-draft.json: missing from ${resolve(runDir)}`],
      warnings: [],
    };
  }

  try {
    return validateLegalityDraftWithWarnings(JSON.parse(readFileSync(draftPath, "utf8")));
  } catch (error) {
    return {
      errors: [`legality-draft.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`],
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
    console.error("Usage: npm run legality:validate -- --run runs/legality/<slug>");
    process.exitCode = 1;
    return;
  }

  const { errors, warnings } = validateLegalityDraftFileWithWarnings(runDir);
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
