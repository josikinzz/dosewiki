import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectAppCallsites,
  collectFileCallsites,
  identifierFromFunctionName,
} from "./data-app-callsites.mjs";
import {
  collectModuleFunctions,
  dataModuleIdFromPath,
} from "./data-function-inventory.mjs";

const MODULE_SOURCE = `
import { mutation, query, internalMutation, type MutationCtx } from "../lib/postgres/runtime/server";
import type { QueryCtx } from "../lib/postgres/runtime/server";
import { v } from "../lib/postgres/runtime/values";

export const getBySlug = query({ args: { slug: v.string() }, handler: async () => null });
export const setArticleField = mutation({ args: {}, handler: async () => null });
export const replaceAllSubstances = internalMutation({ args: {}, handler: async () => null });

const notExported = query({ args: {}, handler: async () => null });
export const helper = (ctx: QueryCtx) => ctx;
export const versionLabel = "v1";
`;

test("module enumeration finds public and internal builders, and nothing else", () => {
  const functions = collectModuleFunctions({
    modulePath: "substanceIndex.ts",
    source: MODULE_SOURCE,
  });

  assert.deepEqual(
    functions.map((entry) => entry.identifier),
    [
      "substanceIndex.js:getBySlug",
      "substanceIndex.js:setArticleField",
      "substanceIndex.js:replaceAllSubstances",
    ],
  );
  assert.deepEqual(
    functions.map((entry) => `${entry.functionType}/${entry.visibility}`),
    ["Query/public", "Mutation/public", "Mutation/internal"],
  );
});

test("aliased and type-only imports are handled", () => {
  const functions = collectModuleFunctions({
    modulePath: "quotes.ts",
    source: `
      import { query as readQuery, type MutationCtx } from "../lib/postgres/runtime/server";
      export const getAll = readQuery({ args: {}, handler: async () => null });
      export const shim = (ctx: MutationCtx) => ctx;
    `,
  });
  assert.deepEqual(
    functions.map((entry) => entry.identifier),
    ["quotes.js:getAll"],
  );
});

test("indexed mutation registrations retain public and internal callable identities", () => {
  const functions = collectModuleFunctions({
    modulePath: "publicReadIndexes.ts",
    source: `
      import { mutation, internalMutation } from "./lib/indexedMutation";
      export const save = mutation({ args: {}, handler: async () => null });
      export const backfill = internalMutation({ args: {}, handler: async () => null });
    `,
  });
  assert.deepEqual(functions.map(({ identifier, functionType, visibility }) => ({
    identifier, functionType, visibility,
  })), [
    { identifier: "publicReadIndexes.js:save", functionType: "Mutation", visibility: "public" },
    { identifier: "publicReadIndexes.js:backfill", functionType: "Mutation", visibility: "internal" },
  ]);
});

test("a module without native builder imports defines no functions", () => {
  const functions = collectModuleFunctions({
    modulePath: "lib/validators.ts",
    source: `
      import { v } from "../lib/postgres/runtime/values";
      export const query = (x) => x;
      export const slugValidator = query({ args: {} });
    `,
  });
  assert.deepEqual(functions, []);
});

test("module identifiers use canonical relative handler paths", () => {
  assert.equal(dataModuleIdFromPath("substanceIndex.ts"), "substanceIndex.js");
  assert.equal(dataModuleIdFromPath("lib/auth.ts"), "lib/auth.js");
  assert.equal(dataModuleIdFromPath("server/lib/auth.ts"), "lib/auth.js");
});

test("api.* call sites are collected and string lookalikes are not", () => {
  const callsites = collectFileCallsites({
    filePath: "src/features/dev/Thing.tsx",
    source: `
      import { api } from "../../../lib/postgres/runtime/api";
      const iconHost = "api.iconify.design";
      const at = "12:30";
      export function Thing() {
        const data = useQuery(api.substanceIndex.getBySlug, { slug });
        const nested = useQuery(api.lib.auth.whoami, {});
        const save = useMutation(api.substanceIndex.setArticleField);
        return [data, nested, save, iconHost, at];
      }
    `,
    knownModules: new Set(["substanceIndex.js", "lib/auth.js"]),
  });

  assert.deepEqual(
    callsites.map((entry) => entry.identifier).sort(),
    ["lib/auth.js:whoami", "substanceIndex.js:getBySlug", "substanceIndex.js:setArticleField"],
  );
  assert.ok(callsites.every((entry) => entry.form === "api"));
});

test("string function names are collected, which is where typecheck sees nothing", () => {
  // lib/data/publicData.reads.ts addresses production by string. Nothing type
  // checks those names, so they are the call sites most able to rot unnoticed.
  const callsites = collectFileCallsites({
    filePath: "lib/data/publicData.reads.ts",
    source: `
      export const reads = {
        publicSubstanceBySlug: { functionName: "substanceIndex:getPublicBySlug", args: () => ({}) },
        label: { title: "Dose: guidance" },
      };
    `,
    knownModules: new Set(["substanceIndex.js"]),
  });

  assert.deepEqual(
    callsites.map((entry) => entry.identifier),
    ["substanceIndex.js:getPublicBySlug"],
  );
  assert.equal(callsites[0].form, "string");
});

test("string names for modules this checkout does not have are ignored", () => {
  const callsites = collectFileCallsites({
    filePath: "src/copy.ts",
    source: `export const note = "warning:severe";`,
    knownModules: new Set(["substanceIndex.js"]),
  });
  assert.deepEqual(callsites, []);
});

test("call sites merge across files and record every referencing file", () => {
  const merged = collectAppCallsites({
    files: [
      {
        filePath: "src/one.ts",
        source: `import { api } from "../lib/postgres/runtime/api"; useQuery(api.quotes.getBySlug);`,
      },
      {
        filePath: "src/two.ts",
        source: `export const name = "quotes:getBySlug";`,
      },
    ],
    knownModules: new Set(["quotes.js"]),
  });

  assert.deepEqual(merged, [
    {
      identifier: "quotes.js:getBySlug",
      forms: ["api", "string"],
      files: ["src/one.ts", "src/two.ts"],
    },
  ]);
});

test("identifierFromFunctionName normalizes native callable names", () => {
  assert.equal(
    identifierFromFunctionName("substanceIndex:getPublicBySlug"),
    "substanceIndex.js:getPublicBySlug",
  );
  assert.equal(identifierFromFunctionName("lib/auth:whoami"), "lib/auth.js:whoami");
});
