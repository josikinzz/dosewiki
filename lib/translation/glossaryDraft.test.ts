import { describe, expect, it, vi } from "vitest";

import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { collectGlossaryTerms } from "./glossaryDraft";

vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: () => "postgres",
  getPostgresClient: () => ({ sql: vi.fn() }),
}));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/data/publicData.substances", () => ({}));

const reads = {
  getPublicEffects: async () => [
    { slug: "tracers", name: "Tracers" },
    // Case-collides with the register word "tolerance", which arrives first.
    { slug: "tolerance", name: "Tolerance" },
  ],
} as unknown as PublicDataReadAdapter;

const collected = collectGlossaryTerms(reads);

async function kindOf(term: string): Promise<string | undefined> {
  return (await collected).find((row) => row.term.toLowerCase() === term.toLowerCase())?.kind;
}

describe("collectGlossaryTerms", () => {
  it("enumerates one representative of every kind", async () => {
    await expect(kindOf("Tracers")).resolves.toBe("effect-name");
    await expect(kindOf("Replication")).resolves.toBe("replication");
    await expect(kindOf("Approved replicator")).resolves.toBe("replication");
    await expect(kindOf("Viewing mode")).resolves.toBe("replication");
    await expect(kindOf("Experiential replications")).resolves.toBe("replication");
    await expect(kindOf("Subjective Effect Index")).resolves.toBe("site-name");
    await expect(kindOf("All Effects")).resolves.toBe("index-name");
    await expect(kindOf("Scalines")).resolves.toBe("index-name");
    await expect(kindOf("Amplifications")).resolves.toBe("effect-subcategory");
    await expect(kindOf("Stimulation")).resolves.toBe("effect-subcategory");
    await expect(kindOf("Harm Potential")).resolves.toBe("section-heading");
    await expect(kindOf("Style Variations")).resolves.toBe("section-heading");
    await expect(kindOf("Insufflated")).resolves.toBe("route");
    await expect(kindOf("IV/IM")).resolves.toBe("route");
    await expect(kindOf("Dangerous")).resolves.toBe("enum:interaction-tier");
    await expect(kindOf("Marquis")).resolves.toBe("reagent-name");
    await expect(kindOf("Substituted amphetamine")).resolves.toBe("chemical-class-alias");
  });

  it("keeps the earlier group's kind for a term two groups claim", async () => {
    // "Common" is a frequency label before it is a psychoactive index group.
    await expect(kindOf("Common")).resolves.toBe("frequency");
    // "Psychedelic" is a register word before it is a psychoactive class.
    await expect(kindOf("Psychedelic")).resolves.toBe("register");
    // Replication filters offer the plurals; the register has only the singulars.
    await expect(kindOf("Psychedelics")).resolves.toBe("replication");
    // "Replications" is a replication noun before it is an effect section heading.
    await expect(kindOf("Replications")).resolves.toBe("replication");
    await expect(kindOf("Moderate")).resolves.toBe("enum:dose-tier");
  });

  it("dedupes case-insensitively and sorts by term", async () => {
    const rows = await collected;
    const lowered = rows.map((row) => row.term.toLowerCase());
    expect(new Set(lowered).size).toBe(rows.length);
    // The effect "Tolerance" lost to the register's "tolerance": one row, the first spelling and kind.
    expect(rows.filter((row) => row.term.toLowerCase() === "tolerance")).toEqual([{ term: "tolerance", kind: "register" }]);
    const sorted = [...rows].sort((a, b) => a.term.localeCompare(b.term));
    expect(rows.map((row) => row.term)).toEqual(sorted.map((row) => row.term));
  });
});
