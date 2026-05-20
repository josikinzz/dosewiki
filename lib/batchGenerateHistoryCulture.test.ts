import { describe, expect, it } from "vitest";

import {
  buildUserMessage,
  parseGeneratedYaml,
} from "../scripts/batch/history-culture/lib.mjs";
import { applyHistoryCultureUpdate } from "../scripts/batch/history-culture/persist.mjs";

describe("batch history-culture helpers", () => {
  it("parses wrapped history_culture yaml", () => {
    const parsed = parseGeneratedYaml(`
\`\`\`yaml
history_culture:
  content: Overview
  sections:
    - heading: Origins
      content: Started here
\`\`\`
`);

    expect(parsed.content).toBe("Overview");
    expect(parsed.sections).toHaveLength(1);
  });

  it("builds fresh-slate prompt context without the history_culture section", () => {
    const message = buildUserMessage(
      {
        title: "Fixtureamine",
        summary: "summary",
        history_culture: { content: "old", sections: [{ heading: "old", content: "old" }] },
      },
      "quoted sources",
    );

    expect(message).toContain("quoted sources");
    expect(message).toContain("summary:");
    expect(message).not.toContain("history_culture:");
  });

  it("applies generated history_culture through the persistence adapter", () => {
    const article = { title: "Fixtureamine" };
    const updated = applyHistoryCultureUpdate(article, {
      history_culture: { content: "Overview", sections: [] },
    });

    expect(updated.history_culture.content).toBe("Overview");
  });
});
