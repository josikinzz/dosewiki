import { describe, expect, it, vi } from "vitest";

import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { approvedStyleGuide } from "./approvedStyleGuide";
import { promptVersionFor } from "./liveTranslation";
import type { ReviewSnapshot } from "./reviewTypes";
import type { StyleGuideDocument } from "./styleGuideTypes";

vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => ({ sql: vi.fn() }) }));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/data/publicData.substances", () => ({}));

const zh = resolveLocale("zh-Hans");
const glossary = { Phenidate: "Phenidate", Replication: "复现" };
const glosses = { Replication: "Artwork that recreates an effect" };

const snapshot = (document: StyleGuideDocument): ReviewSnapshot => ({ source: "style-guide", context: '{"kind":"style-guide"}', target: JSON.stringify(document) });
const guide: StyleGuideDocument = {
  rules: ["用“服用”描述剂量。"],
  examples: [{ id: "narrative:abc:3", source: "Replications recreate effects.", before: "返回复现", after: "复现作品", why: "Fluency", addedAt: 1 }],
};
const versionOf = (entry: { approved: ReviewSnapshot | null; draft: ReviewSnapshot | null }) => promptVersionFor(zh, glossary, glosses, approvedStyleGuide(entry));

describe("the prompt version digest over the approved style guide", () => {
  it("is unchanged for a locale without an approved guide", () => {
    const before = promptVersionFor(zh, glossary, glosses);
    expect(versionOf({ approved: null, draft: null })).toBe(before);
    expect(versionOf({ approved: null, draft: snapshot(guide) })).toBe(before);
    expect(versionOf({ approved: snapshot({ rules: [], examples: [] }), draft: null })).toBe(before);
  });

  it("changes when an approved rule or example changes", () => {
    const base = versionOf({ approved: snapshot(guide), draft: null });
    expect(base).not.toBe(promptVersionFor(zh, glossary, glosses));
    expect(versionOf({ approved: snapshot({ ...guide, rules: ["用“使用”描述剂量。"] }), draft: null })).not.toBe(base);
    expect(versionOf({ approved: snapshot({ ...guide, examples: [{ ...guide.examples[0], after: "再现作品" }] }), draft: null })).not.toBe(base);
    expect(versionOf({ approved: snapshot({ ...guide }), draft: null })).toBe(base);
  });

  it("does not change when only the draft changes", () => {
    const base = versionOf({ approved: snapshot(guide), draft: null });
    expect(versionOf({ approved: snapshot(guide), draft: snapshot({ ...guide, rules: ["A draft rule."] }) })).toBe(base);
  });

  it("ignores where a promoted example came from", () => {
    const withOrigin = { ...guide, examples: [{ ...guide.examples[0], origin: { kind: "article" as const, slug: "2-benzylpiperidine", segment: "abc", revision: 3 } }] };
    expect(approvedStyleGuide({ approved: snapshot(withOrigin) })?.revision).toBe(approvedStyleGuide({ approved: snapshot(guide) })?.revision);
  });
});
