import { describe, expect, it } from "vitest";

import {
  buildUserMessage,
  parseGeneratedYaml,
} from "../scripts/batch/legality/lib.mjs";
import { applyLegalityUpdate } from "../scripts/batch/legality/persist.mjs";

describe("batch legality helpers", () => {
  it("parses wrapped legality yaml", () => {
    const parsed = parseGeneratedYaml(`
\`\`\`yaml
legality:
  international:
    - UN schedule
  countries:
    United States:
      status: Schedule I
      notes: federal
\`\`\`
`);

    expect(parsed.international).toEqual(["UN schedule"]);
    expect(parsed.countries["United States"].status).toBe("Schedule I");
  });

  it("builds fresh-slate legality context without legality section", () => {
    const message = buildUserMessage(
      {
        title: "Fixtureamine",
        summary: "summary",
        legality: { international: ["old"], countries: {} },
      },
      "legality quotes",
    );

    expect(message).toContain("legality quotes");
    expect(message).toContain("summary:");
    expect(message).not.toContain("legality:");
  });

  it("applies generated legality through the persistence adapter", () => {
    const article = { title: "Fixtureamine" };
    const updated = applyLegalityUpdate(article, {
      legality: { international: ["UN"], countries: {} },
    });

    expect(updated.legality.international).toEqual(["UN"]);
  });
});
