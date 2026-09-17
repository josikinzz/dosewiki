/**
 * Generates the Drizzle Postgres schema and native model from the document schema.
 *
 * Source of truth: `server/schema.ts`, composed with owned definitions.
 * SQL columns, indexes, and document types are generated from the same validators.
 * Run `npm run generate:postgres-schema` after a document schema change.
 *
 * Mapping (migration decision D1):
 * - Table and column identifiers are kept verbatim so import needs no renames.
 * - `_id` text primary key; `_creation_time` double precision (float64 ms).
 * - Top-level scalars become typed columns; string-literal unions become text.
 * - Objects, arrays, records, `any`, and mixed unions become jsonb.
 * - A field that is both optional and nullable becomes jsonb so an absent
 *   field (SQL NULL) stays distinct from an explicit null (JSON null).
 * - `v.id("x")` becomes text. Reference edges are exported as data instead of
 *   foreign keys; the snapshot import reconciliation verifies them before
 *   constraints are added.
 * - Every document index becomes a btree index with `_creation_time` appended,
 *   matching the runtime's trailing sort key. Dotted index fields index
 *   the jsonb path expression.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { exportSchemaTables, objectFieldsOf, type ValidatorJson } from "./schemaExport";

export type ColumnKind = "text" | "double" | "boolean" | "bigint" | "bytea" | "jsonb";

/**
 * Indexes the handlers actually rely on being unique: consumed with
 * `.unique()`, or upserted by key so at most one row per key can exist.
 * Derived per query statement, not by proximity: an index merely read with
 * `.first()` or `order().take()` is NOT unique. Declaring one of those breaks
 * writes (a `warningBannerRevisions.key` unique index made every second banner
 * edit fail, since that table journals one row per change and reads the
 * newest). Every key below is verified duplicate-free on the 2026-09-09
 * production snapshot, ignoring NULLs.
 */
const UNIQUE_IDENTITIES: Partial<Record<string, readonly string[]>> = {
  articleDraftReceipts: ["by_owner_change"],
  articleDrafts: ["by_owner_slug"],
  articleProposalTargets: ["by_proposal_slug"],
  articleRevisions: ["by_actor_change"],
  contentRevisions: ["by_operation"],
  contributorAliasEvidence: ["by_profile_id_and_normalized_alias"],
  contributorAvatarHistory: ["by_profile_id_and_media_digest"],
  contributorIdentitySnapshotMaterializations: ["by_snapshot_digest"],
  contributorIdentityTokenSnapshots: ["by_snapshot_digest_and_normalized_token"],
  contributorProfileMergeOperations: ["by_operation_id", "by_rollback_operation_id"],
  contributorProfiles: ["by_key"],
  contributorReplicatorVerifications: ["by_profile_id"],
  copyBlocks: ["by_key"],
  generatedPublicationOperations: ["by_proposal_id"],
  inviteCodes: ["by_code_hash"],
  mailingListSubscribers: ["by_email_list"],
  memberships: ["by_email", "by_username", "by_reset_token_hash"],
  publicCachePublications: ["by_key"],
  publicReadIndexState: ["by_name"],
  replicationArtistTaxonomy: ["by_key"],
  replicationDuplicateReconciliations: ["by_component_id", "by_suppressed_replication_id"],
  replicationIdentityAttributions: ["by_replication_id"],
  replicationIdentityProfileBindings: ["by_artist_id"],
  replicationIdentitySocialOperationItems: ["by_item_operation_id"],
  replicationIdentitySocialOperations: ["by_operation_id"],
  replicationSocialAssets: ["by_entity_kind_and_entity_key_and_variant"],
  replicationSourceAttribution: ["by_replication_id"],
  replicationTaxonomyEvidence: ["by_replication_digest"],
  replications: ["by_source_catalog_id", "by_taxonomy_record_key"],
  // `server/lib/publicReadIndexes.ts` reduces this table to one row per
  // article and deletes any extras, so uniqueness is its own invariant.
  reviewedArticles: ["by_article"],
  substanceIndex: ["by_slug"],
  tripReports: ["by_slug"],
  warningBannerPresets: ["by_key"],
  warningBannerRevisions: ["by_change"],
};

type ColumnPlan = {
  name: string;
  kind: ColumnKind;
  /** Field may be absent from the stored document. */
  optional: boolean;
  /** Column accepts SQL NULL (absent field or explicit null on a scalar). */
  nullable: boolean;
  references?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../../lib/postgres/schema.generated.ts");
const MODEL_PATH = path.join(__dirname, "../../lib/postgres/runtime/dataModel.ts");
const PG_IDENTIFIER_LIMIT = 63;

function scalarKind(v: ValidatorJson): ColumnKind | null {
  switch (v.type) {
    case "string":
      return "text";
    case "number":
      return "double";
    case "boolean":
      return "boolean";
    case "int64":
      return "bigint";
    case "bytes":
      return "bytea";
    case "id":
      return "text";
    case "literal":
      return typeof v.value === "string" ? "text" : typeof v.value === "number" ? "double" : typeof v.value === "bigint" ? "bigint" : "boolean";
    default:
      return null;
  }
}

function planColumn(name: string, field: { fieldType: ValidatorJson; optional: boolean }): ColumnPlan {
  const v = field.fieldType;
  const references = v.type === "id" ? v.tableName : undefined;
  const direct = scalarKind(v);
  if (direct) {
    return { name, kind: direct, optional: field.optional, nullable: field.optional, references };
  }
  if (v.type === "union") {
    const members = v.value;
    const hasNull = members.some((m) => m.type === "null");
    const nonNull = members.filter((m) => m.type !== "null");
    const kinds = new Set(nonNull.map((m) => scalarKind(m)));
    const single = kinds.size === 1 ? [...kinds][0] : null;
    if (single && !(hasNull && field.optional)) {
      const idTargets = new Set(nonNull.map((m) => (m.type === "id" ? m.tableName : null)));
      const onlyTarget = idTargets.size === 1 ? [...idTargets][0] : null;
      return { name, kind: single, optional: field.optional, nullable: field.optional || hasNull, references: onlyTarget ?? undefined };
    }
  }
  return { name, kind: "jsonb", optional: field.optional, nullable: field.optional };
}

function indexName(table: string, descriptor: string): string {
  const full = `${table}_${descriptor}`;
  if (full.length <= PG_IDENTIFIER_LIMIT) return full;
  const digest = createHash("sha256").update(full).digest("hex").slice(0, 8);
  return `${full.slice(0, PG_IDENTIFIER_LIMIT - 9)}_${digest}`;
}

/**
 * Document strings retain code-unit ordering. Postgres' default locale collation
 * sorts punctuation differently ("25b-nboh" before "2-aminoindane"), so every
 * text index sorts `COLLATE "C"` and the runtime compares the same way.
 * Equality and uniqueness are unaffected: both collations are deterministic.
 */
function indexExpression(columns: Map<string, ColumnPlan>, field: string): string {
  if (field === "_creationTime") return "t._creationTime";
  const [head, ...rest] = field.split(".");
  const column = columns.get(head);
  if (!column) throw new Error(`Index field ${field} has no top-level column`);
  if (rest.length === 0) {
    const reference = `t[${JSON.stringify(head)}]`;
    return column.kind === "text" ? `sql\`\${${reference}} COLLATE "C"\`` : reference;
  }
  if (column.kind !== "jsonb") throw new Error(`Nested index field ${field} on non-jsonb column`);
  const pathSegments = rest.map((segment) => `'${segment.replace(/'/g, "''")}'`);
  const arrows = pathSegments.map((segment, index) => (index === pathSegments.length - 1 ? `->>${segment}` : `->${segment}`)).join("");
  return `sql\`(\${t[${JSON.stringify(head)}]}${arrows}) COLLATE "C"\``;
}

function columnBuilder(column: ColumnPlan): string {
  const name = JSON.stringify(column.name);
  const base =
    column.kind === "text"
      ? `text(${name})`
      : column.kind === "double"
        ? `doublePrecision(${name})`
        : column.kind === "boolean"
          ? `boolean(${name})`
          : column.kind === "bigint"
            ? `bigint(${name}, { mode: "bigint" })`
            : column.kind === "bytea"
              ? `customType<{ data: Uint8Array }>({ dataType: () => "bytea" })(${name})`
              : `jsonb(${name})`;
  return column.nullable ? base : `${base}.notNull()`;
}

function main() {
  const tables = exportSchemaTables().sort((a, b) => a.tableName.localeCompare(b.tableName));

  const lines: string[] = [];
  lines.push("// GENERATED FILE. Do not edit by hand.");
  lines.push("// Producer: scripts/postgres/generateDrizzleSchema.ts (npm run generate:postgres-schema)");
  lines.push("// Input: server/schema.ts composed export.");
  lines.push("");
  lines.push('import { sql } from "drizzle-orm";');
  lines.push('import { bigint, boolean, customType, doublePrecision, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";');
  lines.push("");
  lines.push('export type ColumnKind = "text" | "double" | "boolean" | "bigint" | "bytea" | "jsonb";');
  lines.push("");
  lines.push("/** `optional` means the document field may be absent; a NULL in such a column reconstructs as an absent field, otherwise as an explicit null. */");
  lines.push("export type ColumnSpec = { kind: ColumnKind; optional: boolean };");
  lines.push("");

  const kindsEntries: string[] = [];
  const referenceEntries: string[] = [];
  const uniqueEntries: string[] = [];
  const indexEntries: string[] = [];
  const tableNames: string[] = [];
  let bytea = false;

  for (const table of tables) {
    const fields = objectFieldsOf(table);
    if (table.searchIndexes.length || table.vectorIndexes.length) {
      throw new Error(`Table ${table.tableName} has search or vector indexes; extend the generator`);
    }
    const columns = new Map<string, ColumnPlan>();
    for (const [name, field] of Object.entries(fields)) {
      if (name.startsWith("_")) throw new Error(`Table ${table.tableName} declares reserved field ${name}`);
      columns.set(name, planColumn(name, field));
    }
    bytea ||= [...columns.values()].some((c) => c.kind === "bytea");
    tableNames.push(table.tableName);

    lines.push(`export const ${table.tableName} = pgTable(`);
    lines.push(`  ${JSON.stringify(table.tableName)},`);
    lines.push("  {");
    lines.push('    _id: text("_id").primaryKey(),');
    lines.push('    _creationTime: doublePrecision("_creationTime").notNull(),');
    for (const column of columns.values()) {
      lines.push(`    ${JSON.stringify(column.name)}: ${columnBuilder(column)},`);
    }
    lines.push("  },");
    lines.push("  (t) => [");
    lines.push(`    ${indexBuilder("index", indexName(table.tableName, "by_creation_time"), ["t._creationTime"])},`);
    for (const idx of table.indexes) {
      const expressions = idx.fields.map((field) => indexExpression(columns, field));
      const unique = UNIQUE_IDENTITIES[table.tableName]?.includes(idx.indexDescriptor);
      if (unique) lines.push(`    ${indexBuilder("uniqueIndex", indexName(table.tableName, `${idx.indexDescriptor}_unique`), expressions)},`);
      expressions.push("t._creationTime");
      lines.push(`    ${indexBuilder("index", indexName(table.tableName, idx.indexDescriptor), expressions)},`);
    }
    lines.push("  ],");
    lines.push(");");
    lines.push("");

    const specs = [...columns.values()].map((c) => `${JSON.stringify(c.name)}: { kind: ${JSON.stringify(c.kind)}, optional: ${c.optional} }`);
    kindsEntries.push(`  ${table.tableName}: { _id: { kind: "text", optional: false }, _creationTime: { kind: "double", optional: false }, ${specs.join(", ")} },`);
    const refs = [...columns.values()].filter((c) => c.references).map((c) => `${JSON.stringify(c.name)}: ${JSON.stringify(c.references)}`);
    if (refs.length) referenceEntries.push(`  ${table.tableName}: { ${refs.join(", ")} },`);
    const uniqueKeys = table.indexes
      .filter((idx) => UNIQUE_IDENTITIES[table.tableName]?.includes(idx.indexDescriptor))
      .map((idx) => JSON.stringify(idx.fields));
    if (uniqueKeys.length) uniqueEntries.push(`  ${table.tableName}: [${uniqueKeys.join(", ")}],`);
    const indexMeta = table.indexes.map((idx) => `${JSON.stringify(idx.indexDescriptor)}: ${JSON.stringify(idx.fields)}`);
    indexEntries.push(`  ${table.tableName}: { ${indexMeta.join(", ")} },`);
  }

  lines.push("/** Column storage specs per table, for import encoding and lossless reconstruction. */");
  lines.push("export const tableColumns = {");
  lines.push(...kindsEntries);
  lines.push("} as const satisfies Record<string, Record<string, ColumnSpec>>;");
  lines.push("");
  lines.push("/** `v.id()` reference edges: table -> column -> referenced table. Not enforced as foreign keys yet. */");
  lines.push("export const tableReferences = {");
  lines.push(...referenceEntries);
  lines.push("} as const satisfies Record<string, Record<string, string>>;");
  lines.push("");
  lines.push("/** Identity keys enforced by unique indexes (migration 0001); fixtures and writers must keep them distinct. */");
  lines.push("export const tableUniqueKeys = {");
  lines.push(...uniqueEntries);
  lines.push("} as const satisfies Record<string, readonly (readonly string[])[]>;");
  lines.push("");
  lines.push("/** Document index descriptors per table: name -> indexed fields in order (`_creationTime` is implicitly last). */");
  lines.push("export const tableIndexes = {");
  lines.push(...indexEntries);
  lines.push("} as const satisfies Record<string, Record<string, readonly string[]>>;");
  lines.push("");
  lines.push("export const tableNames = [");
  lines.push(...tableNames.map((name) => `  ${JSON.stringify(name)},`));
  lines.push("] as const;");
  lines.push("");
  lines.push("export type TableName = (typeof tableNames)[number];");
  lines.push("");
  lines.push("export const tables = {");
  lines.push(...tableNames.map((name) => `  ${name},`));
  lines.push("} as const;");
  lines.push("");

  let output = lines.join("\n");
  if (!bytea) output = output.replace("customType, ", "");
  if (!output.includes("uniqueIndex(")) output = output.replace(", uniqueIndex", "");
  if (!output.includes("bigint(")) output = output.replace("bigint, ", "");

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output);
  fs.writeFileSync(MODEL_PATH, `// GENERATED FILE. Do not edit by hand.
// Producer: scripts/postgres/generateDrizzleSchema.ts (npm run generate:postgres-schema)
import type schema from "../../../server/schema";
import type { Id as DocumentId } from "./values";

export type TableNames = keyof typeof schema.tables;
export type Id<Table extends TableNames | "_storage" | "_scheduled_functions"> = DocumentId<Table>;
export type Doc<Table extends TableNames> = (typeof schema.tables)[Table]["validator"]["type"] & { _id: Id<Table>; _creationTime: number };
type DeclaredIndexes<Table extends TableNames> = (typeof schema.tables)[Table]["indexTypes"];
export type DataModel = {
  [Table in TableNames]: {
    document: Doc<Table>;
    fieldPaths: (typeof schema.tables)[Table]["validator"]["fieldPaths"] | "_id" | "_creationTime";
    indexes: { [Name in keyof DeclaredIndexes<Table>]: readonly [...Extract<DeclaredIndexes<Table>[Name], readonly string[]>, "_creationTime"] } & { by_id: readonly ["_id"]; by_creation_time: readonly ["_creationTime"] };
    searchIndexes: {};
    vectorIndexes: {};
  };
};
`);
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_PATH)}: ${tables.length} tables, ${tables.reduce((n, t) => n + t.indexes.length + 1, 0)} indexes`);
  console.log(`Wrote ${path.relative(process.cwd(), MODEL_PATH)}: native document and index types`);
}

function indexBuilder(kind: "index" | "uniqueIndex", name: string, expressions: string[]): string {
  return `${kind}(${JSON.stringify(name)}).on(${expressions.join(", ")})`;
}

main();
