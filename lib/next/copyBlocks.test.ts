import { describe, expect, it } from "vitest";

import { createCopyResolver, type CopyBlockRecord } from "./copyBlocks";
import { COPY_BLOCK_DEFAULTS, getCopyBlockDefault } from "../../src/data/content/copyBlocks";

const seededDefault = COPY_BLOCK_DEFAULTS[0];

describe("copy block resolution", () => {
  it("ships a default for every key it advertises", () => {
    expect(COPY_BLOCK_DEFAULTS.length).toBeGreaterThan(0);
    COPY_BLOCK_DEFAULTS.forEach((definition) => {
      expect(getCopyBlockDefault(definition.key)).toEqual(definition);
      if (definition.kind === "list") {
        expect(definition.items?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(definition.body).toBeTruthy();
      }
    });
  });

  it("uses unique keys", () => {
    const keys = COPY_BLOCK_DEFAULTS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("falls back to the checked-in default when Convex holds no row", () => {
    const copy = createCopyResolver([]);
    const resolved = copy.get(seededDefault.key);

    expect(resolved).toMatchObject({ key: seededDefault.key, source: "default" });
    expect(copy.text(seededDefault.key)).toBe(seededDefault.body ?? "");
  });

  it("prefers the stored row over the default", () => {
    const stored: CopyBlockRecord = {
      key: seededDefault.key,
      kind: "plain",
      body: "Edited in the Copy Studio",
      label: seededDefault.label,
      group: seededDefault.group,
    };

    const copy = createCopyResolver([stored]);

    expect(copy.text(seededDefault.key)).toBe("Edited in the Copy Studio");
    expect(copy.get(seededDefault.key)?.source).toBe("convex");
  });

  it("returns empty values for a key nobody knows", () => {
    const copy = createCopyResolver([]);

    expect(copy.get("no-such-copy-block")).toBeNull();
    expect(copy.text("no-such-copy-block")).toBe("");
    expect(copy.items("no-such-copy-block")).toEqual([]);
  });

  it("lists stored rows alongside defaults that were never seeded", () => {
    const copy = createCopyResolver([
      {
        key: "brand-new-block",
        kind: "plain",
        body: "Added in Convex only",
        label: "Brand new",
        group: "Home",
      },
    ]);

    const keys = copy.all().map((block) => block.key);
    expect(keys).toContain("brand-new-block");
    expect(keys).toContain(seededDefault.key);
    expect(keys.length).toBe(COPY_BLOCK_DEFAULTS.length + 1);
  });
});
