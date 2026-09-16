/**
 * Builds a field-level apply plan from the reviewed proposal decisions.
 *
 * Reads the live article from Postgres, converts each approved patch from the
 * review model into the storage model, validates the resulting document against
 * the real Zod contract, and writes a plan file. Nothing is written to Postgres
 * here: this command is read-only and its output is reviewable.
 *
 * A record whose patches cannot be converted without guessing is REFUSED and
 * listed for a human decision rather than approximated.
 *
 * Usage:
 *   bun scripts/review/build-review-plan.ts \
 *     --work outputs/review-decisions/work.json \
 *     --out  outputs/review-decisions/plan.json \
 *     [--overrides outputs/review-decisions/overrides.json] \
 *     [--only <recordId,recordId>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  RefusalError,
  assertCitationsResolve,
  assertNoInventedNumbers,
  getByPath,
  mergeReferences,
  normalizeFieldPath,
  renderProse,
  resolveRouteIndex,
  setByPath,
  validateArticle,
  visibilityFields,
} from "./lib/reviewDecisionTransforms";
import {
  asBindingSites,
  asCountryLegality,
  asNamedItems,
  asParagraphs,
  asRange,
  asStageList,
  asStageMap,
  collectSourceIds,
  describeShape,
  doseTierFor,
  stageKeyFor,
} from "./lib/reviewEnvelopes";


type Patch = { operation: string; path: string; before?: unknown; after?: unknown };
type ReviewRecord = {
  id: string;
  slug: string;
  article: string;
  _kind?: string;
  research: {
    patches?: Patch[];
    target?: { section?: string };
    sources?: Array<{ id: string; bibliography?: string; url?: string }>;
    community_sources?: Array<{ site?: string; url?: string; quote?: string }>;
  };
  decision: { decision: string; outcome: string; note?: string };
};

type PlannedChange = {
  recordId: string;
  storagePath: string;
  reviewPath: string;
  before: unknown;
  after: unknown;
  kind: string;
};

type Refusal = { recordId: string; slug: string; reviewPath: string; shape: string; reason: string };

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const workPath = args.work ?? "outputs/review-decisions/work.json";
const outPath = args.out ?? "outputs/review-decisions/plan.json";
const onlyIds = args.only ? new Set(args.only.split(",").map((id) => id.trim())) : null;

const records: ReviewRecord[] = JSON.parse(readFileSync(workPath, "utf8"));

/** Values supplied by an editorial decision for records the code refuses. */
type Override = {
  recordId: string;
  changes: Array<{ path: string; value?: unknown; create?: boolean; remove?: boolean }>;
};
const overrides = new Map<string, Override>();
if (args.overrides) {
  const parsed: Override[] = JSON.parse(readFileSync(args.overrides, "utf8"));
  for (const entry of parsed) overrides.set(entry.recordId, entry);
}

/** Articles this run must hide, decided by the reviewer's own notes. */
const HIDE_DECISIONS: Record<string, "hidden" | "direct_url_only"> = {
  "2c-b-an::2": "hidden",
  "2c-ip::5": "hidden",
  "3-cl-pcp::1": "direct_url_only",
  "ept::1": "hidden",
  "psilocin::1": "hidden",
  "2c-b-fly-nbome::1": "hidden",
  "25i-nbf::5": "hidden",
};

/**
 * Route-bearing section prefixes. A path such as `duration.oral` or
 * `duration.routes[oral]` names a route by NAME, which is a value inside the
 * array rather than a key, so it must be resolved against the live document.
 */
const ROUTE_SECTIONS: Record<string, true> = { duration: true, dosage: true };

type RouteTarget = { section: string; routeIndex: number; rest: string[] };

/**
 * Resolves the route portion of a normalized path, returning the array index.
 * Returns null when the path does not address a route.
 */
function resolveRouteTarget(article: unknown, storagePath: string): RouteTarget | null {
  const segments = storagePath.split(".");
  const section = segments[0];
  if (!ROUTE_SECTIONS[section]) return null;
  const routes = getByPath(article, `${section}.routes`);
  const second = segments[1] ?? "";

  // `duration.routes[oral]...` or `duration.routes[0]...`
  const bracket = second.match(/^routes\[(.*)\]$/);
  if (bracket) {
    const inner = bracket[1];
    if (inner === "") return null; // `routes[]` is an append, handled separately.
    const routeIndex = /^\d+$/.test(inner) ? Number(inner) : resolveRouteIndex(routes, inner);
    return { section, routeIndex, rest: segments.slice(2) };
  }
  // `duration.routes.oral...`
  if (second === "routes" && segments[2]) {
    const third = segments[2];
    if (/^\d+$/.test(third)) {
      return { section, routeIndex: Number(third), rest: segments.slice(3) };
    }
    return { section, routeIndex: resolveRouteIndex(routes, third), rest: segments.slice(3) };
  }
  // `duration.oral...` - the review model's shorthand.
  if (second && second !== "routes") {
    return { section, routeIndex: resolveRouteIndex(routes, second), rest: segments.slice(2) };
  }
  return null;
}

/** Prose fields whose emptiness is `""` rather than a null range or []. */
const PROSE_LEAVES: Record<string, true> = {
  pharmacokinetics: true,
  pharmacodynamics: true,
  summary: true,
  notes: true,
  half_life: true,
  half_life_notes: true,
  full_tolerance: true,
  half_tolerance: true,
  baseline_tolerance: true,
  bioavailability: true,
  bioavailability_notes: true,
};

const { client, fingerprint: sourceDeployment } = createDataClient();
const articleCache = new Map<string, unknown>();

async function loadArticle(slug: string): Promise<unknown> {
  const cached = articleCache.get(slug);
  if (cached) return cached;
  const document = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!document) throw new RefusalError(`no article stored for slug "${slug}"`);
  articleCache.set(slug, document);
  return document;
}

const changesBySlug = new Map<string, PlannedChange[]>();
const referencesBySlug = new Map<string, unknown>();
const refusals: Refusal[] = [];
const appliedRecords = new Set<string>();

/**
 * Rewrites every `[cite:<reviewSourceId>]` marker inside a value to the real
 * reference id, leaving markers that already name a reference untouched.
 */
function remapCitationsDeep(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g, (match, id: string) => {
      const resolved = idMap.get(id);
      return resolved ? `[cite:${resolved}]` : match;
    });
  }
  if (Array.isArray(value)) return value.map((item) => remapCitationsDeep(item, idMap));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, remapCitationsDeep(child, idMap)]),
    );
  }
  return value;
}

/**
 * Kinds that legitimately create a key that did not exist before: a country
 * absent from `legality.countries`, or a whole new route object.
 */
const CREATING_KINDS: Record<string, true> = {
  legality: true,
  route_append: true,
  override_create: true,
};

/**
 * Records the change and mutates the working document so later patches stack.
 *
 * Refuses when the target leaf did not already exist and the change is not an
 * explicit creation. Every stage, tier, and prose field is a REQUIRED key that
 * is present-but-empty when unknown, so an absent leaf means the path is wrong -
 * and Postgres would accept the resulting orphan key silently.
 */
function stage(working: unknown, slug: string, change: Omit<PlannedChange, "before">): void {
  const before = getByPath(working, change.storagePath);
  if (before === undefined && !CREATING_KINDS[change.kind]) {
    throw new RefusalError(
      `"${change.storagePath}" does not exist on the stored document, so the review path "${change.reviewPath}" resolved wrongly`,
    );
  }
  // Type preservation: writing prose over an array or a route object is the
  // signature of a path that resolved to the wrong depth. Postgres accepts it
  // silently, so the refusal has to happen here.
  if (before !== undefined && !CREATING_KINDS[change.kind]) {
    const shapeOf = (value: unknown): string =>
      Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const beforeShape = shapeOf(before);
    const afterShape = shapeOf(change.after);
    const bothEmptyable = beforeShape === "string" && afterShape === "string";
    if (!bothEmptyable && beforeShape !== afterShape) {
      throw new RefusalError(
        `"${change.storagePath}" stores ${beforeShape} but the conversion produced ${afterShape}; the review path "${change.reviewPath}" resolved to the wrong depth`,
      );
    }
  }
  setByPath(working, change.storagePath, change.after);
  const list = changesBySlug.get(slug) ?? [];
  list.push({ ...change, before });
  changesBySlug.set(slug, list);
}

/**
 * Records route-level attribution for a dose/duration change.
 *
 * A stage is `{min,max,unit}` with nowhere to put an inline marker, so the
 * convention is that structured route data cites through the route's
 * `reference_ids` array (src/schema/substance/duration.ts:21, dosage.ts:21).
 * Without this, every numeric change in the run would land unattributed.
 */
function attributeRoute(
  working: unknown,
  slug: string,
  recordId: string,
  section: string,
  routeIndex: number,
  idMap: Map<string, string>,
): void {
  if (!idMap.size) return;
  const attributionPath = `${section}.routes[${routeIndex}].reference_ids`;
  const existing = getByPath(working, attributionPath);
  const current = Array.isArray(existing)
    ? existing.filter((entry): entry is string => typeof entry === "string")
    : [];
  const merged = [...current];
  for (const referenceId of idMap.values()) {
    if (!merged.includes(referenceId)) merged.push(referenceId);
  }
  if (merged.length === current.length) return;
  stage(working, slug, {
    recordId,
    storagePath: attributionPath,
    reviewPath: "(route attribution)",
    after: merged,
    // `reference_ids` is optional in the schema, so it may legitimately be absent.
    kind: existing === undefined ? "override_create" : "attribution",
  });
}

for (const record of records) {
  if (onlyIds && !onlyIds.has(record.id)) continue;
  // Code fixes touch the review exporter, not article data, and the tracker
  // no-op carries an unmade editorial choice. Neither is an article write.
  if (record._kind === "E-codefix" || record._kind === "F-tracker-noop") continue;
  // `hide` and `redirect` are not article-field edits. Hiding is implemented by
  // the visibility write below; the Sonata redirect is implemented by an entry in
  // lib/next/substanceRouteAliases.ts. Treating either as a field patch would
  // report a refusal for work that is already done elsewhere.
  const patches = (record.research.patches ?? []).filter(
    (patch) =>
      patch.operation !== "none" && patch.operation !== "hide" && patch.operation !== "redirect",
  );
  const hideOutcome = HIDE_DECISIONS[record.id];
  if (!patches.length && !hideOutcome) continue;

  let working: unknown;
  try {
    working = await loadArticle(record.slug);
  } catch (error) {
    refusals.push({
      recordId: record.id,
      slug: record.slug,
      reviewPath: "(article)",
      shape: "-",
      reason: error instanceof Error ? error.message : String(error),
    });
    continue;
  }

  // Resolve every review-local source id this record cites, once per record.
  // A marker may also name an id that is already a real reference, so only ids
  // the record actually supplied as sources are treated as review-local.
  //
  // An editorial override REPLACES the patch values, and it cites the record's
  // source ids directly, so its values are scanned too. Scanning only the
  // original patches leaves those markers unmapped and orphaned.
  const pendingOverride = overrides.get(record.id);
  const citedPayloads: unknown[] = patches.map((patch) => patch.after);
  if (pendingOverride) {
    for (const change of pendingOverride.changes) citedPayloads.push(change.value);
  }
  const suppliedSourceIds = new Set((record.research.sources ?? []).map((source) => source.id));
  const usedSourceIds = collectSourceIds(citedPayloads).filter((id) =>
    suppliedSourceIds.has(id),
  );
  let idMap = new Map<string, string>();
  try {
    if (usedSourceIds.length) {
      const existing = getByPath(working, "references");
      const merged = mergeReferences(
        Array.isArray(existing) ? existing : [],
        record.research.sources ?? [],
        usedSourceIds,
      );
      idMap = merged.idMap;
      setByPath(working, "references", merged.references);
      referencesBySlug.set(record.slug, merged.references);
    }
  } catch (error) {
    refusals.push({
      recordId: record.id,
      slug: record.slug,
      reviewPath: "(references)",
      shape: usedSourceIds.join(","),
      reason: error instanceof Error ? error.message : String(error),
    });
    continue;
  }

  const override = overrides.get(record.id);
  let recordFailed = false;

  if (override) {
    // Removals splice a route out of its array, so they run after the record's
    // other changes: an index resolved before a splice would then be stale.
    const removals = override.changes.filter((change) => change.remove);
    for (const change of override.changes.filter((entry) => !entry.remove)) {
      try {
        // An editorial value cites the record's own source ids; the mapping to
        // real reference ids stays the code's job so a hand-written value can
        // never orphan a marker.
        const value = remapCitationsDeep(change.value, idMap);
        // A surgical edit reproduces the untouched sentences of the live field,
        // so numbers already published at this path are permitted alongside the
        // reviewed evidence. Anything outside both is still an invention.
        assertNoInventedNumbers(value, [
          ...patches.map((patch) => patch.after),
          getByPath(working, change.path),
        ]);
        stage(working, record.slug, {
          recordId: record.id,
          storagePath: change.path,
          reviewPath: "(editorial override)",
          after: value,
          kind: change.create ? "override_create" : "override",
        });
      } catch (error) {
        recordFailed = true;
        refusals.push({
          recordId: record.id,
          slug: record.slug,
          reviewPath: change.path,
          shape: describeShape(change.value),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const change of removals) {
      try {
        const storagePath = normalizeFieldPath(change.path);
        const match = storagePath.match(/^(duration|dosage)\.routes\[(.+)\]$/);
        if (!match) {
          throw new RefusalError(
            `a removal must address a whole route as "<duration|dosage>.routes[<name>]", got "${change.path}"`,
          );
        }
        const section = match[1];
        const routes = getByPath(working, `${section}.routes`);
        if (!Array.isArray(routes)) throw new RefusalError(`${section}.routes is not an array`);
        const index = /^\d+$/.test(match[2])
          ? Number(match[2])
          : resolveRouteIndex(routes, match[2]);
        const removed = routes[index];
        routes.splice(index, 1);
        const list = changesBySlug.get(record.slug) ?? [];
        list.push({
          recordId: record.id,
          storagePath: `${section}.routes[${index}]`,
          reviewPath: "(editorial removal)",
          before: removed,
          after: null,
          kind: "route_removal",
        });
        changesBySlug.set(record.slug, list);
      } catch (error) {
        recordFailed = true;
        refusals.push({
          recordId: record.id,
          slug: record.slug,
          reviewPath: change.path,
          shape: "route removal",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else {
    for (const patch of patches) {
      try {
        const storagePath = normalizeFieldPath(patch.path);
        const routeTarget = resolveRouteTarget(working, storagePath);
        const leaf = storagePath.split(".").pop() ?? "";

        // ---- a removal clears the field in the shape its schema requires ----
        if (patch.after === null || patch.after === undefined) {
          const target = routeTarget
            ? [`${routeTarget.section}.routes[${routeTarget.routeIndex}]`, ...routeTarget.rest].join(
                ".",
              )
            : storagePath;
          const current = getByPath(working, target);
          const cleared = Array.isArray(current)
            ? []
            : PROSE_LEAVES[leaf]
              ? ""
              : current && typeof current === "object" && "unit" in current
                ? { min: null, max: null, unit: "" }
                : "";
          stage(working, record.slug, {
            recordId: record.id,
            storagePath: target,
            reviewPath: patch.path,
            after: cleared,
            kind: "removal",
          });
          continue;
        }

        // ---- duration stage map / list, written stage by stage ----
        const stageMap = asStageMap(patch.after) ?? asStageList(patch.after);
        if (stageMap && routeTarget) {
          for (const [stageKey, range] of Object.entries(stageMap)) {
            stage(working, record.slug, {
              recordId: record.id,
              storagePath: `${routeTarget.section}.routes[${routeTarget.routeIndex}].stages.${stageKey}`,
              reviewPath: patch.path,
              after: range,
              kind: "stage",
            });
          }
          attributeRoute(
            working,
            record.slug,
            record.id,
            routeTarget.section,
            routeTarget.routeIndex,
            idMap,
          );
          continue;
        }

        // ---- a single range, at a named stage, a bare stage/tier, or a leaf --
        const rangeTarget = asRange(patch.after);
        if (rangeTarget && routeTarget) {
          const routeRoot = `${routeTarget.section}.routes[${routeTarget.routeIndex}]`;
          // The stage may be named inside the value, or be the path's own last
          // segment. A bare stage or tier name lives under `stages` /
          // `dose_ranges`, never directly on the route object.
          const namedStage = rangeTarget.stage ? stageKeyFor(rangeTarget.stage) : null;
          const restHead = routeTarget.rest[0] ?? "";
          const restStage = stageKeyFor(restHead);
          const restTier = doseTierFor(restHead);
          let target: string;
          if (namedStage) {
            target = `${routeRoot}.stages.${namedStage}`;
          } else if (routeTarget.rest.length === 1 && restStage) {
            target = `${routeRoot}.stages.${restStage}`;
          } else if (routeTarget.rest.length === 1 && restTier) {
            target = `${routeRoot}.dose_ranges.${restTier}`;
          } else {
            const restPath = routeTarget.rest.join(".");
            target = `${routeRoot}${restPath ? `.${restPath}` : ""}`;
          }
          assertNoInventedNumbers(rangeTarget.range, patch.after);
          stage(working, record.slug, {
            recordId: record.id,
            storagePath: target,
            reviewPath: patch.path,
            after: rangeTarget.range,
            kind: "range",
          });
          attributeRoute(
            working,
            record.slug,
            record.id,
            routeTarget.section,
            routeTarget.routeIndex,
            idMap,
          );
          continue;
        }

        // ---- binding sites ----
        if (leaf === "binding_sites") {
          const sites = asBindingSites(patch.after);
          if (!sites) throw new RefusalError("binding-site payload did not normalize");
          assertNoInventedNumbers(sites, patch.after);
          stage(working, record.slug, {
            recordId: record.id,
            storagePath,
            reviewPath: patch.path,
            after: sites,
            kind: "binding_sites",
          });
          continue;
        }

        // ---- legality country ----
        if (storagePath.startsWith("legality.countries")) {
          const normalized = asCountryLegality(patch.after);
          if (!normalized) throw new RefusalError("legality payload did not normalize");
          const entry = { ...normalized.entry };
          if (normalized.noteParagraphs) {
            entry.notes = renderProse(normalized.noteParagraphs, idMap);
          }
          assertNoInventedNumbers(entry, patch.after);
          stage(working, record.slug, {
            recordId: record.id,
            storagePath,
            reviewPath: patch.path,
            after: entry,
            kind: "legality",
          });
          continue;
        }

        // ---- metabolites / cross-tolerance name lists ----
        if (leaf === "metabolites" || leaf === "cross_tolerance") {
          const named = asNamedItems(patch.after);
          if (named) {
            const suffix = named.sourceIds
              .map((sourceId) => {
                const resolved = idMap.get(sourceId);
                if (!resolved) throw new RefusalError(`unmapped source ${sourceId}`);
                return `[cite:${resolved}]`;
              })
              .join("");
            const items = named.items.map((item, index) =>
              index === named.items.length - 1 ? `${item}${suffix}` : item,
            );
            assertNoInventedNumbers(items, patch.after);
            stage(working, record.slug, {
              recordId: record.id,
              storagePath,
              reviewPath: patch.path,
              after: items,
              kind: "named_items",
            });
            continue;
          }
        }

        // ---- prose ----
        const paragraphs = asParagraphs(patch.after);
        if (paragraphs) {
          const prose = renderProse(paragraphs, idMap);
          assertNoInventedNumbers(prose, patch.after);
          const target = routeTarget
            ? [`${routeTarget.section}.routes[${routeTarget.routeIndex}]`, ...routeTarget.rest].join(
                ".",
              )
            : storagePath;
          stage(working, record.slug, {
            recordId: record.id,
            storagePath: target,
            reviewPath: patch.path,
            after: prose,
            kind: "prose",
          });
          continue;
        }

        throw new RefusalError(`no deterministic conversion for ${describeShape(patch.after)}`);
      } catch (error) {
        recordFailed = true;
        refusals.push({
          recordId: record.id,
          slug: record.slug,
          reviewPath: patch.path,
          shape: describeShape(patch.after),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ---- visibility, decided by the reviewer's note rather than the patch ----
  if (hideOutcome) {
    const current = {
      index_categories: getByPath(working, "index_categories"),
      priority: getByPath(working, "priority"),
    };
    const fields = visibilityFields(
      {
        index_categories: Array.isArray(current.index_categories)
          ? current.index_categories.filter((value): value is string => typeof value === "string")
          : [],
        priority: typeof current.priority === "string" ? current.priority : null,
      },
      hideOutcome,
    );
    for (const [key, value] of Object.entries(fields)) {
      stage(working, record.slug, {
        recordId: record.id,
        storagePath: key,
        reviewPath: "(reviewer note)",
        after: value,
        kind: "visibility",
      });
    }
  }

  if (!recordFailed) appliedRecords.add(record.id);
}

// ---- validate every touched article as a whole document ----
const validationFailures: Array<{ slug: string; reason: string }> = [];
for (const slug of changesBySlug.keys()) {
  const working = articleCache.get(slug);
  try {
    assertCitationsResolve(working, slug);
    validateArticle(working, slug);
  } catch (error) {
    validationFailures.push({
      slug,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

const plan = {
  generatedAt: new Date().toISOString(),
  sourceDeployment,
  articles: [...changesBySlug.entries()].map(([slug, changes]) => ({
    slug,
    changes,
    references: referencesBySlug.get(slug) ?? null,
    document: articleCache.get(slug),
  })),
  appliedRecords: [...appliedRecords].sort(),
  refusals,
  validationFailures,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(plan, null, 1));

const changeCount = [...changesBySlug.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`articles touched : ${changesBySlug.size}`);
console.log(`field changes    : ${changeCount}`);
console.log(`records applied  : ${appliedRecords.size}`);
console.log(`records refused  : ${new Set(refusals.map((entry) => entry.recordId)).size}`);
console.log(`validation fails : ${validationFailures.length}`);
console.log(`\nplan written to ${outPath}`);

if (refusals.length) {
  console.log("\nrefusals:");
  for (const refusal of refusals) {
    console.log(`  ${refusal.recordId.padEnd(20)} ${refusal.shape}`);
    console.log(`      ${refusal.reason.slice(0, 200)}`);
  }
}
if (validationFailures.length) {
  console.log("\nvalidation failures:");
  for (const failure of validationFailures) {
    console.log(`  ${failure.slug}: ${failure.reason.slice(0, 300)}`);
  }
}
