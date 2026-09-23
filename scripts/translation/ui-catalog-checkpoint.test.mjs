import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acceptedCheckpointTarget, catalogCheckpointKey, catalogUsesVCode, readCatalogCheckpoint, writeCatalogCheckpoint } from "./ui-catalog-checkpoint.mjs";
import { validateSegment } from "./validate.mjs";
import { resolveLocale } from "./locales.mjs";

test("checkpoint identity ignores object order but changes for every prompt dependency", () => {
  const input = { locale: "zh-Hans", unit: { source: "Light", context: "Appearance", markup: false }, glossary: { light: "浅色" }, kinds: {}, glosses: {}, model: "model-a", implementation: ["one"], approvedOverrides: {} };
  const key = catalogCheckpointKey(input);
  assert.equal(catalogCheckpointKey(Object.fromEntries(Object.entries(input).reverse())), key);
  for (const field of Object.keys(input)) assert.notEqual(catalogCheckpointKey({ ...input, [field]: "changed" }), key, field);
});

test("accepted batches persist across a failed run and resume only after current validation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "catalog-checkpoint-"));
  try {
    const filename = path.join(directory, "checkpoint.json");
    assert.deepEqual(await readCatalogCheckpoint(filename), {});
    const key = catalogCheckpointKey({ source: "Light" });
    await writeCatalogCheckpoint(filename, { [key]: "浅色" });
    const entries = await readCatalogCheckpoint(filename);
    const validate = (target) => validateSegment({ source: "Light", target, locale: resolveLocale("zh-Hans"), exactTarget: "浅色" });
    assert.equal(acceptedCheckpointTarget(entries, key, validate), "浅色");
    assert.equal(acceptedCheckpointTarget({ [key]: "轻度" }, key, validate), null);
    assert.equal(acceptedCheckpointTarget(entries, catalogCheckpointKey({ source: "Dark" }), validate), null);
    await writeCatalogCheckpoint(filename, { ...entries, [catalogCheckpointKey({ source: "Dark" })]: "深色" });
    assert.equal(Object.keys(await readCatalogCheckpoint(filename)).length, 2);
  } finally { await rm(directory, { recursive: true }); }
});

test("Markdown links remain under link-target validation and VCode uses the tag gate", () => {
  assert.equal(catalogUsesVCode("Join [here.]({{discordInvite}})"), false);
  assert.equal(catalogUsesVCode("[b]bold[/b]"), true);
  assert.equal(catalogUsesVCode("[sup](common)"), true);
  assert.equal(catalogUsesVCode("[int-link to=\"/effects/x\"]word[/int-link]"), true);
  const result = validateSegment({ source: "Join [here.]({{discordInvite}})", target: "在[这里](https://wrong.test)加入", locale: resolveLocale("zh-Hans"), markup: catalogUsesVCode("Join [here.]({{discordInvite}})") });
  assert.ok(result.defects.includes("MARKUP_LOSS"));
  assert.ok(result.defects.includes("PLACEHOLDER_LOSS"));
});
